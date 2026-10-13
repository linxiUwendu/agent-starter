import { KbRepository } from "../database/repositories/kb.repository";
import { EmbeddingService } from "./embedding.service";
import { RagService } from "./rag.service";
import { createTestDatabase } from "../../test/test-db";

describe("RagService", () => {
  let rag: RagService;
  let db: ReturnType<typeof createTestDatabase>;

  beforeEach(() => {
    db = createTestDatabase();
    const embedding = { provider: "tfidf", embed: async () => null } as unknown as EmbeddingService;
    const kb = new KbRepository({ connection: db } as never);
    rag = new RagService(kb, embedding);
  });

  afterEach(() => {
    db.close();
  });

  it("retrieve returns chunks matching Chinese keywords", () => {
    const result = rag.retrieveWithMeta("成都火锅怎么选", "chengdu", 5);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks[0]?.documentTitle).toBe("成都美食指南");
    expect(result.meta.methods).toEqual(expect.arrayContaining(["fts", "vector"]));
    expect(result.chunks[0]?.method).toBe("hybrid");
    expect(result.meta.tokenEstimate).toBeGreaterThan(0);
  });

  it("retrieveWithMeta filters by city", () => {
    const { chunks } = rag.retrieveWithMeta("火锅", "shanghai", 5);
    expect(chunks).toHaveLength(0);
  });

  it("retrieveWithMeta returns empty for meaningless input", () => {
    expect(rag.retrieveWithMeta("a", "chengdu").chunks).toEqual([]);
  });

  it("getStats reports document and chunk counts", () => {
    const stats = rag.getStats();
    expect(stats.documents).toBe(1);
    expect(stats.chunks).toBeGreaterThan(0);
  });

  it("listDocuments returns seeded document", () => {
    const docs = rag.listDocuments("chengdu");
    expect(docs.some((d) => d.title === "成都美食指南")).toBe(true);
  });
});
