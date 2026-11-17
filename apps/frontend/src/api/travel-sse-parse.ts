import type { TravelContext } from "../types/travel";
import type { TravelSseHandlers } from "./travel-sse.types";

export type ParsedSseMessage = {
  event: string;
  data: string;
  /** 仅有 event 行、尚无 data，需与后续 chunk 拼接 */
  incomplete: boolean;
};

/** SSE 帧分隔符：`\n\n` 或 `\r\n\r\n`（代理/运行时可能混合 CRLF） */
const SSE_FRAME_DELIM = /\r?\n\r?\n/;

/** 解析单个 SSE 消息块（空行分隔）；忽略块内 `: comment` 行 */
export function parseSseMessageBlock(part: string): ParsedSseMessage | null {
  const normalized = part.replace(/\r\n/g, "\n");
  if (!normalized.trim() || normalized.trim().startsWith(":")) return null;

  let event = "message";
  const dataLines: string[] = [];
  let sawEventOrData = false;

  for (const line of normalized.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event: ")) {
      event = line.slice(7).trim();
      sawEventOrData = true;
    } else if (line.startsWith("data: ")) {
      dataLines.push(line.slice(6).trim());
      sawEventOrData = true;
    }
  }

  if (!sawEventOrData) return null;

  const data = dataLines.join("\n");
  return {
    event,
    data,
    incomplete: dataLines.length === 0 && event !== "message",
  };
}

export type SseFeedState = {
  buffer: string;
  pendingEvent: string | null;
  flags: { gotDelta: { value: boolean }; gotDone: { value: boolean } };
};

export function createSseFeedState(): SseFeedState {
  return {
    buffer: "",
    pendingEvent: null,
    flags: { gotDelta: { value: false }, gotDone: { value: false } },
  };
}

/**
 * 追加一段 SSE 文本并分发已完整的 event 块（与 {@link consumeTravelSse} 同逻辑）。
 * @returns `error` 表示 JSON 解析失败且已调用 onError
 */
export function feedTravelSseChunk(
  state: SseFeedState,
  chunk: string,
  handlers: TravelSseHandlers,
): "ok" | "error" {
  state.buffer += chunk;
  const parts = state.buffer.split(SSE_FRAME_DELIM);
  state.buffer = parts.pop() ?? "";

  for (const part of parts) {
    const parsed = parseSseMessageBlock(part);
    if (!parsed) continue;

    if (parsed.incomplete) {
      state.buffer = `${part}\r\n\r\n${state.buffer}`;
      state.pendingEvent = parsed.event;
      continue;
    }

    let event = parsed.event;
    if (parsed.event === "message" && state.pendingEvent) {
      event = state.pendingEvent;
      state.pendingEvent = null;
    }

    if (!parsed.data) continue;

    try {
      dispatchTravelSseMessage(event, parsed.data, handlers, state.flags);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      handlers.onError(`SSE parse failed (${event}): ${detail}`);
      return "error";
    }
  }
  return "ok";
}

export function flushTravelSseBuffer(state: SseFeedState, handlers: TravelSseHandlers): void {
  if (!state.buffer.trim()) return;

  const parsed = parseSseMessageBlock(state.buffer);
  if (!parsed?.data) return;

  let event = parsed.event;
  if (parsed.event === "message" && state.pendingEvent) {
    event = state.pendingEvent;
    state.pendingEvent = null;
  }
  try {
    dispatchTravelSseMessage(event, parsed.data, handlers, state.flags);
  } catch {
    // trailing partial frame
  }
}

export function dispatchTravelSseMessage(
  event: string,
  data: string,
  handlers: TravelSseHandlers,
  flags: { gotDelta: { value: boolean }; gotDone: { value: boolean } },
): void {
  const trimmed = data.trim();
  if (!trimmed) return;

  const payload = JSON.parse(trimmed) as Record<string, unknown>;
  if (event === "start") handlers.onStart?.();
  else if (event === "phase") {
    const stage = (payload as { stage?: string }).stage;
    if (stage === "retrieving" || stage === "generating") handlers.onPhase?.(stage);
  } else if (event === "context") handlers.onContext?.(payload as unknown as TravelContext);
  else if (event === "delta") {
    flags.gotDelta.value = true;
    handlers.onDelta(String(payload.text ?? ""));
  } else if (event === "done") {
    flags.gotDone.value = true;
    handlers.onDone({
      answer: String(payload.answer ?? ""),
      context: payload.context as TravelContext | undefined,
      fallback: Boolean(payload.fallback),
      conversationId: payload.conversationId ? String(payload.conversationId) : undefined,
    });
  } else if (event === "error") {
    handlers.onError(String(payload.error ?? "Unknown error."));
  }
}