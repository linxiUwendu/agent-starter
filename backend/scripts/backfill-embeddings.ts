/**
 * 为 kb_chunks 回填 OpenAI embedding（需 OPENAI_API_KEY + RAG_EMBEDDING_PROVIDER=openai）
 * 用法：npm run rag:embed
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import { EmbeddingService } from "../src/travel/rag/embedding.service";
import { ConfigService } from "@nestjs/config";

async function main() {
  const config = new ConfigService();
  const embedding = new EmbeddingService(config);

  if (embedding.provider !== "openai") {
    console.error("Set RAG_EMBEDDING_PROVIDER=openai and OPENAI_API_KEY in .env");
    process.exit(1);
  }

  const dbPath =
    config.get<string>("TRAVEL_DB_PATH") ??
    path.resolve(__dirname, "../../data/travel.db");

  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);
  const rows = db
    .prepare("SELECT id, content FROM kb_chunks WHERE embedding IS NULL OR embedding = ''")
    .all() as Array<{ id: string; content: string }>;

  console.log(`Backfilling ${rows.length} chunks...`);

  const update = db.prepare("UPDATE kb_chunks SET embedding = ? WHERE id = ?");
  let done = 0;

  for (const row of rows) {
    const vector = await embedding.embed(row.content);
    if (!vector) {
      console.warn(`Skip ${row.id}: embedding failed`);
      continue;
    }
    update.run(embedding.serializeEmbedding(vector), row.id);
    done += 1;
    if (done % 5 === 0) console.log(`  ${done}/${rows.length}`);
  }

  db.close();
  console.log(`Done. Embedded ${done} chunks.`);
}

void main();
