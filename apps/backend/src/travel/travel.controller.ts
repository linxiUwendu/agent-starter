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

import { JwtAuthGuard, OptionalJwtAuthGuard } from "../auth/auth.guard";
import { getAuthUser } from "../auth/auth.session";
import { ChatMessageDto } from "../agent/dto";
import { OptionalCityQueryDto, ResourceIdParamDto, UuidParamDto } from "../common/dto";
import { TravelService } from "./travel.service";
import {
  CreateConversationDto,
  RagAdminLoginDto,
  TravelChatRequestDto,
  UploadRagPdfBodyDto,
  UpsertKbDocumentDto,
} from "./dto";
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
  foodGuide(@Query() query: OptionalCityQueryDto) {
    return this.travel.getFoodGuide(query.city);
  }

  @Get("map-markers")
  mapMarkers(@Query() query: OptionalCityQueryDto) {
    return this.travel.getMapMarkers(query.city);
  }

  /** 是否启用知识库运维（仅需配置后端 TRAVEL_KB_ADMIN_KEY，前端据此展示「运维登录」） */
  @Get("rag/admin-config")
  ragAdminConfig() {
    return { enabled: !!readKbAdminKey(this.config) };
  }

  @Post("rag/admin-login")
  ragAdminLogin(@Body() body: RagAdminLoginDto) {
    const expected = readKbAdminKey(this.config);
    if (!expected) return { ok: true as const };
    if (body.key?.trim() !== expected) {
      throw new ForbiddenException({ error: "Invalid KB admin key." });
    }
    return { ok: true as const };
  }

  @Get("rag/documents")
  @UseGuards(KbAdminGuard)
  ragDocuments(@Query() query: OptionalCityQueryDto) {
    return this.travel.listRagDocuments(query.city);
  }

  @Get("rag/documents/:id")
  @UseGuards(KbAdminGuard)
  ragDocumentDetail(@Param() params: ResourceIdParamDto) {
    const doc = this.travel.getRagDocument(params.id);
    if (!doc) throw new BadRequestException({ error: "Document not found." });
    return doc;
  }

  @Post("rag/documents")
  @UseGuards(KbAdminGuard)
  async upsertRagDocument(@Body() body: UpsertKbDocumentDto) {
    return this.travel.upsertRagDocument({
      id: body.id,
      cityId: resolveCityId(body.cityId),
      cityIdLocked: body.cityIdLocked ?? true,
      title: body.title,
      content: body.content,
      tags: body.tags,
    });
  }

  @Post("rag/documents/upload-pdf")
  @UseGuards(KbAdminGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadRagPdfDocument(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadRagPdfBodyDto,
  ) {
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
        cityId: body.cityId,
        title: body.title,
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
  deleteRagDocument(@Param() params: ResourceIdParamDto) {
    const ok = this.travel.deleteRagDocument(params.id);
    if (!ok) throw new BadRequestException({ error: "Document not found." });
    return { ok: true, id: params.id };
  }

  @Get("conversations")
  @UseGuards(JwtAuthGuard)
  listConversations(@Req() req: Request) {
    return this.travel.listConversations(getAuthUser(req)!.id);
  }

  @Post("conversations")
  @UseGuards(JwtAuthGuard)
  createConversation(@Req() req: Request, @Body() body: CreateConversationDto) {
    return this.travel.createConversation(
      getAuthUser(req)!.id,
      body.city ? resolveCityId(body.city) : undefined,
      body.title || "新对话",
    );
  }

  @Get("conversations/:id")
  @UseGuards(JwtAuthGuard)
  getConversation(@Req() req: Request, @Param() params: UuidParamDto) {
    const conversation = this.travel.getConversation(params.id, getAuthUser(req)!.id);
    if (!conversation) throw new BadRequestException({ error: "Conversation not found." });
    return conversation;
  }

  @Delete("conversations/:id")
  @UseGuards(JwtAuthGuard)
  deleteConversation(@Req() req: Request, @Param() params: UuidParamDto) {
    const ok = this.travel.deleteConversation(params.id, getAuthUser(req)!.id);
    if (!ok) throw new BadRequestException({ error: "Conversation not found." });
    return { ok: true, id: params.id };
  }

  @Post("chat")
  @UseGuards(OptionalJwtAuthGuard)
  async chat(@Req() req: Request, @Body() body: TravelChatRequestDto, @Res() res: Response) {
    const messages = normalizeMessages(body.messages);
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
