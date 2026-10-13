import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database.service";
import {
  parseCaptureMeta,
  parseItinerarySchedule,
  parseJsonStringArray,
} from "../json-column.util";
import type {
  Itinerary,
  ItineraryItem,
  PhotoSpot,
  Poi,
  PoiType,
  SearchPhotoSpotParams,
  SearchPoiParams,
} from "../../travel.types";
import type { CityRecord } from "../../travel.types";
import { DEFAULT_CITY } from "../../travel.constants";

type PoiCategory = "attraction" | "food" | "hotel" | "photo";

type PoiRow = {
  id: string;
  city_id: string;
  name: string;
  category: PoiCategory;
  tags: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  open_hours: string | null;
  ticket: string | null;
  avg_duration_min: number | null;
  price_level: string | null;
  description: string | null;
  tips: string | null;
  best_time: string | null;
  rating: number | null;
  parent_poi_id: string | null;
  capture_meta: string | null;
};

const CATEGORY_TO_TYPE: Record<PoiCategory, PoiType> = {
  attraction: "attraction",
  food: "food",
  hotel: "hotel",
  photo: "photo_spot",
};

const TYPE_TO_CATEGORY: Record<Exclude<PoiType, "photo_spot">, Exclude<PoiCategory, "photo">> = {
  attraction: "attraction",
  food: "food",
  hotel: "hotel",
};

function mapPoiRow(row: PoiRow): Poi {
  const { category, parent_poi_id: _parent, capture_meta: _meta, ...rest } = row;
  return {
    ...rest,
    type: CATEGORY_TO_TYPE[category],
    tags: parseJsonStringArray(row.tags),
  };
}

function mapPhotoSpotRow(row: PoiRow & { poi_name?: string | null }): PhotoSpot {
  const meta = parseCaptureMeta(row.capture_meta);
  return {
    id: row.id,
    poi_id: row.parent_poi_id,
    city_id: row.city_id,
    name: row.name,
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    angle: meta.angle ?? null,
    best_light: meta.best_light ?? null,
    best_season: meta.best_season ?? null,
    description: row.description,
    tips: row.tips,
    poi_name: row.poi_name ?? undefined,
  };
}

@Injectable()
export class PoiRepository {
  constructor(private readonly database: DatabaseService) {}

  private get db() {
    return this.database.connection;
  }

  searchPois(params: SearchPoiParams = {}): Poi[] {
    const city = params.city ?? DEFAULT_CITY;
    const limit = params.limit ?? 8;
    const clauses = ["city_id = ?", "category != 'photo'"];
    const values: unknown[] = [city];

    if (params.type && params.type !== "all") {
      clauses.push("category = ?");
      values.push(params.type === "photo_spot" ? "photo" : TYPE_TO_CATEGORY[params.type]);
    }
    if (params.query?.trim()) {
      const q = `%${params.query.trim()}%`;
      clauses.push("(name LIKE ? OR description LIKE ? OR address LIKE ? OR tips LIKE ? OR tags LIKE ?)");
      values.push(q, q, q, q, q);
    }

    let rows = this.db
      .prepare(`SELECT * FROM pois WHERE ${clauses.join(" AND ")} ORDER BY rating DESC`)
      .all(...values) as PoiRow[];

    if (params.tags?.length) {
      rows = rows.filter((row) => {
        const tags = parseJsonStringArray(row.tags);
        return params.tags!.some((tag) => tags.some((t) => t.includes(tag)));
      });
    }

    return rows.slice(0, limit).map((row) => mapPoiRow(row));
  }

  findPoiById(id: string): Poi | null {
    const row = this.db.prepare("SELECT * FROM pois WHERE id = ?").get(id) as PoiRow | undefined;
    return row ? mapPoiRow(row) : null;
  }

  searchPhotoSpots(params: SearchPhotoSpotParams = {}): PhotoSpot[] {
    const city = params.city ?? DEFAULT_CITY;
    const limit = params.limit ?? 6;
    const clauses = ["p.city_id = ?", "p.category = 'photo'"];
    const values: unknown[] = [city];

    if (params.poi_id) {
      clauses.push("p.parent_poi_id = ?");
      values.push(params.poi_id);
    }
    if (params.query?.trim()) {
      const q = `%${params.query.trim()}%`;
      clauses.push("(p.name LIKE ? OR p.description LIKE ? OR p.tips LIKE ?)");
      values.push(q, q, q);
    }

    return this.db
      .prepare(
        `
        SELECT p.*, parent.name AS poi_name
        FROM pois p
        LEFT JOIN pois parent ON parent.id = p.parent_poi_id
        WHERE ${clauses.join(" AND ")}
        ORDER BY p.name
        LIMIT ?
      `,
      )
      .all(...values, limit)
      .map((row) => mapPhotoSpotRow(row as PoiRow & { poi_name?: string | null }));
  }

  listItinerariesByCity(city = DEFAULT_CITY): Itinerary[] {
    const rows = this.db
      .prepare(
        "SELECT id, city_id, title, days, summary, tags FROM itineraries WHERE city_id = ? ORDER BY days",
      )
      .all(city) as Array<Omit<Itinerary, "tags"> & { tags: string }>;

    return rows.map((row) => ({ ...row, tags: parseJsonStringArray(row.tags) }));
  }

  findItineraryRow(id: string): (Omit<Itinerary, "tags"> & { tags: string; schedule: string }) | null {
    const row = this.db
      .prepare("SELECT id, city_id, title, days, summary, tags, schedule FROM itineraries WHERE id = ?")
      .get(id) as (Omit<Itinerary, "tags"> & { tags: string; schedule: string }) | undefined;
    return row ?? null;
  }

  listItineraryItems(itineraryId: string, scheduleJson: string): ItineraryItem[] {
    return parseItinerarySchedule(scheduleJson).map((entry) => ({
      id: `${itineraryId}_d${entry.day}_${entry.order}`,
      itinerary_id: itineraryId,
      day: entry.day,
      sort_order: entry.order,
      time_slot: entry.time ?? null,
      poi_id: entry.poi_id ?? null,
      note: entry.note ?? null,
      duration_min: entry.duration_min ?? null,
    }));
  }

  listCities(): CityRecord[] {
    const rows = this.db
      .prepare(
        "SELECT id, name, province, description, center_lat, center_lng, highlights FROM cities ORDER BY name",
      )
      .all() as Array<Omit<CityRecord, "highlights"> & { highlights: string }>;

    return rows.map((row) => ({ ...row, highlights: parseJsonStringArray(row.highlights) }));
  }

  findCityById(cityId: string): CityRecord | null {
    const row = this.db
      .prepare(
        "SELECT id, name, province, description, center_lat, center_lng, highlights FROM cities WHERE id = ?",
      )
      .get(cityId) as (Omit<CityRecord, "highlights"> & { highlights: string }) | undefined;

    if (!row) return null;
    return { ...row, highlights: parseJsonStringArray(row.highlights) };
  }
}
