import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { ChatMessage } from "../agent/agent.constants";
import { CursorAgentService } from "../chat/cursor-agent.service";
import { RagService } from "./rag/rag.service";
import { PoiService } from "./poi.service";
import type { ToolLoopStep, TravelContext } from "./travel.types";
import {
  TRAVEL_TOOLS,
  resolveCityFromConversation,
  type TravelToolName,
} from "./travel.constants";
import {
  executeTravelTool,
  mergeTravelToolResult,
  type TravelToolDeps,
} from "./travel-tool.registry";
import {
  buildToolLoopPrompt,
  mockAgentToolStep,
  parseAgentToolStep,
  summarizeToolResult,
  type ToolLoopHistoryEntry,
} from "./travel-tools.util";

/** 工具执行 + Agent Tool Loop + Prompt 格式化 */
@Injectable()
export class TravelToolsService {
  private readonly logger = new Logger(TravelToolsService.name);
  private readonly toolDeps: TravelToolDeps;

  constructor(
    private readonly poiService: PoiService,
    private readonly ragService: RagService,
    private readonly cursorAgent: CursorAgentService,
    private readonly config: ConfigService,
  ) {
    this.toolDeps = { poiService, ragService };
  }

  private get maxIterations() {
    return Number(this.config.get<string>("TRAVEL_TOOL_LOOP_MAX_ITERATIONS") ?? 5);
  }

  private get mockAgent() {
    return this.config.get<string>("MOCK_AGENT") === "true";
  }

  getToolDefinitions() {
    return TRAVEL_TOOLS;
  }

  getCity(cityId: string) {
    return this.poiService.getCity(cityId);
  }

  createEmptyContext(city: string, cityName: string): TravelContext {
    return {
      city,
      cityName,
      pois: [],
      photoSpots: [],
      itinerary: null,
      toolCalls: [],
      ragChunks: [],
      ragMeta: null,
      toolLoopSteps: [],
    };
  }

  executeTool(name: TravelToolName, args: Record<string, unknown> = {}) {
    return executeTravelTool(this.toolDeps, name, args) as unknown | Promise<unknown>;
  }

  mergeToolResult(
    context: TravelContext,
    name: TravelToolName,
    args: Record<string, unknown>,
    result: unknown,
  ): number {
    return mergeTravelToolResult(context, name, args, result);
  }

  /** Agent 选工具 → 服务端执行 → 回传，直至 finish 或达轮次上限。 */
  async runToolLoop(messages: ChatMessage[], cityHint?: string): Promise<TravelContext> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userMessage = lastUser?.content ?? "";
    const resolvedCity = resolveCityFromConversation(messages, cityHint);
    const cityMeta = this.getCity(resolvedCity);
    const cityName = cityMeta?.name ?? resolvedCity;

    const context = this.createEmptyContext(resolvedCity, cityName);
    const history: ToolLoopHistoryEntry[] = [];
    const toolLoopSteps: ToolLoopStep[] = [];

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      const plannerPrompt = buildToolLoopPrompt({
        city: resolvedCity,
        cityName,
        userMessage,
        iteration,
        maxIterations: this.maxIterations,
        history,
      });

      const rawStep = this.mockAgent
        ? mockAgentToolStep(userMessage, resolvedCity, iteration, history)
        : await this.cursorAgent.runCollect(plannerPrompt);

      const step = parseAgentToolStep(rawStep);
      this.logger.debug(`tool loop iter=${iteration} action=${step.action}`);

      if (step.action === "finish") {
        toolLoopSteps.push({ iteration, action: "finish", reason: step.reason });
        break;
      }

      const executedCalls: ToolLoopStep["calls"] = [];
      const summaries: string[] = [];

      for (const call of step.calls) {
        const result = await Promise.resolve(this.executeTool(call.name, call.args));
        const resultCount = this.mergeToolResult(context, call.name, call.args, result);
        executedCalls.push({ name: call.name, args: call.args, resultCount });
        summaries.push(`${call.name}: ${summarizeToolResult(call.name, result)}`);
      }

      toolLoopSteps.push({ iteration, action: "tool_calls", calls: executedCalls });
      history.push({ iteration, calls: step.calls, summary: summaries.join("; ") });
    }

    context.toolLoopSteps = toolLoopSteps;
    return context;
  }

  formatContextForPrompt(context: TravelContext) {
    const lines: string[] = [`## 检索到的${context.cityName}旅游数据`, ""];

    if (context.pois.length) {
      lines.push("### POI 列表");
      for (const poi of context.pois) {
        lines.push(
          `- [${poi.type}] ${poi.name}（${poi.price_level ?? "—"}，评分 ${poi.rating ?? "—"}）`,
          `  地址：${poi.address ?? "—"}；最佳时间：${poi.best_time ?? "—"}`,
          `  ${poi.description ?? ""}`,
          poi.tips ? `  提示：${poi.tips}` : "",
        );
      }
      lines.push("");
    }

    if (context.photoSpots.length) {
      lines.push("### 出片机位");
      for (const spot of context.photoSpots) {
        lines.push(
          `- ${spot.name}${spot.poi_name ? `（${spot.poi_name}）` : ""}`,
          `  角度：${spot.angle ?? "—"}；光线：${spot.best_light ?? "—"}`,
          `  ${spot.description ?? ""}`,
        );
      }
      lines.push("");
    }

    if (context.itinerary) {
      lines.push(`### 参考行程：${context.itinerary.title}`, context.itinerary.summary ?? "");
      for (const item of context.itinerary.items) {
        lines.push(
          `- Day${item.day} ${item.time_slot ?? ""} ${item.poi?.name ?? "自由活动"}${item.note ? `（${item.note}）` : ""}`,
        );
      }
      lines.push("");
    }

    if (context.ragChunks.length) {
      lines.push("### 参考文档摘录（RAG）");
      for (const chunk of context.ragChunks) {
        lines.push(`- **${chunk.documentTitle}**`, `  ${chunk.content.replace(/\n/g, "\n  ")}`, "");
      }
    }

    lines.push("### 已执行工具");
    for (const call of context.toolCalls) {
      lines.push(`- ${call.name}(${JSON.stringify(call.args)}) → ${call.resultCount} 条结果`);
    }

    if (context.toolLoopSteps?.length) {
      lines.push("", "### Tool Loop 轮次");
      for (const step of context.toolLoopSteps) {
        if (step.action === "finish") {
          lines.push(`- 第 ${step.iteration + 1} 轮: finish${step.reason ? ` (${step.reason})` : ""}`);
        } else {
          lines.push(
            `- 第 ${step.iteration + 1} 轮: ${step.calls?.map((c) => c.name).join(", ") ?? ""}`,
          );
        }
      }
    }

    return lines.filter(Boolean).join("\n");
  }
}
