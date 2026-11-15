import type { TravelChatDonePayload, TravelChatPhase } from "@agent-starter/shared";
import type { TravelContext } from "../types/travel";

/**
 * 旅游聊天 SSE 流式响应的回调处理器集合。
 */
export interface TravelSseHandlers {
  onStart?: () => void;
  onPhase?: (stage: TravelChatPhase) => void;
  onContext?: (context: TravelContext) => void;
  onDelta: (text: string) => void;
  onDone: (payload: TravelChatDonePayload) => void;
  onError: (error: string) => void;
  onIdleTimeout?: () => void;
}