/** API 与前端展示的 RAG 检索元信息（与后端序列化一致） */
export type RagRetrieveMethod = "vector" | "fts" | "hybrid" | "rerank";

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
  /** 全库 chunk 总数 */
  totalChunks: number;
  /** 是否对 RRF 候选池做了 lexical rerank */
  rerankApplied: boolean;
}

export interface RagChunk {
  chunkId: string;
  documentTitle: string;
  content: string;
  score: number;
  method?: string;
}
