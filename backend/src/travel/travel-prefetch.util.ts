import type { TravelToolDeps } from "./travel-tool.registry";
import { executeTravelTool, mergeTravelToolResult } from "./travel-tool.registry";
import type { ToolLoopStep, TravelContext } from "./travel.types";
import { summarizeToolResult } from "./travel-tools.util";

/**
 * 在用户问题进入 Tool Loop 之前执行 hybrid RAG，减少首轮 LLM 仅用于 search_rag 的往返。
 * 无有效 query 时返回 null。
 */
export async function prefetchRagRetrieval(
  deps: TravelToolDeps,
  context: TravelContext,
  userMessage: string,
  city: string,
  limit = 5,
): Promise<ToolLoopStep | null> {
  const query = userMessage.trim();
  if (!query || query.length < 2) {
    return null;
  }

  const args = { city, query, limit };
  const started = Date.now();
  const result = await Promise.resolve(
    executeTravelTool(deps, "search_rag", args),
  );
  console.log(result, '============> prefetchRagRetrieval result', args, city, query);
  const resultCount = mergeTravelToolResult(context, "search_rag", args, result);

  return {
    action: "prefetch",
    calls: [{ name: "search_rag", args, resultCount }],
    reason: `prefetch ${Date.now() - started}ms ${summarizeToolResult("search_rag", result)}`,
  };
}
