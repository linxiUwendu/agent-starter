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
import { prefetchRagRetrieval } from "./travel-prefetch.util";
import {
  buildToolLoopPrompt,
  mockAgentToolStep,
  parseAgentToolStep,
  summarizeToolResult,
  type ToolLoopHistoryEntry,
} from "./travel-tools.util";

/** 工具执行 + Tool Loop + Prompt 格式化 */
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

  /** rules=本地意图规则（默认）；agent=每轮 cursor-agent JSON 规划（慢，需 CLI） */
  private get toolPlannerMode() {
    const mode = this.config.get<string>("TRAVEL_TOOL_PLANNER") ?? "rules";
    return mode === "agent" ? "agent" : "rules";
  }

  private get ragPrefetchEnabled() {
    return this.config.get<string>("TRAVEL_RAG_PREFETCH") !== "false";
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

  /**
   * RAG 预检索 + Tool Loop。
   * 无 OpenAI 时默认 rules 规划（毫秒级）；最终回答由 TravelService 调 cursor-agent。
   */
  async runToolLoop(messages: ChatMessage[], cityHint?: string): Promise<TravelContext> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userMessage = lastUser?.content ?? "";
    const resolvedCity = resolveCityFromConversation(messages, cityHint);
    const cityMeta = this.getCity(resolvedCity);
    const cityName = cityMeta?.name ?? resolvedCity;

    const context = this.createEmptyContext(resolvedCity, cityName);
    const history: ToolLoopHistoryEntry[] = [];
    const toolLoopSteps: ToolLoopStep[] = [];
    const loopStarted = Date.now();

    const useRulesPlanner = this.mockAgent || this.toolPlannerMode === "rules";

    let skipSearchRag = false;
    if (this.ragPrefetchEnabled) {
      const prefetch = await prefetchRagRetrieval(
        this.toolDeps,
        context,
        userMessage,
        resolvedCity,
      );
      if (prefetch.step) {
        toolLoopSteps.push(prefetch.step);
        skipSearchRag = true;
        this.logger.log(`RAG prefetch chunks=${context.ragChunks.length}`);
      }
    }
    this.logger.log(context, '=========> context 1', this.toolDeps);

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      let rawStep: string;

      if (useRulesPlanner) {
        rawStep = mockAgentToolStep(userMessage, resolvedCity, iteration, history, {
          skipSearchRag,
        });
      } else {
        const plannerPrompt = buildToolLoopPrompt({
          city: resolvedCity,
          cityName,
          userMessage,
          iteration,
          maxIterations: this.maxIterations,
          history,
        });
        const plannerStarted = Date.now();
        rawStep = await this.cursorAgent.runCollect(plannerPrompt);
        this.logger.log(
          `Tool planner agent iter=${iteration} ${Date.now() - plannerStarted}ms len=${rawStep.length}`,
        );
      }

      let step = parseAgentToolStep(rawStep);
      if (
        !useRulesPlanner &&
        step.action === "finish" &&
        step.reason === "unparseable agent step" &&
        iteration === 0 &&
        history.length === 0
      ) {
        this.logger.warn(
          `Tool planner non-JSON; falling back to rules. preview=${rawStep.slice(0, 280)}`,
        );
        rawStep = mockAgentToolStep(userMessage, resolvedCity, iteration, history, {
          skipSearchRag,
        });
        step = parseAgentToolStep(rawStep);
      }

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
    this.logger.log(
      `Tool loop done ${Date.now() - loopStarted}ms planner=${useRulesPlanner ? "rules" : "agent"} iters=${toolLoopSteps.length} toolCalls=${context.toolCalls.length} rag=${context.ragChunks.length}`,
    );
    return context;
  }

  formatContextForPrompt(context: TravelContext, options?: { compact?: boolean }) {
    const compact = options?.compact === true;
    const clip = (text: string | null | undefined, max: number) => {
      const s = (text ?? "").replace(/\s+/g, " ").trim();
      if (!compact || s.length <= max) return s;
      return `${s.slice(0, max)}…`;
    };

    const pois = compact ? context.pois.slice(0, 10) : context.pois;
    const photoSpots = compact ? context.photoSpots.slice(0, 6) : context.photoSpots;
    const ragChunks = compact ? context.ragChunks.slice(0, 5) : context.ragChunks;

    const lines: string[] = [`## 检索到的${context.cityName}旅游数据`, ""];

    if (pois.length) {
      lines.push("### POI 列表");
      if (compact && context.pois.length > pois.length) {
        lines.push(`（共 ${context.pois.length} 条，展示前 ${pois.length} 条）`);
      }
      for (const poi of pois) {
        lines.push(
          `- [${poi.type}] ${poi.name}（${poi.price_level ?? "—"}，评分 ${poi.rating ?? "—"}）`,
          `  地址：${poi.address ?? "—"}；最佳时间：${poi.best_time ?? "—"}`,
          `  ${clip(poi.description, 160)}`,
          poi.tips ? `  提示：${clip(poi.tips, 80)}` : "",
        );
      }
      lines.push("");
    }

    if (photoSpots.length) {
      lines.push("### 出片机位");
      for (const spot of photoSpots) {
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

    if (ragChunks.length) {
      lines.push("### 参考文档摘录（RAG）");
      if (compact && context.ragChunks.length > ragChunks.length) {
        lines.push(`（共 ${context.ragChunks.length} 段，展示前 ${ragChunks.length} 段）`);
      }
      for (const chunk of ragChunks) {
        const body = clip(chunk.content.replace(/\n/g, " "), compact ? 420 : 10_000);
        lines.push(`- **${chunk.documentTitle}**`, `  ${body}`, "");
      }
    }

    lines.push("### 已执行工具");
    for (const call of context.toolCalls) {
      lines.push(`- ${call.name}(${JSON.stringify(call.args)}) → ${call.resultCount} 条结果`);
    }

    if (!compact && context.toolLoopSteps?.length) {
      lines.push("", "### Tool Loop 轮次");
      for (const step of context.toolLoopSteps) {
        if (step.iteration < 0) {
          lines.push(
            `- 预检索: ${step.calls?.map((c) => c.name).join(", ") ?? "—"}${step.reason ? ` (${step.reason})` : ""}`,
          );
          continue;
        }
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
