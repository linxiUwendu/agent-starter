import type Database from "better-sqlite3";

import { chunkText, formatTextForFtsIndex } from "../rag/rag.util";

export interface KbDocumentRecord {
  id: string;
  city_id: string | null;
  title: string;
  content: string;
}

export function clearDocumentChunks(db: Database.Database, documentId: string) {
  const chunkIds = db
    .prepare("SELECT id FROM kb_chunks WHERE document_id = ?")
    .all(documentId) as Array<{ id: string }>;

  const deleteFts = db.prepare("DELETE FROM kb_chunks_fts WHERE chunk_id = ?");
  for (const { id } of chunkIds) {
    deleteFts.run(id);
  }

  db.prepare("DELETE FROM kb_chunks WHERE document_id = ?").run(documentId);
}

export function indexDocumentChunks(db: Database.Database, doc: KbDocumentRecord): number {
  clearDocumentChunks(db, doc.id);

  const chunks = chunkText(doc.content);
  const insertChunk = db.prepare(`
    INSERT INTO kb_chunks (id, document_id, city_id, chunk_index, content, embedding)
    VALUES (?, ?, ?, ?, ?, NULL)
  `);
  const insertFts = db.prepare(`
    INSERT INTO kb_chunks_fts (chunk_id, city_id, document_title, content)
    VALUES (?, ?, ?, ?)
  `);

  chunks.forEach((content, index) => {
    const chunkId = `${doc.id}_c${index}`;
    insertChunk.run(chunkId, doc.id, doc.city_id, index, content);
    insertFts.run(
      chunkId,
      doc.city_id,
      formatTextForFtsIndex(doc.title),
      formatTextForFtsIndex(content),
    );
  });

  return chunks.length;
}

export function deleteDocumentFully(db: Database.Database, documentId: string) {
  clearDocumentChunks(db, documentId);
  db.prepare("DELETE FROM kb_documents WHERE id = ?").run(documentId);
}
