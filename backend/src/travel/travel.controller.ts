import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";

import { ChatMessageDto } from "../chat/dto/chat-message.dto";
import { TravelService } from "./travel.service";
import { ItineraryQueryDto, SearchPoiQueryDto, TravelChatRequestDto, UpsertKbDocumentDto } from "./dto/travel.dto";
import { resolveCityId } from "./travel.constants";

function normalizeMessages(messages: ChatMessageDto[]) {
  return messages.map((m) => ({ role: m.role, content: m.content.trim() }));
}

/** 旅游模块 HTTP 入口（仅依赖 TravelService 门面） */
@Controller("api/travel")
export class TravelController {
  constructor(private readonly travel: TravelService) {}

  @Get("health")
  health() {
    return this.travel.getHealth();
  }

  @Get("cities")
  cities() {
    return this.travel.listCities();
  }

  @Get("tools")
  tools() {
    return this.travel.getToolDefinitions();
  }

  @Get("food-guide")
  foodGuide(@Query("city") city?: string) {
    return this.travel.getFoodGuide(city);
  }

  @Get("pois")
  searchPois(@Query() query: SearchPoiQueryDto) {
    return this.travel.searchPois({
      city: resolveCityId(query.city),
      query: query.q,
      type: query.type ?? "all",
      limit: query.limit,
    });
  }

  @Get("photo-spots")
  photoSpots(@Query("city") city?: string, @Query("q") q?: string) {
    return this.travel.getPhotoSpots(city, q);
  }

  @Get("itineraries")
  itineraries(@Query("city") city?: string) {
    return this.travel.listItineraries(city);
  }

  @Get("itinerary-suggest")
  suggestItinerary(@Query() query: ItineraryQueryDto) {
    return this.travel.suggestItinerary(query);
  }

  @Get("itineraries/:id")
  itineraryDetail(@Param("id") id: string) {
    const detail = this.travel.getItinerary(id);
    if (!detail) throw new BadRequestException({ error: "Itinerary not found." });
    return detail;
  }

  @Get("map-markers")
  mapMarkers(@Query("city") city?: string) {
    return this.travel.getMapMarkers(city);
  }

  @Get("rag/search")
  async ragSearch(
    @Query("q") q?: string,
    @Query("city") city?: string,
    @Query("provider") provider?: string,
  ) {
    if (!q?.trim()) throw new BadRequestException({ error: "q is required." });
    return this.travel.ragSearch(q.trim(), city, provider);
  }

  @Get("rag/documents")
  ragDocuments(@Query("city") city?: string) {
    return this.travel.listRagDocuments(city);
  }

  @Get("rag/documents/:id")
  ragDocumentDetail(@Param("id") id: string) {
    const doc = this.travel.getRagDocument(id);
    if (!doc) throw new BadRequestException({ error: "Document not found." });
    return doc;
  }

  @Post("rag/documents")
  upsertRagDocument(@Body() body: UpsertKbDocumentDto) {
    return this.travel.upsertRagDocument({
      id: body.id,
      cityId: body.cityId ? resolveCityId(body.cityId) : null,
      title: body.title.trim(),
      content: body.content.trim(),
      tags: body.tags,
    });
  }

  @Delete("rag/documents/:id")
  deleteRagDocument(@Param("id") id: string) {
    const ok = this.travel.deleteRagDocument(id);
    if (!ok) throw new BadRequestException({ error: "Document not found." });
    return { ok: true, id };
  }

  @Get("conversations")
  listConversations() {
    return this.travel.listConversations();
  }

  @Post("conversations")
  createConversation(@Body() body: { city?: string; title?: string }) {
    return this.travel.createConversation(
      body.city ? resolveCityId(body.city) : undefined,
      body.title?.trim() || "新对话",
    );
  }

  @Get("conversations/:id")
  getConversation(@Param("id") id: string) {
    const conversation = this.travel.getConversation(id);
    if (!conversation) throw new BadRequestException({ error: "Conversation not found." });
    return conversation;
  }

  @Delete("conversations/:id")
  deleteConversation(@Param("id") id: string) {
    const ok = this.travel.deleteConversation(id);
    if (!ok) throw new BadRequestException({ error: "Conversation not found." });
    return { ok: true, id };
  }

  @Post("chat")
  async chat(@Body() body: TravelChatRequestDto, @Res() res: Response) {
    const messages = normalizeMessages(body.messages ?? []);
    if (messages.length === 0) {
      throw new BadRequestException({ error: "messages is required." });
    }
    await this.travel.streamTravelChat(messages, res, body.city, body.conversationId);
  }
}
