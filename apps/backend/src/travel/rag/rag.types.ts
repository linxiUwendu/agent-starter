import type { RagRetrieveMeta } from "@agent-starter/shared";

export type { RagRetrieveMeta };

export type RagRetrieveMethod = RagRetrieveMeta["methods"][number];

export interface RagChunkResult {
  chunkId: string;
  documentTitle: string;
  content: string;
  score: number;
  method: RagRetrieveMethod;
}

export interface RagRetrieveResult {
  chunks: RagChunkResult[];
  meta: RagRetrieveMeta;
}
