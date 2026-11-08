import type { RagRetrieveMeta as SharedRagRetrieveMeta } from "@agent-starter/shared";

export type RagRetrieveMethod = SharedRagRetrieveMeta["methods"][number];

export type RagRetrieveMeta = SharedRagRetrieveMeta;

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
