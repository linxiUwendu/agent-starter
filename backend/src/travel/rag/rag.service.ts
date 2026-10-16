import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { KbRepository } from "../database/repositories/kb.repository";
import { parseJsonStringArray } from "../database/json-column.util";
import { EmbeddingService } from "./embedding.service";
import { LocalTfidfIndex } from "./local-tfidf-index";
import { searchFtsBm25, searchTfidfLocal } from "./rag-retrieval";
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
import { cosineSimilarityArrays } from "./vector-index";
import { randomUUID } from "node:crypto";

/** OpenAI 向量检索单城最大候选 chunk 数，避免全国扫描 */
const OPENAI_MAX_CANDIDATES = 300;

@Injectable()
/** RAG 知识库服务：BM25(FTS) + 向量混合检索、RRF 融合与 lexical rerank */
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private readonly tfidfIndex = new LocalTfidfIndex();

  constructor(
    private readonly kb: KbRepository,
    private readonly embeddingService: EmbeddingService,
  ) {}

  onModuleInit() {
    this.tfidfIndex.warmGlobal(this.kb);
    const total = this.kb.countChunks();
    this.logger.log(
      `Vector index lazy-ready: ${total} chunks in DB, global partition=${this.tfidfIndex.scopedSize(undefined)} built`,
    );
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
      vectorIndexSize: this.tfidfIndex.scopedSize(partial.city),
      vectorPartitions: this.tfidfIndex.partitionCount(),
      totalChunks: this.kb.countChunks(),
    };
  }

  /**
   * 混合检索入口：FTS BM25 ∥ TF-IDF；若 provider=openai 且 embeddedChunks>0 则第二路为 embedding。
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
    const ftsResults = ftsQuery
      ? searchFtsBm25(this.kb, this.logger, ftsQuery, city, recall)
      : [];

    const stats = this.kb.getStats();
    const useOpenAiDense =
      this.embeddingService.provider === "openai" && stats.embeddedChunks > 0;

    const vectorResults = useOpenAiDense
      ? await this.searchOpenAiAsync(query, city, recall)
      : searchTfidfLocal(this.kb, this.tfidfIndex, query, city, recall);

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

  getStats() {
    const stats = this.kb.getStats();
    return {
      documents: stats.documents,
      chunks: stats.chunks,
      embeddedChunks: stats.embeddedChunks,
      vectorIndexSize: this.tfidfIndex.totalBuiltSize(),
      vectorPartitionsBuilt: this.tfidfIndex.partitionCount(),
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

  async upsertDocument(input: {
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

    this.tfidfIndex.refreshAfterKbChange(this.kb, cityId);
    const embedded = await this.embedChunksForDocument(id);
    this.logger.log(`KB upsert ${id} chunks=${chunkCount} embedded=${embedded}`);

    return { id, chunkCount, embeddedChunks: embedded, document: this.getDocument(id) };
  }

  /** OpenAI 配置下为新/更新的 chunk 写入 embedding，便于第二轨立即可用。 */
  private async embedChunksForDocument(documentId: string): Promise<number> {
    if (this.embeddingService.provider !== "openai") return 0;

    const chunks = this.kb.listDocumentChunkRows(documentId);
    let done = 0;

    for (const chunk of chunks) {
      const vector = await this.embeddingService.embed(chunk.content);
      if (!vector) continue;
      this.kb.updateChunkEmbedding(
        chunk.id,
        this.embeddingService.serializeEmbedding(vector),
      );
      done += 1;
    }

    return done;
  }

  deleteDocument(id: string) {
    const doc = this.getDocument(id);
    if (!doc) return false;
    const cityId = doc.cityId;
    this.kb.deleteDocumentFully(id);
    this.tfidfIndex.refreshAfterKbChange(this.kb, cityId);
    this.logger.log(`KB deleted ${id}`);
    return true;
  }
}
