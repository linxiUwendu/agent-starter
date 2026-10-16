import type { Logger } from "@nestjs/common";

import type { KbRepository } from "../database/repositories/kb.repository";
import type { RagChunkResult } from "./rag.types";
import { LocalTfidfIndex } from "./local-tfidf-index";

/** SQLite FTS5（BM25 rank）→ 统一 chunk 结果 */
export function searchFtsBm25(
  kb: KbRepository,
  logger: Logger,
  ftsQuery: string,
  city: string | undefined,
  limit: number,
): RagChunkResult[] {
  try {
    return kb.searchChunksFts(ftsQuery, city, limit).map((row) => ({
      chunkId: row.chunk_id,
      documentTitle: row.document_title,
      content: row.content,
      score: row.rank,
      method: "fts" as const,
    }));
  } catch (error) {
    logger.warn(`FTS search failed: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

function hydrateChunkHits(
  kb: KbRepository,
  hits: Array<{ id: string; score: number }>,
): RagChunkResult[] {
  if (hits.length === 0) return [];

  const scoreById = new Map(hits.map((h) => [h.id, h.score]));
  return kb
    .findChunksByIds(hits.map((h) => h.id))
    .map((row) => ({
      chunkId: row.chunk_id,
      documentTitle: row.document_title,
      content: row.content,
      score: scoreById.get(row.chunk_id) ?? 0,
      method: "vector" as const,
    }))
    .sort((a, b) => b.score - a.score);
}

/** 内存 TF-IDF：按需建分区 → 检索 → 回表（单入口，避免 RagService 多层 private） */
export function searchTfidfLocal(
  kb: KbRepository,
  index: LocalTfidfIndex,
  query: string,
  city: string | undefined,
  limit: number,
): RagChunkResult[] {
  index.prepareForSearch(kb, city);
  return hydrateChunkHits(kb, index.search(query, city, limit));
}
