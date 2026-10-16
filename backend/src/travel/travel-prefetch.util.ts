import type { TravelToolDeps } from "./travel-tool.registry";
import { executeTravelTool, mergeTravelToolResult } from "./travel-tool.registry";
import type { ToolLoopStep, TravelContext } from "./travel.types";
import { summarizeToolResult } from "./travel-tools.util";

export const PREFETCH_ITERATION = -1;

export type RagPrefetchResult = {
  step: ToolLoopStep | null;
  injectedPromptBlock: string;
};

/** 将已写入 context 的 RAG 片段格式化为模型可读块（检索前置，无需再等 search_rag 工具轮）。 */
export function formatPrefetchedRagBlock(context: TravelContext): string {
  if (!context.ragChunks.length) {
    return "";
  }

  const lines = [
    "## 知识库预检索（服务端已执行 search_rag）",
    "以下摘录可直接引用；除非用户问题需要换关键词，否则不必再调用 search_rag。",
    "",
  ];

  for (const chunk of context.ragChunks.slice(0, 8)) {
    const excerpt = chunk.content.replace(/\s+/g, " ").trim().slice(0, 480);
    lines.push(`- **${chunk.documentTitle}**`, `  ${excerpt}`, "");
  }

  if (context.ragMeta) {
    lines.push(
      `（检索耗时 ${context.ragMeta.durationMs}ms，方法 ${context.ragMeta.methods.join("/")}）`,
      "",
    );
  }

  return lines.join("\n").trimEnd();
}

/**
 * 在用户问题进入 Tool Loop / Chat Completions 之前执行 hybrid RAG，减少首轮 LLM 仅用于 search_rag 的往返。
 */
export async function prefetchRagRetrieval(
  deps: TravelToolDeps,
  context: TravelContext,
  userMessage: string,
  city: string,
  limit = 5,
): Promise<RagPrefetchResult> {
  console.log(deps, '============> deps');
  const query = userMessage.trim();
  if (!query || query.length < 2) {
    return { step: null, injectedPromptBlock: "" };
  }

  const args = { city, query, limit };
  const started = Date.now();
  const result = await Promise.resolve(
    executeTravelTool(deps, "search_rag", args),
  );
  console.log(result, '============> result', args);
  const resultCount = mergeTravelToolResult(context, "search_rag", args, result);

  const step: ToolLoopStep = {
    iteration: PREFETCH_ITERATION,
    action: "tool_calls",
    calls: [{ name: "search_rag", args, resultCount }],
    reason: `prefetch ${Date.now() - started}ms ${summarizeToolResult("search_rag", result)}`,
  };

  return {
    step,
    injectedPromptBlock: formatPrefetchedRagBlock(context),
  };
}
