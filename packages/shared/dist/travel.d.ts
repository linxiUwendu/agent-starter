import type { ChatMessage } from "./chat";
import type { RagChunk, RagRetrieveMeta } from "./rag";
export type PoiType = "attraction" | "food" | "hotel" | "photo_spot";
export interface CityRecord {
    id: string;
    name: string;
    province: string;
    description: string;
    center_lat: number | null;
    center_lng: number | null;
    highlights: string[];
}
export interface Poi {
    id: string;
    city_id: string;
    name: string;
    type: PoiType;
    tags: string[];
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
}
export interface PhotoSpot {
    id: string;
    poi_id: string | null;
    city_id: string;
    name: string;
    lat: number;
    lng: number;
    angle: string | null;
    best_light: string | null;
    best_season: string | null;
    description: string | null;
    tips: string | null;
    poi_name?: string;
}
/** 行程列表行（无 items） */
export interface Itinerary {
    id: string;
    city_id: string;
    title: string;
    days: number;
    summary: string | null;
    tags: string[];
}
export interface ItineraryItem {
    id: string;
    itinerary_id: string;
    day: number;
    sort_order: number;
    time_slot: string | null;
    poi_id: string | null;
    note: string | null;
    duration_min: number | null;
    poi?: Poi | null;
}
export interface ItineraryDetail extends Itinerary {
    items: ItineraryItem[];
}
export type ToolLoopStep = {
    action: "prefetch";
    calls?: Array<{
        name: string;
        args: Record<string, unknown>;
        resultCount: number;
    }>;
    reason?: string;
} | {
    action: "tool_calls";
    iteration: number;
    calls?: Array<{
        name: string;
        args: Record<string, unknown>;
        resultCount: number;
    }>;
} | {
    action: "finish";
    iteration: number;
    reason?: string;
};
export interface TravelContext {
    city: string;
    cityName: string;
    pois: Poi[];
    photoSpots: PhotoSpot[];
    itinerary: ItineraryDetail | null;
    toolCalls: Array<{
        name: string;
        args: Record<string, unknown>;
        resultCount: number;
    }>;
    ragChunks: RagChunk[];
    ragMeta?: RagRetrieveMeta | null;
    toolLoopSteps?: ToolLoopStep[];
}
export interface FoodGuide {
    foods: Poi[];
    foodItinerary: ItineraryDetail | null;
}
export interface KbDocumentSummary {
    id: string;
    cityId: string | null;
    title: string;
    source: string;
    tags: string[];
    updatedAt: string;
    contentLength: number;
    chunkCount: number;
}
export interface KbDocumentDetail extends Omit<KbDocumentSummary, "contentLength" | "chunkCount"> {
    content: string;
    chunks: Array<{
        id: string;
        index: number;
        content: string;
    }>;
}
export interface ConversationSummary {
    id: string;
    title: string;
    cityId: string | null;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
}
export interface ConversationDetail extends ConversationSummary {
    messages: ChatMessage[];
}
export type StatusVariant = "" | "streaming" | "error";
export type PanelTab = "itinerary" | "food" | "rag";
//# sourceMappingURL=travel.d.ts.map