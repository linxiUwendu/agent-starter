import {
  buildFtsQuery,
  chunkText,
  estimateTokens,
  extractSearchTerms,
  reciprocalRankFusion,
  rerankByLexicalOverlap,
  tokenizeForSearch,
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

    it("strips quotes before tokenizing", () => {
      const terms = extractSearchTerms('"成都火锅"推荐');
      expect(terms).toContain("火锅");
      expect(terms).toContain("成都");
      expect(terms.every((t) => !/["']/.test(t))).toBe(true);
    });
  });

  describe("buildFtsQuery", () => {
    it("joins lexical terms with OR", () => {
      expect(buildFtsQuery(["火锅", "美食"])).toBe("火锅 OR 美食");
    });

    it("dedupes terms for OR query", () => {
      expect(buildFtsQuery(["火锅", "美食", "火锅"])).toBe("火锅 OR 美食");
    });

    it("returns null for empty terms", () => {
      expect(buildFtsQuery([])).toBeNull();
    });
  });

  describe("tokenizeForSearch", () => {
    it("aligns FTS OR tokens with tokenizeForSearch(query)", () => {
      const query = "成都火锅推荐";
      const ftsTokens = buildFtsQuery(extractSearchTerms(query))?.split(" OR ") ?? [];
      const tfidfTokens = tokenizeForSearch(query);
      for (const token of ftsTokens) {
        expect(tfidfTokens).toContain(token);
      }
    });

    it("segments Chinese with jieba words", () => {
      const tokens = tokenizeForSearch("成都火锅");
      expect(tokens).toContain("成都");
      expect(tokens).toContain("火锅");
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
