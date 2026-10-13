import { indexDocumentChunks, clearDocumentChunks } from "../database/kb-chunk-index";
import { createTestDatabase } from "../../test/test-db";

describe("kb-index.util", () => {
  let db: ReturnType<typeof createTestDatabase>;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("indexes document chunks and fts rows", () => {
    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO kb_documents (id, city_id, title, source, content, tags, created_at, updated_at)
      VALUES (?, ?, ?, 'test', ?, '[]', ?, ?)
    `,
    ).run("kb_test", "chengdu", "测试文档", "成都火锅指南内容", now, now);

    const count = indexDocumentChunks(db, {
      id: "kb_test",
      city_id: "chengdu",
      title: "测试文档",
      content: "成都火锅指南内容。第二段关于微辣起步。",
    });

    expect(count).toBeGreaterThan(0);
    const chunks = db.prepare("SELECT COUNT(*) AS c FROM kb_chunks WHERE document_id = ?").get("kb_test") as {
      c: number;
    };
    expect(chunks.c).toBe(count);
  });

  it("clears chunks on reindex", () => {
    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO kb_documents (id, city_id, title, source, content, tags, created_at, updated_at)
      VALUES (?, ?, ?, 'test', ?, '[]', ?, ?)
    `,
    ).run("kb_re", "chengdu", "Re", "旧内容", now, now);

    indexDocumentChunks(db, {
      id: "kb_re",
      city_id: "chengdu",
      title: "Re",
      content: "旧内容",
    });

    clearDocumentChunks(db, "kb_re");
    const chunks = db.prepare("SELECT COUNT(*) AS c FROM kb_chunks WHERE document_id = ?").get("kb_re") as {
      c: number;
    };
    expect(chunks.c).toBe(0);
  });
});
