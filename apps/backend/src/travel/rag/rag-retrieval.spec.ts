import { Logger } from "@nestjs/common";

import { KbRepository } from "../database/repositories/kb.repository";
import { createTestDatabase } from "../../test/test-db";
import { LocalTfidfIndex } from "./local-tfidf-index";
import { searchFtsBm25, searchTfidfLocal } from "./rag-retrieval";
import { buildFtsQuery, extractSearchTerms } from "./rag.util";

describe("rag-retrieval", () => {
  let kb: KbRepository;
  let db: ReturnType<typeof createTestDatabase>;
  const logger = new Logger("test");

  beforeEach(() => {
    db = createTestDatabase();
    kb = new KbRepository({ connection: db } as never);
  });

  afterEach(() => {
    db.close();
  });

  it("searchFtsBm25 returns fts chunks", () => {
    const terms = extractSearchTerms("成都火锅");
    const ftsQuery = buildFtsQuery(terms);
    const hits = searchFtsBm25(kb, logger, ftsQuery!, "chengdu", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.method).toBe("fts");
  });

  it("searchTfidfLocal returns vector chunks in one call chain", () => {
    const index = new LocalTfidfIndex();
    const hits = searchTfidfLocal(kb, index, "火锅", "chengdu", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.method).toBe("vector");
  });
});
