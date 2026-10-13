export interface CityMeta {
  id: string;
  name: string;
  province: string;
  description: string;
  center_lat: number;
  center_lng: number;
  highlights: string[];
}

export interface PoiSeed {
  id: string;
  name: string;
  type: "attraction" | "food" | "hotel" | "photo_spot";
  tags: string[];
  lat: number;
  lng: number;
  address: string;
  open_hours: string;
  ticket: string;
  avg_duration_min: number;
  price_level: string;
  description: string;
  tips: string;
  best_time: string;
  rating: number;
}

export interface PhotoSpotSeed {
  id: string;
  poi_id?: string;
  name: string;
  lat: number;
  lng: number;
  angle: string;
  best_light: string;
  best_season: string;
  description: string;
  tips: string;
}

export interface ItineraryItemSeed {
  day: number;
  sort_order: number;
  time_slot: string;
  poi_id: string;
  note: string;
  duration_min: number;
}

export interface ItinerarySeed {
  id: string;
  title: string;
  days: number;
  summary: string;
  tags: string[];
  items: ItineraryItemSeed[];
}

export interface CitySeed {
  city: CityMeta;
  pois: PoiSeed[];
  photoSpots: PhotoSpotSeed[];
  itineraries: ItinerarySeed[];
}
