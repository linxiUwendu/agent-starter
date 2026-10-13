export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS cities (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  province    TEXT,
  description TEXT,
  center_lat  REAL NOT NULL,
  center_lng  REAL NOT NULL,
  highlights  TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(highlights))
);

CREATE TABLE IF NOT EXISTS pois (
  id               TEXT PRIMARY KEY,
  city_id          TEXT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL CHECK(category IN ('attraction', 'food', 'hotel', 'photo')),
  tags             TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags)),
  lat              REAL,
  lng              REAL,
  address          TEXT,
  open_hours       TEXT,
  ticket           TEXT,
  avg_duration_min INTEGER,
  price_level      TEXT,
  description      TEXT,
  tips             TEXT,
  best_time        TEXT,
  rating           REAL,
  parent_poi_id    TEXT REFERENCES pois(id) ON DELETE SET NULL,
  capture_meta     TEXT CHECK(capture_meta IS NULL OR json_valid(capture_meta))
);

CREATE INDEX IF NOT EXISTS idx_pois_city     ON pois(city_id);
CREATE INDEX IF NOT EXISTS idx_pois_category ON pois(city_id, category);
CREATE INDEX IF NOT EXISTS idx_pois_parent   ON pois(parent_poi_id);

CREATE TABLE IF NOT EXISTS itineraries (
  id       TEXT PRIMARY KEY,
  city_id  TEXT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  title    TEXT NOT NULL,
  days     INTEGER NOT NULL CHECK(days > 0),
  summary  TEXT,
  tags     TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags)),
  schedule TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(schedule))
);

CREATE INDEX IF NOT EXISTS idx_itineraries_city ON itineraries(city_id, days);

CREATE TABLE IF NOT EXISTS kb_documents (
  id         TEXT PRIMARY KEY,
  city_id    TEXT REFERENCES cities(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'seed' CHECK(source IN ('seed', 'api', 'import', 'test')),
  content    TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kb_documents_city ON kb_documents(city_id);

CREATE TABLE IF NOT EXISTS kb_chunks (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  city_id      TEXT REFERENCES cities(id) ON DELETE SET NULL,
  chunk_index  INTEGER NOT NULL,
  content      TEXT NOT NULL,
  embedding    TEXT,
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_city ON kb_chunks(city_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc  ON kb_chunks(document_id);

CREATE VIRTUAL TABLE IF NOT EXISTS kb_chunks_fts USING fts5(
  chunk_id        UNINDEXED,
  city_id         UNINDEXED,
  document_title,
  content,
  tokenize='unicode61'
);

CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  city_id    TEXT REFERENCES cities(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_city    ON conversations(city_id);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content          TEXT NOT NULL,
  sort_order       INTEGER NOT NULL,
  created_at       TEXT NOT NULL,
  context_snapshot TEXT CHECK(context_snapshot IS NULL OR json_valid(context_snapshot)),
  UNIQUE(conversation_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conv ON conversation_messages(conversation_id, sort_order);
`;
