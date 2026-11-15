import type { Response } from "express";

import { createSseSession, streamTextCharByChar } from "./sse.util";

function createMockResponse() {
  const chunks: string[] = [];
  const state = {
    statusCode: 0,
    headers: {} as Record<string, string>,
  };

  const res = {
    socket: { setNoDelay: jest.fn(), destroyed: false },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value;
    },
    write(data: string) {
      chunks.push(data);
    },
    end: jest.fn(),
    flush: jest.fn(),
  } as unknown as Response;

  return { res, chunks, state };
}

describe("sse.util", () => {
  it("createSseSession.send writes event: context frame", () => {
    const { res, chunks } = createMockResponse();
    const sse = createSseSession(res, 999_999);
    sse.send("context", { city: "chengdu", cityName: "成都", pois: [] });
    expect(chunks.join("")).toContain("event: context");
  });

  it("createSseSession.send writes event and JSON data", () => {
    const { res, chunks } = createMockResponse();
    const sse = createSseSession(res, 999_999);
    sse.send("delta", { text: "你好" });
    const output = chunks.join("");
    expect(output).toContain("event: delta\n");
    expect(output).toContain('"text":"你好"');
  });

  it("createSseSession streams deltas and finishes with done", () => {
    const { res, chunks } = createMockResponse();
    const sse = createSseSession(res, 999_999);

    sse.send("start", {});
    sse.pushDelta("Hello");
    sse.finish("done", { answer: "Hello" });

    const output = chunks.join("");
    expect(output).toContain("event: start\n");
    expect(output).toContain("event: delta\n");
    expect(output).toContain('"text":"Hello"');
    expect(output).toContain("event: done\n");
    expect(sse.streamedChars()).toBe(5);
    expect(res.end).toHaveBeenCalled();
  });

  it("streamTextCharByChar emits one delta per character", async () => {
    const deltas: string[] = [];
    await streamTextCharByChar((text) => deltas.push(text), "你好", {
      charDelayMs: 0,
      maxDurationMs: 0,
    });
    expect(deltas).toEqual(["你", "好"]);
  });
});
