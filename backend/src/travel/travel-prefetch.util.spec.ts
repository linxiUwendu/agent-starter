import { prefetchRagRetrieval, formatPrefetchedRagBlock } from "./travel-prefetch.util";

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

    const context = {
      city: "chengdu",
      cityName: "成都",
      pois: [],
      photoSpots: [],
      itinerary: null,
      toolCalls: [],
      ragChunks: [],
    };

    const { step, injectedPromptBlock } = await prefetchRagRetrieval(
      deps as never,
      context as never,
      "成都火锅",
      "chengdu",
    );

    expect(step?.iteration).toBe(-1);
    expect(context.ragChunks).toHaveLength(1);
    expect(injectedPromptBlock).toContain("知识库预检索");
    expect(formatPrefetchedRagBlock(context as never)).toContain("成都美食");
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

    const result = await prefetchRagRetrieval(deps as never, context as never, "a", "chengdu");
    expect(result.step).toBeNull();
    expect(deps.ragService.retrieveWithMetaAsync).not.toHaveBeenCalled();
  });
});
