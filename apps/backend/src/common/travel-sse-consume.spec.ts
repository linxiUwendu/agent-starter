import {
  createSseFeedState,
  feedTravelSseChunk,
} from "../../../frontend/src/api/travel-sse-parse";

describe("travel SSE consume (frontend parity)", () => {
  const baseHandlers = () => ({
    onDelta: () => {},
    onDone: () => {},
    onError: (msg: string) => {
      throw new Error(msg);
    },
  });

  it("does not clear pending context when an intervening phase frame arrives", () => {
    const state = createSseFeedState();
    const fired: string[] = [];
    const handlers = {
      ...baseHandlers(),
      onPhase: () => fired.push("phase"),
      onContext: () => fired.push("context"),
    };

    expect(
      feedTravelSseChunk(
        state,
        "event: context\n\n",
        handlers,
      ),
    ).toBe("ok");
    expect(
      feedTravelSseChunk(
        state,
        'event: phase\ndata: {"stage":"generating"}\n\n',
        handlers,
      ),
    ).toBe("ok");

    const ctx =
      '{"city":"chengdu","cityName":"成都","pois":[],"photoSpots":[],"toolCalls":[],"ragChunks":[]}';
    expect(feedTravelSseChunk(state, `data: ${ctx}\n\n`, handlers)).toBe("ok");

    expect(fired).toContain("phase");
    expect(fired).toContain("context");
  });

  it("binds context data after keepalive between event and data lines", () => {
    const state = createSseFeedState();
    let gotContext = false;
    const handlers = {
      ...baseHandlers(),
      onContext: () => {
        gotContext = true;
      },
    };
    const ctx =
      '{"city":"chengdu","cityName":"成都","pois":[],"photoSpots":[],"toolCalls":[],"ragChunks":[]}';

    expect(feedTravelSseChunk(state, "event: context\n", handlers)).toBe("ok");
    expect(feedTravelSseChunk(state, ": ping\n\n", handlers)).toBe("ok");
    expect(feedTravelSseChunk(state, `data: ${ctx}\n\n`, handlers)).toBe("ok");
    expect(gotContext).toBe(true);
  });

  it("recognizes orphan context data without event line", () => {
    const state = createSseFeedState();
    let gotContext = false;
    const handlers = {
      ...baseHandlers(),
      onContext: () => {
        gotContext = true;
      },
    };
    const ctx =
      '{"city":"chengdu","cityName":"成都","pois":[],"photoSpots":[],"toolCalls":[],"ragChunks":[]}';
    expect(feedTravelSseChunk(state, `data: ${ctx}\n\n`, handlers)).toBe("ok");
    expect(gotContext).toBe(true);
  });
});