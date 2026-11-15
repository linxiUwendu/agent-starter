import Database from "better-sqlite3";

import { SCHEMA_SQL } from "../travel/database/schema";
import { chunkText, formatTextForFtsIndex } from "../travel/rag/rag.util";

/** 内存 SQLite，供 RAG / 工具链单测使用 */
export function createTestDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);

  db.prepare(
    "INSERT INTO cities (id, name, province, description, center_lat, center_lng, highlights) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run("chengdu", "成都", "四川", "美食与熊猫", 30.67, 104.06, "[]");

  db.prepare(
    `
    INSERT INTO pois (id, city_id, name, category, tags, description, rating)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run("poi_hotpot", "chengdu", "蜀大侠火锅", "food", "[]", "牛油红锅", 4.6);

  const docId = "kb_test_chengdu";
  const content = "成都火锅分牛油红锅与清油锅。初来建议微辣起步。宽窄巷子小吃游客价偏高。";
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO kb_documents (id, city_id, title, source, content, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(docId, "chengdu", "成都美食指南", "test", content, "[]", now, now);

  const chunks = chunkText(content);
  for (let i = 0; i < chunks.length; i++) {
    const chunkId = `${docId}_c${i}`;
    db.prepare(
      `
      INSERT INTO kb_chunks (id, document_id, city_id, chunk_index, content)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run(chunkId, docId, "chengdu", i, chunks[i]);

    db.prepare(
      `
      INSERT INTO kb_chunks_fts (chunk_id, city_id, document_title, content)
      VALUES (?, ?, ?, ?)
    `,
    ).run(
      chunkId,
      "chengdu",
      formatTextForFtsIndex("成都美食指南"),
      formatTextForFtsIndex(chunks[i]!),
    );
  }

  return db;
}
