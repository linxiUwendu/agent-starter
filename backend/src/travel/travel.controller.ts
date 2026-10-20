import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Request } from "express";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";

import { getAuthUser, JwtAuthGuard, OptionalJwtAuthGuard } from "../auth/auth.guard";
import { ChatMessageDto } from "../chat/dto/chat-message.dto";
import { TravelService } from "./travel.service";
import { TravelChatRequestDto, UpsertKbDocumentDto } from "./dto/travel.dto";
import { resolveCityId } from "./travel.constants";
import { KbAdminGuard } from "./kb-admin.guard";
import { readKbAdminKey } from "./kb-admin.util";

function normalizeMessages(messages: ChatMessageDto[]) {
  return messages.map((m) => ({ role: m.role, content: m.content.trim() }));
}

/** 旅游模块 HTTP 入口（仅依赖 TravelService 门面） */
@Controller("api/travel")
export class TravelController {
  constructor(
    private readonly travel: TravelService,
    private readonly config: ConfigService,
  ) {}

  @Get("health")
  health() {
    return this.travel.getHealth();
  }

  @Get("cities")
  cities() {
    return this.travel.listCities();
  }

  @Get("food-guide")
  foodGuide(@Query("city") city?: string) {
    return this.travel.getFoodGuide(city);
  }

  @Get("map-markers")
  mapMarkers(@Query("city") city?: string) {
    return this.travel.getMapMarkers(city);
  }

  /** 是否启用知识库运维（仅需配置后端 TRAVEL_KB_ADMIN_KEY，前端据此展示「运维登录」） */
  @Get("rag/admin-config")
  ragAdminConfig() {
    return { enabled: !!readKbAdminKey(this.config) };
  }

  @Post("rag/admin-login")
  ragAdminLogin(@Body("key") key?: string) {
    const expected = readKbAdminKey(this.config);
    if (!expected) return { ok: true as const };
    if (key?.trim() !== expected) {
      throw new ForbiddenException({ error: "Invalid KB admin key." });
    }
    return { ok: true as const };
  }

  @Get("rag/documents")
  @UseGuards(KbAdminGuard)
  ragDocuments(@Query("city") city?: string) {
    return this.travel.listRagDocuments(city);
  }

  @Get("rag/documents/:id")
  @UseGuards(KbAdminGuard)
  ragDocumentDetail(@Param("id") id: string) {
    const doc = this.travel.getRagDocument(id);
    if (!doc) throw new BadRequestException({ error: "Document not found." });
    return doc;
  }

  @Post("rag/documents")
  @UseGuards(KbAdminGuard)
  async upsertRagDocument(@Body() body: UpsertKbDocumentDto) {
    if (!body.cityId?.trim()) {
      throw new BadRequestException({ error: "cityId is required." });
    }
    return this.travel.upsertRagDocument({
      id: body.id,
      cityId: resolveCityId(body.cityId),
      cityIdLocked: body.cityIdLocked ?? true,
      title: body.title.trim(),
      content: body.content.trim(),
      tags: body.tags,
    });
  }

  @Post("rag/documents/upload-pdf")
  @UseGuards(KbAdminGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadRagPdfDocument(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("cityId") cityId?: string,
    @Body("title") title?: string,
  ) {
    if (!cityId?.trim()) {
      throw new BadRequestException({ error: "cityId is required." });
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException({ error: "PDF file is required." });
    }
    const name = file.originalname ?? "upload.pdf";
    const isPdf =
      file.mimetype === "application/pdf" || name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      throw new BadRequestException({ error: "Only PDF files are supported." });
    }

    try {
      return await this.travel.upsertRagDocumentFromPdf({
        cityId: cityId.trim(),
        title: title?.trim(),
        filename: name,
        buffer: file.buffer,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "PDF parse failed.";
      throw new BadRequestException({ error: message });
    }
  }

  @Delete("rag/documents/:id")
  @UseGuards(KbAdminGuard)
  deleteRagDocument(@Param("id") id: string) {
    const ok = this.travel.deleteRagDocument(id);
    if (!ok) throw new BadRequestException({ error: "Document not found." });
    return { ok: true, id };
  }

  @Get("conversations")
  @UseGuards(JwtAuthGuard)
  listConversations(@Req() req: Request) {
    return this.travel.listConversations(getAuthUser(req)!.id);
  }

  @Post("conversations")
  @UseGuards(JwtAuthGuard)
  createConversation(@Req() req: Request, @Body() body: { city?: string; title?: string }) {
    return this.travel.createConversation(
      getAuthUser(req)!.id,
      body.city ? resolveCityId(body.city) : undefined,
      body.title?.trim() || "新对话",
    );
  }

  @Get("conversations/:id")
  @UseGuards(JwtAuthGuard)
  getConversation(@Req() req: Request, @Param("id") id: string) {
    const conversation = this.travel.getConversation(id, getAuthUser(req)!.id);
    if (!conversation) throw new BadRequestException({ error: "Conversation not found." });
    return conversation;
  }

  @Delete("conversations/:id")
  @UseGuards(JwtAuthGuard)
  deleteConversation(@Req() req: Request, @Param("id") id: string) {
    const ok = this.travel.deleteConversation(id, getAuthUser(req)!.id);
    if (!ok) throw new BadRequestException({ error: "Conversation not found." });
    return { ok: true, id };
  }

  @Post("chat")
  @UseGuards(OptionalJwtAuthGuard)
  async chat(@Req() req: Request, @Body() body: TravelChatRequestDto, @Res() res: Response) {
    const messages = normalizeMessages(body.messages ?? []);
    if (messages.length === 0) {
      throw new BadRequestException({ error: "messages is required." });
    }
    const user = getAuthUser(req);
    try {
      await this.travel.streamTravelChat(messages, res, body.city, body.conversationId, user?.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Travel chat failed.";
      if (!res.headersSent) {
        throw new BadRequestException({ error: message });
      }
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}
