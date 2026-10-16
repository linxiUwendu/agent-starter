import {
  buildCursorAgentShellCommand,
  computeStreamDelta,
  enrichCursorAgentErrorMessage,
  generateMockAnswer,
  isRetryableCursorAgentError,
  shellSingleQuote,
} from "./cursor-agent.util";

describe("cursor-agent.util", () => {
  describe("computeStreamDelta", () => {
    it("returns full text on first assistant event", () => {
      const event = {
        type: "assistant",
        message: { content: [{ text: "你好世界" }] },
      };
      expect(computeStreamDelta(event, "")).toBe("你好世界");
    });

    it("returns incremental suffix when text grows", () => {
      const event = {
        type: "assistant",
        message: { content: [{ text: "你好世界" }] },
      };
      expect(computeStreamDelta(event, "你好")).toBe("世界");
    });

    it("ignores non-assistant events", () => {
      expect(computeStreamDelta({ type: "result" }, "")).toBeNull();
    });
  });

  describe("shellSingleQuote", () => {
    it("quotes strings with spaces and apostrophes", () => {
      expect(shellSingleQuote("回复 ok")).toBe("'回复 ok'");
      expect(buildCursorAgentShellCommand("cursor-agent", ["-p", "a'b"])).toContain("'a'\"'\"'b'");
    });
  });

  describe("isRetryableCursorAgentError", () => {
    it("detects ETIMEDOUT and unavailable", () => {
      expect(isRetryableCursorAgentError("Error: [unavailable] read ETIMEDOUT")).toBe(true);
      expect(isRetryableCursorAgentError("ENOENT")).toBe(false);
    });
  });

  describe("enrichCursorAgentErrorMessage", () => {
    it("adds network hint for ETIMEDOUT", () => {
      const msg = enrichCursorAgentErrorMessage("[unavailable] read ETIMEDOUT", "login hint");
      expect(msg).toContain("云端");
      expect(msg).toContain("MOCK_AGENT");
    });
  });

  describe("generateMockAnswer", () => {
    it("generates travel answer from embedded context", () => {
      const prompt = [
        "你是旅游助手",
        "## 检索到的成都旅游数据",
        "### 参考文档摘录（RAG）",
        "- **成都美食指南**",
        "  火锅微辣起步",
      ].join("\n");

      const answer = generateMockAnswer(prompt);
      expect(answer).toContain("Mock 模式");
      expect(answer).toContain("成都");
      expect(answer).toContain("攻略要点");
    });

    it("generates generic chat answer for non-travel prompts", () => {
      const answer = generateMockAnswer("用户：你好\n\n助手：");
      expect(answer).toContain("Mock 模式");
      expect(answer).toContain("你好");
    });
  });
});
