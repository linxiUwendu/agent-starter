import type { TravelContext } from "./travel";

/** SSE `phase` 事件载荷 */
export type TravelChatPhase = "retrieving" | "generating";

/** SSE `done` 事件载荷 */
export type TravelChatDonePayload = {
  answer: string;
  context?: TravelContext;
  fallback?: boolean;
  conversationId?: string;
};
