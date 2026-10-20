import type Database from "better-sqlite3";

/** 运行时增量迁移（已有 travel.db 启动时自动执行） */
export const RUNTIME_MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url  TEXT,
    google_sub  TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS user_memory (
    user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    content_md  TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL
  );
  `,
];

export function columnExists(db: Database.Database, table: string, column: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

export function applyRuntimeMigrations(db: Database.Database) {
  for (const sql of RUNTIME_MIGRATIONS) {
    db.exec(sql);
  }
  if (!columnExists(db, "conversations", "user_id")) {
    db.exec("ALTER TABLE conversations ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
    db.exec("CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC)");
  }
}
