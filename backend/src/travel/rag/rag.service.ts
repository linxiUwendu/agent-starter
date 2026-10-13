import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { KbRepository } from "../database/repositories/kb.repository";
import { parseJsonStringArray } from "../database/json-column.util";
import {
  CityPartitionedVectorIndex,
  GLOBAL_PARTITION,
  toPartitionKey,
} from "./city-partitioned-vector-index";
import { EmbeddingService } from "./embedding.service";
import type { RagChunkResult, RagRetrieveMeta, RagRetrieveResult } from "./rag.types";
import {
  buildFtsQuery,
  estimateTokens,
  extractSearchTerms,
  HYBRID_RECALL_MULTIPLIER,
  HYBRID_RERANK_POOL_MIN,
  reciprocalRankFusion,
  rerankByLexicalOverlap,
} from "./rag.util";
import { VectorDocument, cosineSimilarityArrays } from "./vector-index";
import { randomUUID } from "node:crypto";

/** OpenAI 向量检索单城最大候选 chunk 数，避免全国扫描 */
const OPENAI_MAX_CANDIDATES = 300;

@Injectable()
/** RAG 知识库服务：BM25(FTS) + 向量混合检索、RRF 融合与 lexical rerank */
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private readonly vectorIndex = new CityPartitionedVectorIndex();

  constructor(
    private readonly kb: KbRepository,
    private readonly embeddingService: EmbeddingService,
  ) {}

  onModuleInit() {
    this.ensurePartition(GLOBAL_PARTITION);
    const total = this.kb.countChunks();
    this.logger.log(
      `Vector index lazy-ready: ${total} chunks in DB, global partition=${this.vectorIndex.scopedSize(undefined)} built`,
    );
  }

  private rebuildPartitionsForCity(cityId: string | null) {
    this.vectorIndex.invalidate(GLOBAL_PARTITION);
    this.ensurePartition(GLOBAL_PARTITION);

    const key = toPartitionKey(cityId);
    if (key !== GLOBAL_PARTITION) {
      this.vectorIndex.invalidate(key);
      this.ensurePartition(key);
    }

    this.logger.log(
      `Vector partition refreshed: city=${key}, scoped=${this.vectorIndex.scopedSize(cityId ?? undefined)}`,
    );
  }

  private loadPartitionDocs(partitionKey: string): VectorDocument[] {
    return this.kb.loadPartitionChunkDocs(partitionKey).map((row) => ({
      id: row.chunk_id,
      content: row.content,
      cityId: row.city_id,
    }));
  }

  private ensurePartition(partitionKey: string) {
    if (this.vectorIndex.hasPartition(partitionKey)) return;
    const docs = this.loadPartitionDocs(partitionKey);
    this.vectorIndex.buildPartition(partitionKey, docs);
    this.logger.debug(`Built vector partition ${partitionKey} (${docs.length} chunks)`);
  }

  private ensureSearchPartitions(cityId: string | undefined) {
    this.ensurePartition(GLOBAL_PARTITION);
    if (cityId) this.ensurePartition(cityId);
  }

  private hybridRecallLimit(limit: number): number {
    return Math.max(limit * HYBRID_RECALL_MULTIPLIER, HYBRID_RERANK_POOL_MIN);
  }

  private buildMeta(
    partial: Omit<RagRetrieveMeta, "vectorIndexSize" | "vectorPartitions" | "totalChunks"> & {
      city?: string;
    },
  ): RagRetrieveMeta {
    return {
      ...partial,
      vectorIndexSize: this.vectorIndex.scopedSize(partial.city),
      vectorPartitions: this.vectorIndex.partitionCount(),
      totalChunks: this.kb.countChunks(),
    };
  }

  /** 同步混合检索：FTS BM25 ∥ 本地 TF-IDF；小库默认路径。 */
  retrieveWithMeta(query: string, city?: string, limit = 5): RagRetrieveResult {
    const startedAt = Date.now();
    const terms = extractSearchTerms(query);

    if (terms.length === 0) {
      return this.emptyRetrieveResult(startedAt, city);
    }

    const recall = this.hybridRecallLimit(limit);
    const ftsQuery = buildFtsQuery(terms);
    const ftsResults = ftsQuery ? this.searchFts(ftsQuery, city, recall) : [];
    const vectorResults = this.searchVector(query, city, recall);

    return this.fuseHybridResults({
      query,
      terms,
      city,
      limit,
      startedAt,
      ftsResults,
      vectorResults,
    });
  }

  /**
   * Tool Loop / API 主入口：有 OpenAI embedding 且库内已向量化时走稠密 embedding，否则 TF-IDF。
   */
  async retrieveWithMetaAsync(
    query: string,
    city?: string,
    limit = 5,
  ): Promise<RagRetrieveResult> {
    const startedAt = Date.now();
    const terms = extractSearchTerms(query);

    if (terms.length === 0) {
      return this.emptyRetrieveResult(startedAt, city);
    }

    const recall = this.hybridRecallLimit(limit);
    const ftsQuery = buildFtsQuery(terms);
    const ftsResults = ftsQuery ? this.searchFts(ftsQuery, city, recall) : [];

    const stats = this.kb.getStats();
    const useOpenAiDense =
      this.embeddingService.provider === "openai" && stats.embeddedChunks > 0;

    const vectorResults = useOpenAiDense
      ? await this.searchOpenAiAsync(query, city, recall)
      : this.searchVector(query, city, recall);

    return this.fuseHybridResults({
      query,
      terms,
      city,
      limit,
      startedAt,
      ftsResults,
      vectorResults,
    });
  }

  private emptyRetrieveResult(startedAt: number, city?: string): RagRetrieveResult {
    return {
      chunks: [],
      meta: this.buildMeta({
        durationMs: Date.now() - startedAt,
        terms: [],
        methods: [],
        provider: this.embeddingService.provider,
        tokenEstimate: 0,
        chunkCount: 0,
        rerankApplied: false,
        city,
      }),
    };
  }

  private fuseHybridResults(input: {
    query: string;
    terms: string[];
    city?: string;
    limit: number;
    startedAt: number;
    ftsResults: RagChunkResult[];
    vectorResults: RagChunkResult[];
  }): RagRetrieveResult {
    const { query, terms, city, limit, startedAt, ftsResults, vectorResults } = input;
    const methods = new Set<RagRetrieveMeta["methods"][number]>();

    if (ftsResults.length) methods.add("fts");
    if (vectorResults.length) methods.add("vector");

    const fusion = reciprocalRankFusion([ftsResults, vectorResults]);
    const chunkMap = new Map<string, RagChunkResult>();
    for (const list of [ftsResults, vectorResults]) {
      for (const item of list) chunkMap.set(item.chunkId, item);
    }

    const poolSize = Math.max(limit * HYBRID_RECALL_MULTIPLIER, HYBRID_RERANK_POOL_MIN);
    const candidateIds = [...fusion.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, poolSize)
      .map(([chunkId]) => chunkId);

    const candidates = candidateIds.flatMap((id) => {
      const base = chunkMap.get(id);
      return base ? [base] : [];
    });

    const rerankApplied = candidates.length > 1;
    if (rerankApplied) methods.add("rerank");

    const reranked = rerankByLexicalOverlap(query, terms, candidates, fusion, limit);

    const chunks: RagChunkResult[] = reranked.map(({ item, score }) => ({
      ...item,
      score,
      method: "hybrid" as const,
    }));

    if (chunks.length > 1) methods.add("hybrid");

    const tokenEstimate = estimateTokens(chunks.map((c) => c.content).join("\n"));
    const durationMs = Date.now() - startedAt;

    const meta = this.buildMeta({
      durationMs,
      terms,
      methods: [...methods],
      provider: this.embeddingService.provider,
      tokenEstimate,
      chunkCount: chunks.length,
      rerankApplied,
      city,
    });

    this.logger.log(
      `RAG retrieve ${durationMs}ms terms=[${terms.join(",")}] methods=[${meta.methods.join(",")}] hits=${chunks.length} scope=${meta.vectorIndexSize}/${meta.totalChunks} tokens≈${tokenEstimate}`,
    );

    return { chunks, meta };
  }

  private searchVector(query: string, city: string | undefined, limit: number): RagChunkResult[] {
    this.ensureSearchPartitions(city);
    const hits = this.vectorIndex.search(query, city, limit);
    if (hits.length === 0) return [];

    const scoreMap = new Map(hits.map((h) => [h.id, h.score]));
    return this.kb
      .findChunksByIds(hits.map((h) => h.id))
      .map((row) => ({
        chunkId: row.chunk_id,
        documentTitle: row.document_title,
        content: row.content,
        score: scoreMap.get(row.chunk_id) ?? 0,
        method: "vector" as const,
      }))
      .sort((a, b) => b.score - a.score);
  }

  async searchOpenAiAsync(
    query: string,
    city: string | undefined,
    limit: number,
  ): Promise<RagChunkResult[]> {
    const queryEmbedding = await this.embeddingService.embed(query);
    if (!queryEmbedding) return [];

    const rows = this.kb.searchChunksForEmbedding(city, OPENAI_MAX_CANDIDATES);
    const scored: RagChunkResult[] = [];

    for (const row of rows) {
      const embedding = this.embeddingService.parseStoredEmbedding(row.embedding);
      if (!embedding) continue;
      const score = cosineSimilarityArrays(queryEmbedding, embedding);
      if (score <= 0) continue;
      scored.push({
        chunkId: row.chunk_id,
        documentTitle: row.document_title,
        content: row.content,
        score,
        method: "vector",
      });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private searchFts(ftsQuery: string, city: string | undefined, limit: number): RagChunkResult[] {
    try {
      return this.kb.searchChunksFts(ftsQuery, city, limit).map((row) => ({
        chunkId: row.chunk_id,
        documentTitle: row.document_title,
        content: row.content,
        score: row.rank,
        method: "fts" as const,
      }));
    } catch (error) {
      this.logger.warn(`FTS search failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  getStats() {
    const stats = this.kb.getStats();
    return {
      documents: stats.documents,
      chunks: stats.chunks,
      embeddedChunks: stats.embeddedChunks,
      vectorIndexSize: this.vectorIndex.totalBuiltSize(),
      vectorPartitionsBuilt: this.vectorIndex.partitionCount(),
      vectorCityPartitionsInDb: stats.cityPartitions,
      embeddingProvider: this.embeddingService.provider,
    };
  }

  listDocuments(city?: string) {
    return this.kb.listDocumentRows(city).map((row) => this.kb.mapDocumentListRow(row));
  }

  getDocument(id: string) {
    const row = this.kb.findDocumentRow(id);
    if (!row) return null;

    const chunks = this.kb.listDocumentChunkRows(id);
    return {
      id: row.id,
      cityId: row.city_id,
      title: row.title,
      source: row.source,
      content: row.content,
      tags: parseJsonStringArray(row.tags),
      updatedAt: row.updated_at,
      chunks: chunks.map((c) => ({
        id: c.id,
        index: c.chunk_index,
        content: c.content,
      })),
    };
  }

  upsertDocument(input: {
    id?: string;
    cityId?: string | null;
    title: string;
    content: string;
    tags?: string[];
    source?: string;
  }) {
    const id = input.id ?? `kb_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const tags = JSON.stringify(input.tags ?? []);
    const cityId = input.cityId ?? null;
    const source = input.source ?? "api";

    this.kb.upsertDocumentRow({
      id,
      cityId,
      title: input.title,
      content: input.content,
      tags,
      source,
      updatedAt: now,
    });

    const chunkCount = this.kb.indexDocumentChunks({
      id,
      city_id: cityId,
      title: input.title,
      content: input.content,
    });

    this.rebuildPartitionsForCity(cityId);
    this.logger.log(`KB upsert ${id} chunks=${chunkCount}`);

    return { id, chunkCount, document: this.getDocument(id) };
  }

  deleteDocument(id: string) {
    const doc = this.getDocument(id);
    if (!doc) return false;
    const cityId = doc.cityId;
    this.kb.deleteDocumentFully(id);
    this.rebuildPartitionsForCity(cityId);
    this.logger.log(`KB deleted ${id}`);
    return true;
  }
}
