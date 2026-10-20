import { executeTravelTool, mergeTravelToolResult } from "./travel-tool.registry";
import { TravelToolsService } from "./travel-tools.service";
import type { Poi, TravelContext } from "./travel.types";

describe("TravelToolsService", () => {
  const mockPoi: Poi = {
    id: "poi_1",
    city_id: "chengdu",
    name: "蜀大侠火锅",
    type: "food",
    tags: [],
    lat: null,
    lng: null,
    address: null,
    open_hours: null,
    ticket: null,
    avg_duration_min: null,
    price_level: "¥¥",
    description: "牛油红锅",
    tips: null,
    best_time: null,
    rating: 4.6,
  };

  const poiService = {
    getCity: jest.fn().mockReturnValue({ id: "chengdu", name: "成都" }),
    searchPoi: jest.fn().mockReturnValue([mockPoi]),
    getPhotoSpots: jest.fn().mockReturnValue([]),
    findItinerary: jest.fn().mockReturnValue(null),
    recommendFood: jest.fn().mockReturnValue([mockPoi]),
  };

  const ragService = {
    retrieveWithMetaAsync: jest.fn().mockResolvedValue({
      chunks: [
        {
          chunkId: "c1",
          documentTitle: "成都美食指南",
          content: "火锅微辣起步",
          score: 0,
          method: "hybrid",
        },
      ],
      meta: {
        durationMs: 1,
        terms: ["火锅"],
        methods: ["fts", "vector", "hybrid"],
        provider: "tfidf",
        tokenEstimate: 12,
        chunkCount: 1,
        vectorIndexSize: 1,
        vectorPartitions: 2,
        totalChunks: 10,
        rerankApplied: false,
      },
    }),
  };

  const cursorAgent = { runCollect: jest.fn() };
  const config = {
    get: jest.fn((key: string) => {
      if (key === "MOCK_AGENT") return "true";
      if (key === "TRAVEL_TOOL_LOOP_MAX_ITERATIONS") return "5";
      return undefined;
    }),
  };

  let tools: TravelToolsService;

  beforeEach(() => {
    jest.clearAllMocks();
    tools = new TravelToolsService(
      poiService as never,
      ragService as never,
      cursorAgent as never,
      config as never,
    );
  });

  it("search_rag tool delegates to RagService", async () => {
    const deps = { poiService, ragService };
    const result = await Promise.resolve(
      executeTravelTool(deps as never, "search_rag", { city: "chengdu", query: "火锅", limit: 5 }),
    );
    expect(ragService.retrieveWithMetaAsync).toHaveBeenCalledWith("火锅", "chengdu", 5);
    expect(result).toHaveProperty("chunks");
  });

  it("mergeTravelToolResult accumulates pois and rag chunks", () => {
    const context = tools.createEmptyContext("chengdu", "成都");
    mergeTravelToolResult(context, "recommend_food", { city: "chengdu" }, [mockPoi]);
    mergeTravelToolResult(context, "search_rag", { query: "火锅" }, {
      chunks: [
        {
          chunkId: "c1",
          documentTitle: "成都美食指南",
          content: "火锅微辣起步",
          score: 0,
          method: "hybrid",
        },
      ],
      meta: null,
    });
    expect(context.pois).toHaveLength(1);
    expect(context.ragChunks).toHaveLength(1);
    expect(context.toolCalls).toHaveLength(2);
  });

  it("runToolLoop executes agent-chosen tools in mock mode", async () => {
    const context = await tools.runToolLoop([{ role: "user", content: "成都美食推荐" }], "chengdu");
    expect(context.city).toBe("chengdu");
    expect(context.pois.length).toBeGreaterThan(0);
    expect(context.ragChunks.length).toBe(1);
    expect(context.toolLoopSteps?.length).toBeGreaterThanOrEqual(2);
    expect(ragService.retrieveWithMetaAsync).toHaveBeenCalled();
  });

  it("formatContextForPrompt includes RAG section when chunks present", () => {
    const context: TravelContext = {
      city: "chengdu",
      cityName: "成都",
      pois: [mockPoi],
      photoSpots: [],
      itinerary: null,
      toolCalls: [{ name: "search_poi", args: {}, resultCount: 1 }],
      ragChunks: [
        {
          chunkId: "c1",
          documentTitle: "成都美食指南",
          content: "微辣起步",
          score: 0,
        },
      ],
      toolLoopSteps: [{ iteration: 0, action: "finish", reason: "mock" }],
    };

    const formatted = tools.formatContextForPrompt(context);
    expect(formatted).toContain("参考文档摘录（RAG）");
    expect(formatted).toContain("Tool Loop 轮次");
  });
});
