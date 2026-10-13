export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

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

export interface ItineraryDetail {
  id: string;
  city_id: string;
  title: string;
  days: number;
  summary: string | null;
  tags: string[];
  items: ItineraryItem[];
}

export interface TravelContext {
  city: string;
  cityName: string;
  pois: Poi[];
  photoSpots: PhotoSpot[];
  itinerary: ItineraryDetail | null;
  toolCalls: Array<{ name: string; args: Record<string, unknown>; resultCount: number }>;
  ragChunks: RagChunk[];
  ragMeta?: RagRetrieveMeta | null;
  toolLoopSteps?: ToolLoopStep[];
}

export interface ToolLoopStep {
  iteration: number;
  action: "tool_calls" | "finish";
  calls?: Array<{ name: string; args: Record<string, unknown>; resultCount: number }>;
  reason?: string;
}

export interface RagRetrieveMeta {
  durationMs: number;
  terms: string[];
  methods: string[];
  provider: string;
  tokenEstimate: number;
  chunkCount: number;
  /** 本次检索实际扫描的分区 chunk 数（city + global） */
  vectorIndexSize: number;
  /** 内存中已构建的分区数 */
  vectorPartitions: number;
  /** 全库 chunk 总数（SQLite） */
  totalChunks: number;
}

export interface RagChunk {
  chunkId: string;
  documentTitle: string;
  content: string;
  score: number;
  method?: string;
}

export interface FoodGuide {
  foods: Poi[];
  foodItinerary: ItineraryDetail | null;
}

export type StatusVariant = "" | "streaming" | "error";

export type PanelTab = "itinerary" | "food" | "rag";

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
  chunks: Array<{ id: string; index: number; content: string }>;
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
