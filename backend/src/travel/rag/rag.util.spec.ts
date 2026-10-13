import {
  buildFtsQuery,
  chunkText,
  estimateTokens,
  extractSearchTerms,
  reciprocalRankFusion,
  rerankByLexicalOverlap,
} from "./rag.util";

describe("rag.util", () => {
  describe("chunkText", () => {
    it("merges short paragraphs into one chunk", () => {
      const text = "第一段内容。\n\n第二段内容。";
      const chunks = chunkText(text, 100, 10);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain("第一段");
      expect(chunks[0]).toContain("第二段");
    });

    it("splits long paragraphs into overlapping windows", () => {
      const long = "A".repeat(500);
      const chunks = chunkText(long, 200, 40);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.every((c) => c.length <= 200)).toBe(true);
    });

    it("splits on markdown headings and keeps heading on first chunk", () => {
      const text = "## 火锅推荐\n\n短段落。\n\n## 小吃\n\n另一段。";
      const chunks = chunkText(text, 200, 20);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0]).toContain("## 火锅推荐");
      expect(chunks.some((c) => c.includes("小吃"))).toBe(true);
    });
  });

  describe("extractSearchTerms", () => {
    it("extracts travel keywords from Chinese message", () => {
      const terms = extractSearchTerms("成都美食火锅推荐");
      expect(terms).toContain("火锅");
      expect(terms).toContain("美食");
    });

    it("extracts English words", () => {
      const terms = extractSearchTerms("best photo spots in Shanghai");
      expect(terms).toContain("best");
      expect(terms).toContain("photo");
    });

    it("returns empty for whitespace-only input", () => {
      expect(extractSearchTerms("   ")).toEqual([]);
    });
  });

  describe("buildFtsQuery", () => {
    it("expands Chinese terms to character OR tokens", () => {
      expect(buildFtsQuery(["火锅", "美食"])).toBe("火 OR 锅 OR 美 OR 食");
    });

    it("returns null for empty terms", () => {
      expect(buildFtsQuery([])).toBeNull();
    });
  });

  describe("estimateTokens", () => {
    it("estimates mixed Chinese and English", () => {
      expect(estimateTokens("成都火锅 hotpot")).toBeGreaterThan(0);
    });
  });

  describe("reciprocalRankFusion", () => {
    it("merges ranked lists by chunk id", () => {
      const scores = reciprocalRankFusion([
        [{ chunkId: "a", content: "" } as never, { chunkId: "b", content: "" } as never],
        [{ chunkId: "b", content: "" } as never, { chunkId: "c", content: "" } as never],
      ]);
      expect(scores.get("b")).toBeGreaterThan(scores.get("a") ?? 0);
      expect(scores.get("b")).toBeGreaterThan(scores.get("c") ?? 0);
    });
  });

  describe("rerankByLexicalOverlap", () => {
    it("prefers chunks with more query term hits", () => {
      const rrf = reciprocalRankFusion([
        [{ chunkId: "a" }, { chunkId: "b" }],
        [{ chunkId: "b" }, { chunkId: "a" }],
      ]);
      const ranked = rerankByLexicalOverlap(
        "成都火锅",
        ["成都", "火锅"],
        [
          { chunkId: "a", documentTitle: "其他", content: "泛泛而谈" },
          { chunkId: "b", documentTitle: "成都美食", content: "成都火锅微辣起步" },
        ],
        rrf,
        2,
      );
      expect(ranked[0]?.item.chunkId).toBe("b");
    });
  });
});
