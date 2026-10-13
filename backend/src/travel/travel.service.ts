import { Injectable, Logger } from "@nestjs/common";
import type { Response } from "express";
import { randomUUID } from "node:crypto";

import { ChatMessage } from "../agent/agent.constants";
import { createSseSession, streamTextAsDeltas } from "../common/sse.util";
import { CursorAgentService } from "../chat/cursor-agent.service";
import { ConversationRepository } from "./database/repositories/conversation.repository";
import { PoiService } from "./poi.service";
import { RagService } from "./rag/rag.service";
import { DEFAULT_CITY, getTravelSystemPrompt, resolveCityId } from "./travel.constants";
import { TravelToolsService } from "./travel-tools.service";
import type {
  ConversationDetail,
  ConversationSummary,
  GetItineraryParams,
  SearchPoiParams,
  TravelContext,
} from "./travel.types";

/**
 * 旅游模块统一门面：HTTP 层只依赖此 Service。
 * 内部委托 Poi / RAG / Tools / Conversation / Agent。
 */
@Injectable()
export class TravelService {
  private readonly logger = new Logger(TravelService.name);

  constructor(
    private readonly cursorAgent: CursorAgentService,
    private readonly travelTools: TravelToolsService,
    private readonly poiService: PoiService,
    private readonly ragService: RagService,
    private readonly conversations: ConversationRepository,
  ) {}

  // ── Health / Meta ─────────────────────────────────────────

  getHealth() {
    return {
      ok: true,
      defaultCity: DEFAULT_CITY,
      name: "AI 旅游助手（RAG + Tool Loop）",
      cities: this.poiService.listCities().length,
      tools: this.travelTools.getToolDefinitions().map((t) => t.name),
      toolLoop: true,
      rag: this.ragService.getStats(),
    };
  }

  getToolDefinitions() {
    return this.travelTools.getToolDefinitions();
  }

  // ── POI ───────────────────────────────────────────────────

  listCities() {
    return this.poiService.listCities();
  }

  getFoodGuide(city?: string) {
    return this.poiService.getFoodGuide(resolveCityId(city));
  }

  searchPois(params: SearchPoiParams) {
    return this.poiService.searchPoi(params);
  }

  getPhotoSpots(city?: string, query?: string, limit = 20) {
    return this.poiService.getPhotoSpots({ city: resolveCityId(city), query, limit });
  }

  listItineraries(city?: string) {
    return this.poiService.listItineraries(resolveCityId(city));
  }

  suggestItinerary(params: GetItineraryParams) {
    return this.poiService.findItinerary({ ...params, city: resolveCityId(params.city) });
  }

  getItinerary(id: string) {
    return this.poiService.getItinerary(id);
  }

  getMapMarkers(city?: string) {
    return this.poiService.getAllMapMarkers(resolveCityId(city));
  }

  // ── RAG ───────────────────────────────────────────────────

  ragSearch(q: string, city?: string, _provider?: string) {
    const cityId = resolveCityId(city);
    return this.ragService.retrieveWithMetaAsync(q, cityId, 8);
  }

  listRagDocuments(city?: string) {
    return {
      stats: this.ragService.getStats(),
      documents: this.ragService.listDocuments(city ? resolveCityId(city) : undefined),
    };
  }

  getRagDocument(id: string) {
    return this.ragService.getDocument(id);
  }

  upsertRagDocument(input: {
    id?: string;
    cityId?: string | null;
    title: string;
    content: string;
    tags?: string[];
  }) {
    return this.ragService.upsertDocument({
      ...input,
      cityId: input.cityId ? resolveCityId(input.cityId) : null,
    });
  }

  deleteRagDocument(id: string) {
    return this.ragService.deleteDocument(id);
  }

  // ── Conversations ─────────────────────────────────────────

  createConversation(cityId?: string, title = "新对话"): ConversationDetail {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.conversations.insertConversation(id, title, cityId ?? null, now);
    return this.getConversation(id)!;
  }

  listConversations(limit = 30): ConversationSummary[] {
    return this.conversations.listSummaries(limit).map((row) => ({
      id: row.id,
      title: row.title,
      cityId: row.city_id,
      messageCount: row.message_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getConversation(id: string): ConversationDetail | null {
    const row = this.conversations.findById(id);
    if (!row) return null;

    const messages = this.conversations.findMessages(id);
    return {
      id: row.id,
      title: row.title,
      cityId: row.city_id,
      messageCount: messages.length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    };
  }

  deleteConversation(id: string) {
    return this.conversations.deleteById(id);
  }

  private appendExchange(
    conversationId: string | undefined,
    userContent: string,
    assistantContent: string,
    cityId?: string,
  ): string {
    let id = conversationId;
    const now = new Date().toISOString();

    if (!id || !this.getConversation(id)) {
      const title = userContent.trim().slice(0, 40) || "新对话";
      id = randomUUID();
      this.conversations.insertConversation(id, title, cityId ?? null, now);
    } else if (cityId) {
      this.conversations.updateCityAndTimestamp(id, cityId, now);
    }

    const sortBase = this.conversations.nextMessageSortOrder(id);
    this.conversations.insertMessage(randomUUID(), id, "user", userContent, sortBase, now);
    this.conversations.insertMessage(
      randomUUID(),
      id,
      "assistant",
      assistantContent,
      sortBase + 1,
      now,
    );
    this.conversations.touchUpdatedAt(id, now);
    return id;
  }

  // ── Chat SSE ──────────────────────────────────────────────

  private buildTravelPrompt(messages: ChatMessage[], context: TravelContext) {
    const transcript = messages
      .slice(-10)
      .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
      .join("\n\n");

    return [
      getTravelSystemPrompt(context.cityName),
      "",
      this.travelTools.formatContextForPrompt(context),
      "",
      "下面是当前对话。请基于上面的数据回答最后一个用户问题。",
      "",
      transcript,
    ].join("\n");
  }

  private buildFallbackAnswer(context: TravelContext, userMessage: string) {
    const parts = [`## ${context.cityName}旅行建议`, "", `针对你的问题：${userMessage}`, ""];

    if (context.itinerary) {
      parts.push(`### 推荐行程：${context.itinerary.title}`, context.itinerary.summary ?? "", "");
      for (const item of context.itinerary.items) {
        parts.push(
          `- **Day ${item.day} ${item.time_slot ?? ""}** ${item.poi?.name ?? "自由活动"}${item.note ? ` — ${item.note}` : ""}`,
        );
      }
      parts.push("");
    }

    const foods = context.pois.filter((p) => p.type === "food").slice(0, 6);
    if (foods.length) {
      parts.push("### 美食推荐", ...foods.map((p) => `- **${p.name}**：${p.description ?? ""}`), "");
    }

    const spots = context.pois.filter((p) => p.type === "attraction").slice(0, 4);
    if (spots.length) {
      parts.push("### 景点推荐", ...spots.map((p) => `- **${p.name}**：${p.description ?? ""}`), "");
    }

    if (context.ragChunks.length) {
      parts.push("### 参考攻略摘录");
      for (const chunk of context.ragChunks.slice(0, 3)) {
        parts.push(`**${chunk.documentTitle}**`, chunk.content, "");
      }
    }

    return parts.join("\n").trimEnd();
  }

  async streamTravelChat(
    messages: ChatMessage[],
    res: Response,
    cityHint?: string,
    conversationId?: string,
  ) {
    const context = await this.travelTools.runToolLoop(messages, cityHint);
    const prompt = this.buildTravelPrompt(messages, context);
    const sse = createSseSession(res);
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userContent = lastUser?.content ?? "";

    sse.send("start", {});
    sse.send("context", {
      city: context.city,
      cityName: context.cityName,
      pois: context.pois,
      photoSpots: context.photoSpots,
      itinerary: context.itinerary,
      toolCalls: context.toolCalls,
      ragChunks: context.ragChunks,
      ragMeta: context.ragMeta,
      toolLoopSteps: context.toolLoopSteps,
    });

    this.logger.log(
      `travel chat city=${context.city} tools=${context.toolCalls.length} pois=${context.pois.length} rag=${context.ragChunks.length}`,
    );

    const finish = (answer: string, fallback = false) => {
      let savedConversationId = conversationId;
      if (userContent && answer) {
        savedConversationId = this.appendExchange(conversationId, userContent, answer, context.city);
      }
      sse.finish("done", {
        answer,
        context,
        fallback,
        conversationId: savedConversationId,
      });
    };

    try {
      const answer = await this.cursorAgent.run(prompt, sse.pushDelta);
      if (sse.streamedChars() === 0 && answer) {
        await streamTextAsDeltas(sse.pushDelta, answer);
      }
      finish(answer);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.warn(`cursor-agent failed, using fallback: ${message}`);
      const fallback = this.buildFallbackAnswer(context, userContent);
      await streamTextAsDeltas(sse.pushDelta, fallback);
      finish(fallback, true);
    }
  }
}
