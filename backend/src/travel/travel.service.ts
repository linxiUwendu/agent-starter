import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { randomUUID } from "node:crypto";

import { AuthService } from "../auth/auth.service";
import { ChatMessage } from "../agent/agent.constants";
import { createSseSession, streamTextAsDeltas } from "../common/sse.util";
import { CursorAgentService } from "../chat/cursor-agent.service";
import { formatMemoryForPrompt } from "./user-memory.util";
import { ConversationRepository } from "./database/repositories/conversation.repository";
import { PoiService } from "./poi.service";
import { RagService } from "./rag/rag.service";
import {
  DEFAULT_CITY,
  getTravelSystemPrompt,
  resolveCityId,
  resolveKbDocumentCity,
} from "./travel.constants";
import { extractTextFromPdf } from "./rag/pdf-text.util";
import { TravelToolsService } from "./travel-tools.service";
import type { ConversationDetail, ConversationSummary, TravelContext } from "./travel.types";

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
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** cursor=调 CLI 写回答；fallback=仅用 POI/RAG 模板摘要（不调 cursor，避免 ETIMEDOUT 空等） */
  private get travelAnswerMode() {
    const mode = this.config.get<string>("TRAVEL_ANSWER") ?? "cursor";
    return mode === "fallback" ? "fallback" : "cursor";
  }

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

  // ── POI ───────────────────────────────────────────────────

  listCities() {
    return this.poiService.listCities();
  }

  getFoodGuide(city?: string) {
    return this.poiService.getFoodGuide(resolveCityId(city));
  }

  getMapMarkers(city?: string) {
    return this.poiService.getAllMapMarkers(resolveCityId(city));
  }

  // ── RAG ───────────────────────────────────────────────────

  listRagDocuments(city?: string) {
    return {
      stats: this.ragService.getStats(),
      documents: this.ragService.listDocuments(city ? resolveCityId(city) : undefined),
    };
  }

  getRagDocument(id: string) {
    return this.ragService.getDocument(id);
  }

  async upsertRagDocument(input: {
    id?: string;
    cityId?: string | null;
    cityIdLocked?: boolean;
    title: string;
    content: string;
    tags?: string[];
    source?: string;
  }) {
    const { cityId: resolvedCityId, warning: cityIdWarning } = resolveKbDocumentCity({
      cityId: input.cityId,
      title: input.title,
      content: input.content,
      cityIdLocked: input.cityIdLocked,
    });

    if (!resolvedCityId) {
      throw new BadRequestException({ error: "cityId is required for knowledge base documents." });
    }

    if (!this.poiService.getCity(resolvedCityId)) {
      throw new BadRequestException({
        error: `Invalid cityId: ${resolvedCityId}. Use an id from GET /api/travel/cities.`,
      });
    }

    const saved = await this.ragService.upsertDocument({
      ...input,
      cityId: resolvedCityId,
    });

    return { ...saved, cityIdResolved: resolvedCityId, cityIdWarning };
  }

  async upsertRagDocumentFromPdf(input: {
    cityId: string;
    title?: string;
    filename: string;
    buffer: Buffer;
  }) {
    const content = await extractTextFromPdf(input.buffer);
    const title =
      input.title?.trim() ||
      input.filename.replace(/\.pdf$/i, "").trim() ||
      "PDF 文档";

    return this.upsertRagDocument({
      cityId: resolveCityId(input.cityId),
      cityIdLocked: true,
      title,
      content,
      tags: ["pdf"],
      source: "pdf",
    });
  }

  deleteRagDocument(id: string) {
    return this.ragService.deleteDocument(id);
  }

  // ── Conversations ─────────────────────────────────────────

  createConversation(userId: string, cityId?: string, title = "新对话"): ConversationDetail {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.conversations.insertConversation(id, title, cityId ?? null, now, userId);
    return this.getConversation(id, userId)!;
  }

  listConversations(userId: string, limit = 30): ConversationSummary[] {
    return this.conversations.listSummaries(limit, userId).map((row) => ({
      id: row.id,
      title: row.title,
      cityId: row.city_id,
      messageCount: row.message_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getConversation(id: string, userId: string): ConversationDetail | null {
    const row = this.conversations.findById(id, userId);
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

  deleteConversation(id: string, userId: string) {
    return this.conversations.deleteById(id, userId);
  }

  private appendExchange(
    userId: string,
    conversationId: string | undefined,
    userContent: string,
    assistantContent: string,
    cityId?: string,
  ): string {
    let id = conversationId;
    const now = new Date().toISOString();

    if (!id || !this.getConversation(id, userId)) {
      const title = userContent.trim().slice(0, 40) || "新对话";
      id = randomUUID();
      this.conversations.insertConversation(id, title, cityId ?? null, now, userId);
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

  private buildTravelPrompt(messages: ChatMessage[], context: TravelContext, memoryMd?: string) {
    const transcript = messages
      .slice(-10)
      .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
      .join("\n\n");

    const memoryBlock = formatMemoryForPrompt(memoryMd ?? "");

    return [
      getTravelSystemPrompt(context.cityName),
      "",
      memoryBlock,
      this.travelTools.formatContextForPrompt(context, { compact: true }),
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
    userId?: string | null,
  ) {
    const sse = createSseSession(res);
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userContent = lastUser?.content ?? "";

    sse.send("start", {});
    sse.send("phase", { stage: "retrieving" });

    if (userId && userContent) {
      this.auth.updateMemoryFromUserMessage(userId, userContent);
    }
    const memoryMd = userId ? this.auth.getMemoryMarkdown(userId) : "";

    const finish = (answer: string, context: TravelContext, fallback = false) => {
      let savedConversationId = conversationId;
      try {
        if (userId && userContent && answer) {
          savedConversationId = this.appendExchange(
            userId,
            conversationId,
            userContent,
            answer,
            context.city,
          );
        }
        sse.finish("done", {
          answer,
          context,
          fallback,
          conversationId: savedConversationId,
        });
      } catch (finishError) {
        const msg = finishError instanceof Error ? finishError.message : String(finishError);
        this.logger.error(`travel chat finish failed: ${msg}`);
        sse.finish("done", { answer, fallback: true, conversationId: savedConversationId });
      }
    };

    const sendContext = (context: TravelContext) => {
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
    };

    const deliverFallbackAnswer = async (
      context: TravelContext,
      reason: string,
      cursorTimedOut = false,
    ) => {
      this.logger.warn(`travel chat using fallback answer: ${reason.slice(0, 200)}`);
      let fallback = this.buildFallbackAnswer(context, userContent);
      if (cursorTimedOut) {
        fallback = [
          fallback,
          "",
          "---",
          "*Cursor 云端连接超时，以上为基于 POI/RAG 检索的离线摘要。可在 `.env` 设 `TRAVEL_ANSWER=fallback` 跳过 cursor，或修复 cursor-agent 网络/登录。*",
        ].join("\n");
      }
      await streamTextAsDeltas(sse.pushDelta, fallback);
      finish(fallback, context, true);
    };

    try {
      const loopStarted = Date.now();
      const context = await this.travelTools.runToolLoop(messages, cityHint);
      const loopMs = Date.now() - loopStarted;
      sendContext(context);

      this.logger.log(
        `travel chat retrieve=${loopMs}ms city=${context.city} tools=${context.toolCalls.length} pois=${context.pois.length} rag=${context.ragChunks.length}`,
      );

      sse.send("phase", { stage: "generating" });

      if (this.travelAnswerMode === "fallback") {
        await deliverFallbackAnswer(context, "TRAVEL_ANSWER=fallback");
        return;
      }

      const prompt = this.buildTravelPrompt(messages, context, memoryMd);

      try {
        const genStarted = Date.now();
        const answer = await this.cursorAgent.run(prompt, sse.pushDelta);
        this.logger.log(
          `travel chat generate=${Date.now() - genStarted}ms answerLen=${answer.length} streamed=${sse.streamedChars()}`,
        );
        if (sse.streamedChars() === 0 && answer) {
          await streamTextAsDeltas(sse.pushDelta, answer);
        }
        finish(answer, context);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const timedOut = /ETIMEDOUT|ECONNRESET|\[unavailable\]/i.test(message);
        await deliverFallbackAnswer(context, message, timedOut);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`travel chat failed before/during retrieve: ${message}`);
      if (!res.headersSent) {
        throw error;
      }
      sse.finish("error", { error: message });
    }
  }
}
