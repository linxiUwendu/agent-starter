import type {
  CityRecord,
  ConversationDetail,
  ConversationSummary,
  Itinerary,
  ItineraryDetail,
  ItineraryItem,
  PhotoSpot,
  Poi,
  PoiType,
  RagChunk,
  ToolLoopStep,
  TravelContext,
} from "@agent-starter/shared";

export type {
  CityRecord,
  ConversationDetail,
  ConversationSummary,
  Itinerary,
  ItineraryDetail,
  ItineraryItem,
  PhotoSpot,
  Poi,
  PoiType,
  RagChunk,
  ToolLoopStep,
  TravelContext,
};

export interface SearchPoiParams {
  city?: string;
  query?: string;
  type?: PoiType | "all";
  tags?: string[];
  limit?: number;
}

export interface SearchPhotoSpotParams {
  city?: string;
  poi_id?: string;
  query?: string;
  limit?: number;
}

export interface GetItineraryParams {
  city?: string;
  days?: number;
  theme?: string;
}

export interface RecommendFoodParams {
  city?: string;
  area?: string;
  cuisine?: string;
  limit?: number;
}
