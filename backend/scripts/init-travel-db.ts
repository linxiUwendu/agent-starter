/**
 * 从种子数据生成 data/travel.db（开发/CI 维护工具，运行时不会调用）。
 *
 * 用法：npm run db:init -w backend
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import { SCHEMA_SQL } from "../src/travel/database/schema";
import { indexDocumentChunks } from "../src/travel/database/kb-chunk-index";
import { ALL_CITY_SEEDS } from "./seed-data/seed-data.cities";
import { KB_DOCUMENT_SEEDS } from "./seed-data/seed-data.kb";
import type { CitySeed } from "./seed-data/seed.types";

const dbPath =
  process.env.TRAVEL_DB_PATH ?? path.resolve(__dirname, "../../data/travel.db");

function insertCitySeed(db: Database.Database, seed: CitySeed) {
  const { city, pois, photoSpots, itineraries } = seed;

  db.prepare(
    `INSERT INTO cities (id, name, province, description, center_lat, center_lng, highlights)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    city.id,
    city.name,
    city.province,
    city.description,
    city.center_lat,
    city.center_lng,
    JSON.stringify(city.highlights),
  );

  const insertPoi = db.prepare(`
    INSERT INTO pois (
      id, city_id, name, category, tags, lat, lng, address, open_hours, ticket,
      avg_duration_min, price_level, description, tips, best_time, rating,
      parent_poi_id, capture_meta
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const poi of pois) {
    insertPoi.run(
      poi.id,
      city.id,
      poi.name,
      poi.type === "photo_spot" ? "photo" : poi.type,
      JSON.stringify(poi.tags),
      poi.lat,
      poi.lng,
      poi.address,
      poi.open_hours,
      poi.ticket,
      poi.avg_duration_min,
      poi.price_level,
      poi.description,
      poi.tips,
      poi.best_time,
      poi.rating,
      null,
      null,
    );
  }

  for (const spot of photoSpots) {
    insertPoi.run(
      spot.id,
      city.id,
      spot.name,
      "photo",
      "[]",
      spot.lat,
      spot.lng,
      null,
      null,
      null,
      null,
      null,
      spot.description,
      spot.tips,
      null,
      null,
      spot.poi_id ?? null,
      JSON.stringify({
        angle: spot.angle,
        best_light: spot.best_light,
        best_season: spot.best_season,
      }),
    );
  }

  const insertTrip = db.prepare(`
    INSERT INTO itineraries (id, city_id, title, days, summary, tags, schedule)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const trip of itineraries) {
    const schedule = trip.items.map((item) => ({
      day: item.day,
      order: item.sort_order,
      time: item.time_slot,
      poi_id: item.poi_id,
      note: item.note,
      duration_min: item.duration_min,
    }));

    insertTrip.run(
      trip.id,
      city.id,
      trip.title,
      trip.days,
      trip.summary,
      JSON.stringify(trip.tags),
      JSON.stringify(schedule),
    );
  }
}

function insertKnowledgeBaseSeeds(db: Database.Database) {
  const insertDoc = db.prepare(`
    INSERT INTO kb_documents (id, city_id, title, source, content, tags, created_at, updated_at)
    VALUES (?, ?, ?, 'seed', ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();

  for (const doc of KB_DOCUMENT_SEEDS) {
    insertDoc.run(
      doc.id,
      doc.city_id || null,
      doc.title,
      doc.content,
      JSON.stringify(doc.tags),
      now,
      now,
    );

    indexDocumentChunks(db, {
      id: doc.id,
      city_id: doc.city_id || null,
      title: doc.title,
      content: doc.content,
    });
  }
}

function main() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);

  for (const seed of ALL_CITY_SEEDS) {
    insertCitySeed(db, seed);
  }
  insertKnowledgeBaseSeeds(db);

  const cities = (db.prepare("SELECT COUNT(*) AS c FROM cities").get() as { c: number }).c;
  const pois = (db.prepare("SELECT COUNT(*) AS c FROM pois").get() as { c: number }).c;
  const kb = (db.prepare("SELECT COUNT(*) AS c FROM kb_documents").get() as { c: number }).c;
  const chunks = (db.prepare("SELECT COUNT(*) AS c FROM kb_chunks").get() as { c: number }).c;

  db.close();
  console.log(`Created ${dbPath}`);
  console.log(`  cities: ${cities}, pois: ${pois}, kb_documents: ${kb}, kb_chunks: ${chunks}`);
}

main();
