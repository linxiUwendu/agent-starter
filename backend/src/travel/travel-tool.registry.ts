import type { RagService } from "./rag/rag.service";
import type { PoiService } from "./poi.service";
import { resolveCityId, type TravelToolName } from "./travel.constants";
import type {
  GetItineraryParams,
  PhotoSpot,
  Poi,
  RecommendFoodParams,
  SearchPhotoSpotParams,
  SearchPoiParams,
  TravelContext,
} from "./travel.types";

/** 工具结果写入 TravelContext 的策略 */
export type ToolMergeStrategy = "pois" | "photo_spots" | "itinerary" | "rag";

export type TravelToolDeps = {
  poiService: PoiService;
  ragService: RagService;
};

type ToolExecutor = (
  deps: TravelToolDeps,
  args: Record<string, unknown>,
) => unknown | Promise<unknown>;

export type TravelToolRegistryEntry = {
  merge: ToolMergeStrategy;
  execute: ToolExecutor;
};

function normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  return { ...args, city: resolveCityId(String(args.city ?? "")) };
}

function mergePois(context: TravelContext, pois: Poi[]) {
  const map = new Map(context.pois.map((p) => [p.id, p]));
  for (const poi of pois) map.set(poi.id, poi);
  context.pois = [...map.values()];
  return pois.length;
}

function mergePhotoSpots(context: TravelContext, spots: PhotoSpot[]) {
  const existing = new Set(context.photoSpots.map((s) => s.id));
  for (const spot of spots) {
    if (!existing.has(spot.id)) {
      context.photoSpots.push(spot);
      existing.add(spot.id);
    }
  }
  return spots.length;
}

function mergeItinerary(context: TravelContext, itinerary: TravelContext["itinerary"]) {
  context.itinerary = itinerary;
  const map = new Map(context.pois.map((p) => [p.id, p]));
  for (const item of itinerary?.items ?? []) {
    if (item.poi) map.set(item.poi.id, item.poi);
  }
  context.pois = [...map.values()];
  return itinerary?.items.length ?? 0;
}

function mergeRag(context: TravelContext, result: unknown) {
  const rag = result as { chunks: TravelContext["ragChunks"]; meta: TravelContext["ragMeta"] };
  context.ragChunks = rag.chunks;
  context.ragMeta = rag.meta ?? null;
  return rag.chunks.length;
}

const MERGE_HANDLERS: Record<
  ToolMergeStrategy,
  (context: TravelContext, result: unknown) => number
> = {
  pois: (context, result) => mergePois(context, result as Poi[]),
  photo_spots: (context, result) => mergePhotoSpots(context, result as PhotoSpot[]),
  itinerary: (context, result) => mergeItinerary(context, result as TravelContext["itinerary"]),
  rag: mergeRag,
};

/** 各工具的调用与结果合并配置（单一数据源） */
export const TRAVEL_TOOL_REGISTRY: Record<TravelToolName, TravelToolRegistryEntry> = {
  search_poi: {
    merge: "pois",
    execute: (deps, args) => deps.poiService.searchPoi(normalizeArgs(args) as SearchPoiParams),
  },
  get_photo_spots: {
    merge: "photo_spots",
    execute: (deps, args) =>
      deps.poiService.getPhotoSpots(normalizeArgs(args) as SearchPhotoSpotParams),
  },
  get_itinerary: {
    merge: "itinerary",
    execute: (deps, args) =>
      deps.poiService.findItinerary(normalizeArgs(args) as GetItineraryParams),
  },
  recommend_food: {
    merge: "pois",
    execute: (deps, args) =>
      deps.poiService.recommendFood(normalizeArgs(args) as RecommendFoodParams),
  },
  search_rag: {
    merge: "rag",
    execute: (deps, args) => {
      const normalized = normalizeArgs(args);
      const query = String(normalized.query ?? "").trim();
      const city = normalized.city as string | undefined;
      const limit = typeof normalized.limit === "number" ? normalized.limit : 5;
      return deps.ragService.retrieveWithMetaAsync(query, city, limit);
    },
  },
};

export function executeTravelTool(
  deps: TravelToolDeps,
  name: TravelToolName,
  args: Record<string, unknown> = {},
): unknown {
  return TRAVEL_TOOL_REGISTRY[name].execute(deps, args);
}

export function mergeTravelToolResult(
  context: TravelContext,
  name: TravelToolName,
  args: Record<string, unknown>,
  result: unknown,
): number {
  if (result == null) {
    context.toolCalls.push({ name, args, resultCount: 0 });
    return 0;
  }

  const { merge } = TRAVEL_TOOL_REGISTRY[name];
  const count = MERGE_HANDLERS[merge](context, result);
  context.toolCalls.push({ name, args, resultCount: count });
  return count;
}

export function getToolMergeStrategy(name: TravelToolName): ToolMergeStrategy {
  return TRAVEL_TOOL_REGISTRY[name].merge;
}
