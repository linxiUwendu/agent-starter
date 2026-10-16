import { TRAVEL_TOOLS, type TravelToolName } from "./travel.constants";
import { getToolMergeStrategy } from "./travel-tool.registry";

export type AgentToolCall = {
  name: TravelToolName;
  args: Record<string, unknown>;
};

export type AgentToolStep =
  | { action: "tool_calls"; calls: AgentToolCall[] }
  | { action: "finish"; reason?: string };

export type ToolLoopHistoryEntry = {
  iteration: number;
  calls: AgentToolCall[];
  summary: string;
};

const VALID_TOOL_NAMES = new Set<string>(TRAVEL_TOOLS.map((t) => t.name));

/** 从模型输出中提取含 "action" 的 JSON 对象（兼容前后夹杂说明文字） */
export function extractToolStepJson(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) return fenced[1].trim();

  const actionIdx = trimmed.search(/"action"\s*:/);
  if (actionIdx < 0) return trimmed;

  const start = trimmed.lastIndexOf("{", actionIdx);
  if (start < 0) return trimmed;

  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }

  return trimmed;
}

function parseToolStepObject(parsed: Record<string, unknown>): AgentToolStep | null {
  if (parsed.action === "finish") {
    return { action: "finish", reason: typeof parsed.reason === "string" ? parsed.reason : undefined };
  }

  if (parsed.action === "tool_calls" && Array.isArray(parsed.calls)) {
    const calls: AgentToolCall[] = [];
    for (const item of parsed.calls) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const obj = item as Record<string, unknown>;
      const name = String(obj.name ?? "");
      if (!VALID_TOOL_NAMES.has(name)) continue;
      const args =
        obj.args && typeof obj.args === "object" && !Array.isArray(obj.args)
          ? (obj.args as Record<string, unknown>)
          : {};
      calls.push({ name: name as TravelToolName, args });
    }
    if (calls.length) return { action: "tool_calls", calls };
  }

  return null;
}

export function parseAgentToolStep(raw: string): AgentToolStep {
  const trimmed = raw.trim();
  if (!trimmed) return { action: "finish", reason: "empty response" };

  const candidates = [extractToolStepJson(trimmed), trimmed];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const step = parseToolStepObject(parsed);
      if (step) return step;
    } catch {
      // try next candidate
    }
  }

  return { action: "finish", reason: "unparseable agent step" };
}

export function buildToolLoopPrompt(input: {
  city: string;
  cityName: string;
  userMessage: string;
  iteration: number;
  maxIterations: number;
  history: ToolLoopHistoryEntry[];
}): string {
  const toolsJson = JSON.stringify(
    TRAVEL_TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
    null,
    2,
  );

  const historyText =
    input.history.length === 0
      ? "（尚无工具调用结果）"
      : input.history
          .map(
            (h) =>
              `第 ${h.iteration + 1} 轮:\n${h.calls.map((c) => `- ${c.name}(${JSON.stringify(c.args)})`).join("\n")}\n结果摘要: ${h.summary}`,
          )
          .join("\n\n");

  return [
    "你是旅游助手的工具调度器（Tool Planner）。",
    `当前城市: ${input.cityName}（city_id=${input.city}）`,
    `用户问题: ${input.userMessage}`,
    "",
    "可用工具 JSON Schema:",
    toolsJson,
    "",
    "已执行工具及结果摘要:",
    historyText,
    "",
    `当前为第 ${input.iteration + 1}/${input.maxIterations} 轮。`,
    "",
    "请判断是否需要继续调用工具收集数据。",
    "- 若需要更多 POI/行程/机位/攻略，输出 tool_calls",
    "- 若已有足够数据或无法继续，输出 finish",
    "",
    "必须只输出一个 JSON 对象，不要 Markdown 解释，格式二选一:",
    "",
    '{"action":"tool_calls","calls":[{"name":"search_poi","args":{"city":"chengdu","limit":8}}]}',
    '{"action":"finish","reason":"数据已足够"}',
  ].join("\n");
}

export function mockAgentToolStep(
  message: string,
  city: string,
  iteration: number,
  history: ToolLoopHistoryEntry[],
  options?: { skipSearchRag?: boolean },
): string {
  if (iteration > 0 || history.length > 0) {
    return JSON.stringify({ action: "finish", reason: "mock: tools executed" });
  }

  const wantsFood = /美食|吃|food|火锅|小吃|餐厅|早茶|必吃/.test(message);
  const wantsPhoto = /拍照|出片|机位|摄影|打卡|photo/.test(message);
  const wantsPlan = /行程|规划|几天|一日|两日|三日|1日|2日|3日|路线|攻略/.test(message);
  const daysMatch = message.match(/([123一二三])日/);
  const dayMap: Record<string, number> = { 一: 1, 二: 2, 三: 3, "1": 1, "2": 2, "3": 3 };
  const days = daysMatch ? (dayMap[daysMatch[1] ?? ""] ?? Number(daysMatch[1])) : undefined;

  const calls: AgentToolCall[] = [];

  if (wantsPlan || wantsFood) {
    calls.push({
      name: "get_itinerary",
      args: {
        city,
        days: days ?? (wantsFood ? 1 : 2),
        theme: wantsFood ? "美食" : wantsPhoto ? "拍照" : undefined,
      },
    });
  }
  if (wantsFood) calls.push({ name: "recommend_food", args: { city, limit: 8 } });
  if (wantsPhoto) calls.push({ name: "get_photo_spots", args: { city, limit: 6 } });
  calls.push({
    name: "search_poi",
    args: { city, type: wantsFood ? "food" : wantsPhoto ? "attraction" : "all", limit: 8 },
  });
  if (!options?.skipSearchRag) {
    calls.push({ name: "search_rag", args: { city, query: message, limit: 5 } });
  }

  const seen = new Set<string>();
  const unique = calls.filter((call) => {
    const key = `${call.name}:${JSON.stringify(call.args)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return JSON.stringify({ action: "tool_calls", calls: unique });
}

export function summarizeToolResult(name: TravelToolName, result: unknown): string {
  if (result == null) return "无结果";

  switch (getToolMergeStrategy(name)) {
    case "rag": {
      const rag = result as { chunks?: Array<{ documentTitle?: string }> };
      const chunks = rag.chunks ?? [];
      return `${chunks.length} 条文档片段: ${chunks.map((c) => c.documentTitle).filter(Boolean).slice(0, 3).join("、") || "—"}`;
    }
    case "itinerary": {
      const trip = result as { title?: string; items?: unknown[] };
      return `行程「${trip.title ?? "—"}」，${trip.items?.length ?? 0} 个节点`;
    }
    case "pois":
    case "photo_spots": {
      const items = result as Array<{ name?: string }>;
      return `${items.length} 条: ${items.map((i) => i.name).filter(Boolean).slice(0, 5).join("、") || "—"}`;
    }
    default:
      return "已返回数据";
  }
}
