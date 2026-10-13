import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database.service";
import { parseJsonStringArray } from "../json-column.util";
import {
  countRows,
  KB_CHUNK_CITY_OR_GLOBAL,
  KB_CHUNK_WITH_DOC_FROM,
  KB_CITY_OR_GLOBAL,
} from "../sql-fragments";
import { GLOBAL_PARTITION } from "../../rag/city-partitioned-vector-index";
import {
  deleteDocumentFully,
  indexDocumentChunks,
  type KbDocumentRecord,
} from "../kb-chunk-index";

type KbChunkSearchRow = {
  chunk_id: string;
  document_title: string;
  content: string;
};

type KbChunkEmbeddingRow = KbChunkSearchRow & {
  city_id: string | null;
  embedding: string | null;
};

type KbFtsRow = {
  chunk_id: string;
  document_title: string;
  content: string;
  rank: number;
};

type KbDocumentListRow = {
  id: string;
  city_id: string | null;
  title: string;
  source: string;
  tags: string;
  updated_at: string;
  content_length: number;
  chunk_count: number;
};

type KbStats = {
  documents: number;
  chunks: number;
  embeddedChunks: number;
  cityPartitions: number;
};

@Injectable()
export class KbRepository {
  constructor(private readonly database: DatabaseService) {}

  private get db() {
    return this.database.connection;
  }

  countChunks(): number {
    return countRows(this.db, "kb_chunks");
  }

  getStats(): KbStats {
    const cityPartitions = (
      this.db
        .prepare(
          "SELECT COUNT(DISTINCT city_id) AS c FROM kb_chunks WHERE city_id IS NOT NULL AND city_id != ''",
        )
        .get() as { c: number }
    ).c;

    return {
      documents: countRows(this.db, "kb_documents"),
      chunks: countRows(this.db, "kb_chunks"),
      embeddedChunks: countRows(
        this.db,
        "kb_chunks",
        "embedding IS NOT NULL AND embedding != ''",
      ),
      cityPartitions,
    };
  }

  /** @description 向量索引分区：global 或指定 city 的 chunk 文档 */
  loadPartitionChunkDocs(partitionKey: string): Array<{ chunk_id: string; content: string; city_id: string | null }> {
    if (partitionKey === GLOBAL_PARTITION) {
      return this.db
        .prepare(
          `
          SELECT c.id AS chunk_id, c.content, c.city_id
          FROM kb_chunks c
          WHERE c.city_id IS NULL OR c.city_id = ''
        `,
        )
        .all() as Array<{ chunk_id: string; content: string; city_id: string | null }>;
    }

    return this.db
      .prepare(
        `
          SELECT c.id AS chunk_id, c.content, c.city_id
          FROM kb_chunks c
          WHERE c.city_id = ?
        `,
      )
      .all(partitionKey) as Array<{ chunk_id: string; content: string; city_id: string | null }>;
  }

  findChunksByIds(ids: string[]): KbChunkSearchRow[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    return this.db
      .prepare(
        `
      SELECT c.id AS chunk_id, d.title AS document_title, c.content
      ${KB_CHUNK_WITH_DOC_FROM}
      WHERE c.id IN (${placeholders})
    `,
      )
      .all(...ids) as KbChunkSearchRow[];
  }

  searchChunksForEmbedding(city: string | undefined, limit: number): KbChunkEmbeddingRow[] {
    let sql = `
      SELECT c.id AS chunk_id, d.title AS document_title, c.content, c.city_id, c.embedding
      ${KB_CHUNK_WITH_DOC_FROM}
      WHERE c.embedding IS NOT NULL AND c.embedding != ''
    `;
    const values: unknown[] = [];

    if (city) {
      sql += ` AND ${KB_CHUNK_CITY_OR_GLOBAL}`;
      values.push(city);
    }

    sql += " LIMIT ?";
    values.push(limit);

    return this.db.prepare(sql).all(...values) as KbChunkEmbeddingRow[];
  }

  searchChunksFts(ftsQuery: string, city: string | undefined, limit: number): KbFtsRow[] {
    if (city) {
      return this.db
        .prepare(
          `
            SELECT chunk_id, document_title, content, bm25(kb_chunks_fts) AS rank
            FROM kb_chunks_fts
            WHERE kb_chunks_fts MATCH ? AND ${KB_CITY_OR_GLOBAL}
            ORDER BY rank
            LIMIT ?
          `,
        )
        .all(ftsQuery, city, limit) as KbFtsRow[];
    }

    return this.db
      .prepare(
        `
            SELECT chunk_id, document_title, content, bm25(kb_chunks_fts) AS rank
            FROM kb_chunks_fts
            WHERE kb_chunks_fts MATCH ?
            ORDER BY rank
            LIMIT ?
          `,
      )
      .all(ftsQuery, limit) as KbFtsRow[];
  }

  searchChunksLike(terms: string[], city: string | undefined, limit: number): KbChunkSearchRow[] {
    if (terms.length === 0) return [];

    const clauses = terms.map(() => "c.content LIKE ?").join(" OR ");
    const values: unknown[] = terms.map((t) => `%${t}%`);

    let sql = `
      SELECT c.id AS chunk_id, d.title AS document_title, c.content
      ${KB_CHUNK_WITH_DOC_FROM}
      WHERE (${clauses})
    `;

    if (city) {
      sql += ` AND ${KB_CHUNK_CITY_OR_GLOBAL}`;
      values.push(city);
    }

    sql += " ORDER BY LENGTH(c.content) LIMIT ?";
    values.push(limit);

    return this.db.prepare(sql).all(...values) as KbChunkSearchRow[];
  }

  listDocumentRows(city?: string): KbDocumentListRow[] {
    const baseSelect = `
          SELECT id, city_id, title, source, tags, updated_at,
                 LENGTH(content) AS content_length,
                 (SELECT COUNT(*) FROM kb_chunks c WHERE c.document_id = kb_documents.id) AS chunk_count
          FROM kb_documents`;

    if (city) {
      return this.db
        .prepare(
          `${baseSelect}
          WHERE ${KB_CITY_OR_GLOBAL}
          ORDER BY city_id, title`,
        )
        .all(city) as KbDocumentListRow[];
    }

    return this.db
      .prepare(`${baseSelect} ORDER BY city_id, title`)
      .all() as KbDocumentListRow[];
  }

  findDocumentRow(id: string): {
    id: string;
    city_id: string | null;
    title: string;
    source: string;
    content: string;
    tags: string;
    updated_at: string;
  } | null {
    const row = this.db
      .prepare(
        "SELECT id, city_id, title, source, content, tags, updated_at FROM kb_documents WHERE id = ?",
      )
      .get(id) as
      | {
          id: string;
          city_id: string | null;
          title: string;
          source: string;
          content: string;
          tags: string;
          updated_at: string;
        }
      | undefined;
    return row ?? null;
  }

  listDocumentChunkRows(documentId: string): Array<{ id: string; chunk_index: number; content: string }> {
    return this.db
      .prepare(
        "SELECT id, chunk_index, content FROM kb_chunks WHERE document_id = ? ORDER BY chunk_index",
      )
      .all(documentId) as Array<{ id: string; chunk_index: number; content: string }>;
  }

  documentExists(id: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM kb_documents WHERE id = ?").get(id));
  }

  upsertDocumentRow(input: {
    id: string;
    cityId: string | null;
    title: string;
    content: string;
    tags: string;
    source: string;
    updatedAt: string;
  }) {
    if (this.documentExists(input.id)) {
      this.db
        .prepare(
          `
        UPDATE kb_documents
        SET city_id = ?, title = ?, content = ?, tags = ?, source = ?, updated_at = ?
        WHERE id = ?
      `,
        )
        .run(
          input.cityId,
          input.title,
          input.content,
          input.tags,
          input.source,
          input.updatedAt,
          input.id,
        );
      return;
    }

    this.db
      .prepare(
        `
        INSERT INTO kb_documents (id, city_id, title, source, content, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        input.id,
        input.cityId,
        input.title,
        input.source,
        input.content,
        input.tags,
        input.updatedAt,
        input.updatedAt,
      );
  }

  indexDocumentChunks(doc: KbDocumentRecord): number {
    return indexDocumentChunks(this.db, doc);
  }

  deleteDocumentFully(documentId: string) {
    deleteDocumentFully(this.db, documentId);
  }

  mapDocumentListRow(row: KbDocumentListRow) {
    return {
      id: row.id,
      cityId: row.city_id,
      title: row.title,
      source: row.source,
      tags: parseJsonStringArray(row.tags),
      updatedAt: row.updated_at,
      contentLength: row.content_length,
      chunkCount: row.chunk_count,
    };
  }
}
