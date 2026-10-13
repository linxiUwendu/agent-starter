export type RagRetrieveMethod = "vector" | "fts" | "hybrid" | "rerank";

export interface RagChunkResult {
  chunkId: string;
  documentTitle: string;
  content: string;
  score: number;
  method: RagRetrieveMethod;
}

export interface RagRetrieveMeta {
  durationMs: number;
  terms: string[];
  methods: RagRetrieveMethod[];
  provider: "tfidf" | "openai";
  tokenEstimate: number;
  chunkCount: number;
  /** 本次检索实际扫描的分区 chunk 数（city + global） */
  vectorIndexSize: number;
  /** 内存中已构建的分区数 */
  vectorPartitions: number;
  /** 全库 chunk 总数（SQLite） */
  totalChunks: number;
  /** 是否对 RRF 候选池做了 lexical rerank */
  rerankApplied: boolean;
}

export interface RagRetrieveResult {
  chunks: RagChunkResult[];
  meta: RagRetrieveMeta;
}
