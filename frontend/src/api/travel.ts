import type {
  ChatMessage,
  CityRecord,
  FoodGuide,
  Poi,
  PhotoSpot,
  TravelContext,
  KbDocumentDetail,
  KbDocumentSummary,
} from "../types/travel";

const STREAM_IDLE_TIMEOUT_MS = 300_000;

/**
 * 旅游聊天 SSE（Server-Sent Events）流式响应的回调处理器集合。
 * 用于在 {@link consumeTravelSse} 解析服务端推送时，按事件类型分发到对应回调。
 */
interface TravelSseHandlers {
  /** 收到 `start` 事件时触发，表示流式响应已开始 */
  onStart?: () => void;
  /** 收到 `phase` 事件：retrieving | generating */
  onPhase?: (stage: "retrieving" | "generating") => void;
  /** 收到 `context` 事件时触发，携带检索到的旅游上下文（POI、行程等） */
  onContext?: (context: TravelContext) => void;
  /** 收到 `delta` 事件时触发，携带增量文本片段，用于逐字渲染助手回复 */
  onDelta: (text: string) => void;
  /** 收到 `done` 事件时触发，携带完整答案及可选的上下文、降级标记和会话 ID */
  onDone: (payload: {
    answer: string;
    context?: TravelContext;
    fallback?: boolean;
    conversationId?: string;
  }) => void;
  /** 收到 `error` 事件或解析失败时触发，携带错误描述 */
  onError: (error: string) => void;
  /** 流结束但未收到任何 delta 或 done 事件时触发，通常表示连接空闲超时 */
  onIdleTimeout?: () => void;
}

/**
 * 消费旅游聊天接口返回的 SSE 流式响应。
 *
 * 按 SSE 规范逐块读取响应体，解析 `event` / `data` 字段，并依据事件类型
 * （start、context、delta、done、error）调用 {@link TravelSseHandlers} 中对应的回调。
 * 内置空闲超时检测：若在 {@link STREAM_IDLE_TIMEOUT_MS} 内无新数据，将取消读取并在
 * 未收到有效内容时触发 `onIdleTimeout`。
 *
 * @param response - 来自 `/api/travel/chat` 等接口的 `fetch` Response 对象，需包含可读 body
 * @param handlers - SSE 事件回调集合，至少需提供 `onDelta`、`onDone`、`onError`
 * @returns Promise，在流读取完毕或出错后 resolve；若 response 无 body 则抛出 Error
 */
export async function consumeTravelSse(response: Response, handlers: TravelSseHandlers) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body.");

  const decoder = new TextDecoder();
  let buffer = "";
  let lastActivityAt = Date.now();
  let gotDelta = false;
  let gotDone = false;

  const idleTimer = setInterval(() => {
    if (Date.now() - lastActivityAt > STREAM_IDLE_TIMEOUT_MS) {
      reader.cancel("Stream idle timeout.").catch(() => {});
    }
  }, 2000);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lastActivityAt = Date.now();
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (!part.trim() || part.trim().startsWith(":")) continue;

        let event = "message";
        let data = "";

        for (const line of part.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7);
          else if (line.startsWith("data: ")) data = line.slice(6);
        }

        if (!data) continue;

        const payload = JSON.parse(data) as Record<string, unknown>;
        if (event === "start") handlers.onStart?.();
        else if (event === "phase") {
          const stage = (payload as { stage?: string }).stage;
          if (stage === "retrieving" || stage === "generating") handlers.onPhase?.(stage);
        } else if (event === "context") handlers.onContext?.(payload as unknown as TravelContext);
        else if (event === "delta") {
          gotDelta = true;
          handlers.onDelta(String(payload.text ?? ""));
        } else if (event === "done") {
          gotDone = true;
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
    }
  } finally {
    clearInterval(idleTimer);
  }

  if (!gotDone && !gotDelta) handlers.onIdleTimeout?.();
}

/**
 * 向旅游聊天 API 发送对话请求，返回原始 Response 供 SSE 消费。
 *
 * 请求体包含完整消息历史、目标城市及可选的会话 ID；调用方通常配合
 * {@link consumeTravelSse} 处理流式回复。
 *
 * @param messages - 当前对话的消息列表（含 user / assistant 角色）
 * @param city - 城市 ID（如 `shanghai`、`chengdu`），用于限定检索与回复范围
 * @param signal - AbortSignal，用于取消进行中的请求（如用户点击停止）
 * @param conversationId - 可选会话 ID；传入则续写已有对话，省略则视为新会话
 * @returns 指向 `POST /api/travel/chat` 的 fetch Response（未校验 HTTP 状态）
 */
export async function sendTravelChat(
  messages: ChatMessage[],
  city: string,
  signal: AbortSignal,
  conversationId?: string | null,
) {
  return fetch("/api/travel/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      messages,
      city,
      conversationId: conversationId ?? undefined,
    }),
  });
}

/**
 * 获取系统支持的全部城市列表。
 *
 * @returns 城市记录数组，每项包含 id、name 等字段；HTTP 非 2xx 时抛出 Error
 */
export async function fetchCities() {
  const res = await fetch("/api/travel/cities");
  if (!res.ok) throw new Error("Failed to load cities.");
  return res.json() as Promise<CityRecord[]>;
}

/**
 * 获取指定城市的美食指南数据。
 *
 * @param city - 城市 ID
 * @returns 美食指南对象（餐厅、小吃、分类等）；HTTP 非 2xx 时抛出 Error
 */
export async function fetchFoodGuide(city: string) {
  const res = await fetch(`/api/travel/food-guide?city=${encodeURIComponent(city)}`);
  if (!res.ok) throw new Error("Failed to load food guide.");
  return res.json() as Promise<FoodGuide>;
}

/**
 * 获取指定城市地图所需的 POI 与拍照机位标记。
 *
 * @param city - 城市 ID
 * @returns 包含 `pois` 与 `photoSpots` 两个数组的对象；HTTP 非 2xx 时抛出 Error
 */
export async function fetchMapMarkers(city: string) {
  const res = await fetch(`/api/travel/map-markers?city=${encodeURIComponent(city)}`);
  if (!res.ok) throw new Error("Failed to load map markers.");
  return res.json() as Promise<{ pois: Poi[]; photoSpots: PhotoSpot[] }>;
}

/**
 * 获取 RAG 知识库文档摘要列表及统计信息。
 *
 * @param city - 可选城市 ID；传入则仅返回该城市相关文档，省略则返回全部
 * @returns 含 `stats`（文档数、分块数）与 `documents` 摘要列表；HTTP 非 2xx 时抛出 Error
 */
export async function fetchKbAdminConfig() {
  const res = await fetch("/api/travel/rag/admin-config");
  if (!res.ok) throw new Error("Failed to load KB admin config.");
  return res.json() as Promise<{ enabled: boolean }>;
}

export async function verifyKbAdminLogin(key: string) {
  const res = await fetch("/api/travel/rag/admin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  return res.ok;
}

export async function fetchRagDocuments(city?: string, adminHeaders: Record<string, string> = {}) {
  const q = city ? `?city=${encodeURIComponent(city)}` : "";
  const res = await fetch(`/api/travel/rag/documents${q}`, { headers: { ...adminHeaders } });
  if (!res.ok) throw new Error("Failed to load RAG documents.");
  return res.json() as Promise<{
    stats: { documents: number; chunks: number };
    documents: KbDocumentSummary[];
  }>;
}

/**
 * 根据文档 ID 获取 RAG 知识库单篇文档的完整详情。
 *
 * @param id - 文档唯一标识
 * @returns 文档详情（标题、正文、标签、分块等）；HTTP 非 2xx 时抛出 Error
 */
export async function fetchRagDocument(id: string, adminHeaders: Record<string, string> = {}) {
  const res = await fetch(`/api/travel/rag/documents/${encodeURIComponent(id)}`, {
    headers: { ...adminHeaders },
  });
  if (!res.ok) throw new Error("Failed to load document.");
  return res.json() as Promise<KbDocumentDetail>;
}

/**
 * 删除 RAG 知识库文档及其分块、FTS 索引。
 *
 * @param id - 文档唯一标识
 */
export async function deleteRagDocument(id: string, adminHeaders: Record<string, string> = {}) {
  const res = await fetch(`/api/travel/rag/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...adminHeaders },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to delete document.");
  }
  return res.json() as Promise<{ ok: boolean; id: string }>;
}

/**
 * 获取当前用户的全部对话会话摘要列表。
 *
 * @returns 会话摘要数组（id、标题、城市、更新时间等）；HTTP 非 2xx 时抛出 Error
 */
export async function fetchConversations() {
  const res = await fetch("/api/travel/conversations");
  if (!res.ok) throw new Error("Failed to load conversations.");
  return res.json() as Promise<import("../types/travel").ConversationSummary[]>;
}

/**
 * 根据会话 ID 加载完整对话详情（含消息历史）。
 *
 * @param id - 会话唯一标识
 * @returns 会话详情对象；HTTP 非 2xx 时抛出 Error
 */
export async function fetchConversation(id: string) {
  const res = await fetch(`/api/travel/conversations/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Failed to load conversation.");
  return res.json() as Promise<import("../types/travel").ConversationDetail>;
}

/**
 * 创建新的旅游对话会话。
 *
 * @param city - 可选初始城市 ID；省略则使用服务端默认值
 * @returns 新建会话的完整详情；HTTP 非 2xx 时抛出 Error
 */
export async function createConversation(city?: string) {
  const res = await fetch("/api/travel/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city, title: "新对话" }),
  });
  if (!res.ok) throw new Error("Failed to create conversation.");
  return res.json() as Promise<import("../types/travel").ConversationDetail>;
}

/**
 * 删除指定对话会话。
 *
 * @param id - 待删除的会话唯一标识
 * @returns Promise，删除成功时 resolve；HTTP 非 2xx 时抛出 Error
 */
export async function deleteConversation(id: string) {
  const res = await fetch(`/api/travel/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete conversation.");
}

/**
 * 创建或更新 RAG 知识库文档（upsert）。
 *
 * 若 body 含 `id` 则更新已有文档，否则创建新文档。
 *
 * @param body - 文档载荷
 * @param body.id - 可选文档 ID；有则更新，无则新建
 * @param body.cityId - 可选关联城市 ID
 * @param body.title - 文档标题
 * @param body.content - 文档正文（将被分块向量化）
 * @param body.tags - 可选标签列表
 * @returns 保存后的文档 JSON；HTTP 非 2xx 时抛出 Error
 */
export async function upsertRagDocument(
  body: {
    id?: string;
    cityId: string;
    cityIdLocked?: boolean;
    title: string;
    content: string;
    tags?: string[];
  },
  adminHeaders: Record<string, string> = {},
) {
  const res = await fetch("/api/travel/rag/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminHeaders },
    body: JSON.stringify({ cityIdLocked: true, ...body }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new Error(body?.error ?? body?.message ?? "Failed to save document.");
  }
  return res.json() as Promise<{
    id: string;
    chunkCount: number;
    embeddedChunks?: number;
    cityIdResolved?: string | null;
    cityIdWarning?: string;
    document: KbDocumentDetail;
  }>;
}

/** 上传 PDF，服务端解析文本并写入知识库（需运维 Header）。 */
export async function uploadRagPdfDocument(
  input: { cityId: string; title?: string; file: File },
  adminHeaders: Record<string, string> = {},
) {
  const form = new FormData();
  form.append("cityId", input.cityId);
  form.append("file", input.file);
  if (input.title?.trim()) form.append("title", input.title.trim());

  const res = await fetch("/api/travel/rag/documents/upload-pdf", {
    method: "POST",
    headers: { ...adminHeaders },
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to upload PDF.");
  }
  return res.json() as Promise<{
    id: string;
    chunkCount: number;
    cityIdResolved?: string | null;
    document: KbDocumentDetail;
  }>;
}
