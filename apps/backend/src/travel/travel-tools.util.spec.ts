import {
  extractToolStepJson,
  mockAgentToolStep,
  parseAgentToolStep,
  summarizeToolResult,
} from "./travel-tools.util";

describe("travel-tools.util", () => {
  it("parses tool_calls JSON", () => {
    const step = parseAgentToolStep(
      '{"action":"tool_calls","calls":[{"name":"search_poi","args":{"city":"chengdu","limit":5}}]}',
    );
    expect(step.action).toBe("tool_calls");
    if (step.action === "tool_calls") {
      expect(step.calls[0]?.name).toBe("search_poi");
    }
  });

  it("extracts JSON embedded in prose", () => {
    const raw =
      '好的，我来调用工具。\n{"action":"tool_calls","calls":[{"name":"search_rag","args":{"city":"chengdu","query":"火锅","limit":5}}]}\n以上。';
    const step = parseAgentToolStep(raw);
    expect(step.action).toBe("tool_calls");
    expect(extractToolStepJson(raw)).toContain('"action"');
  });

  it("parses finish from fenced JSON", () => {
    const step = parseAgentToolStep('```json\n{"action":"finish","reason":"enough"}\n```');
    expect(step).toEqual({ action: "finish", reason: "enough" });
  });

  it("mock planner returns tools then finish", () => {
    const round1 = parseAgentToolStep(mockAgentToolStep("成都美食推荐", "chengdu", []));
    expect(round1.action).toBe("tool_calls");
    const round2 = parseAgentToolStep(
      mockAgentToolStep("成都美食推荐", "chengdu", [
        { calls: [{ name: "recommend_food", args: { city: "chengdu" } }], summary: "ok" },
      ]),
    );
    expect(round2.action).toBe("finish");
  });

  it("summarizes rag result object", () => {
    const text = summarizeToolResult("search_rag", {
      chunks: [{ documentTitle: "成都美食指南", content: "微辣" }],
      meta: {},
    });
    expect(text).toContain("1 条文档片段");
    expect(text).toContain("成都美食指南");
  });
});
