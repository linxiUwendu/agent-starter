import { prefetchRagRetrieval } from "./travel-prefetch.util";
import type { TravelContext } from "./travel.types";

describe("travel-prefetch", () => {
  it("prefetchRagRetrieval merges chunks into context", async () => {
    const deps = {
      poiService: {} as never,
      ragService: {
        retrieveWithMetaAsync: jest.fn().mockResolvedValue({
          chunks: [
            {
              chunkId: "c1",
              documentTitle: "成都美食",
              content: "火锅微辣",
              score: 1,
              method: "hybrid",
            },
          ],
          meta: { durationMs: 2, methods: ["fts"], terms: [], provider: "tfidf" },
        }),
      },
    };

    const context: TravelContext = {
      city: "chengdu",
      cityName: "成都",
      pois: [],
      photoSpots: [],
      itinerary: null,
      toolCalls: [],
      ragChunks: [],
      ragMeta: null,
    };

    const step = await prefetchRagRetrieval(
      deps as never,
      context,
      "成都火锅",
      "chengdu",
    );

    expect(step?.action).toBe("prefetch");
    expect(context.ragChunks).toHaveLength(1);
    expect(context.toolCalls).toHaveLength(1);
    expect(context.toolCalls[0]?.name).toBe("search_rag");
  });

  it("skips prefetch for very short query", async () => {
    const deps = {
      poiService: {} as never,
      ragService: { retrieveWithMetaAsync: jest.fn() },
    };
    const context = {
      city: "chengdu",
      cityName: "成都",
      pois: [],
      photoSpots: [],
      itinerary: null,
      toolCalls: [],
      ragChunks: [],
    };

    const step = await prefetchRagRetrieval(deps as never, context as never, "a", "chengdu");
    expect(step).toBeNull();
    expect(deps.ragService.retrieveWithMetaAsync).not.toHaveBeenCalled();
  });
});
