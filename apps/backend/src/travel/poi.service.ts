import { Injectable } from "@nestjs/common";

import { parseJsonStringArray } from "./database/json-column.util";
import { PoiRepository } from "./database/repositories/poi.repository";
import type {
  GetItineraryParams,
  ItineraryDetail,
  PhotoSpot,
  Poi,
  RecommendFoodParams,
  SearchPhotoSpotParams,
  SearchPoiParams,
} from "./travel.types";
import { DEFAULT_CITY } from "./travel.constants";
import type { CityRecord } from "./travel.types";

@Injectable()
export class PoiService {
  constructor(private readonly poiRepo: PoiRepository) {}

  searchPoi(params: SearchPoiParams = {}): Poi[] {
    return this.poiRepo.searchPois(params);
  }

  getPoiById(id: string): Poi | null {
    return this.poiRepo.findPoiById(id);
  }

  getPhotoSpots(params: SearchPhotoSpotParams = {}): PhotoSpot[] {
    return this.poiRepo.searchPhotoSpots(params);
  }

  listItineraries(city = DEFAULT_CITY) {
    return this.poiRepo.listItinerariesByCity(city);
  }

  getItinerary(id: string): ItineraryDetail | null {
    const row = this.poiRepo.findItineraryRow(id);
    if (!row) return null;

    const items = this.poiRepo.listItineraryItems(id, row.schedule);
    return {
      id: row.id,
      city_id: row.city_id,
      title: row.title,
      days: row.days,
      summary: row.summary,
      tags: parseJsonStringArray(row.tags),
      items: items.map((item) => ({
        ...item,
        poi: item.poi_id ? this.getPoiById(item.poi_id) : null,
      })),
    };
  }

  findItinerary(params: GetItineraryParams = {}): ItineraryDetail | null {
    const city = params.city ?? DEFAULT_CITY;
    let rows = this.listItineraries(city);

    if (params.days) rows = rows.filter((t) => t.days === params.days);
    if (params.theme?.trim()) {
      const theme = params.theme.trim();
      rows = rows.filter(
        (t) =>
          t.title.includes(theme) ||
          t.summary?.includes(theme) ||
          t.tags.some((tag) => tag.includes(theme)),
      );
    }
    if (rows.length === 0) rows = this.listItineraries(city);

    return rows[0] ? this.getItinerary(rows[0].id) : null;
  }

  recommendFood(params: RecommendFoodParams = {}): Poi[] {
    const queryParts = [params.area, params.cuisine].filter(Boolean).join(" ");
    return this.searchPoi({
      city: params.city,
      type: "food",
      query: queryParts || undefined,
      limit: params.limit ?? 6,
    });
  }

  getAllMapMarkers(city = DEFAULT_CITY) {
    return {
      pois: this.searchPoi({ city, type: "all", limit: 100 }),
      photoSpots: this.getPhotoSpots({ city, limit: 100 }),
    };
  }

  listCities(): CityRecord[] {
    return this.poiRepo.listCities();
  }

  getCity(cityId: string): CityRecord | null {
    return this.poiRepo.findCityById(cityId);
  }

  getFoodGuide(city = DEFAULT_CITY) {
    return {
      foods: this.searchPoi({ city, type: "food", limit: 20 }),
      foodItinerary: this.findItinerary({ city, theme: "美食" }),
    };
  }
}
