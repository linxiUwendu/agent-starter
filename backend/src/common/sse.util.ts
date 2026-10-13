import type { Response } from "express";

/**
 * @description 关闭 TCP Nagle 算法并刷新中间件缓冲，避免 SSE 小包被合并后一次性到达客户端。
 * @param res Express Response 对象
 * @returns void
 */
export function flushSse(res: Response) {
  const socket = res.socket;
  if (socket && !socket.destroyed) socket.setNoDelay(true);
  (res as Response & { flush?: () => void }).flush?.();
}

/**
 * @description 按 SSE 协议写入一条事件：`event:` 行 + JSON 序列化的 `data:` 行，以空行结尾。
 * @param res Express Response 对象
 * @param event 事件类型名（如 start、delta、done）
 * @param data 可 JSON 序列化的事件载荷
 * @returns void
 */
export function sendSse(res: Response, event: string, data: unknown) {
  flushSse(res);
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  flushSse(res);
}

/**
 * @description 初始化 SSE 响应头并发送连接确认注释行，客户端据此识别流已建立。
 * @param res Express Response 对象
 * @returns void
 */
export function initSse(res: Response) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  flushSse(res);
  res.write(": connected\n\n");
  flushSse(res);
}

/**
 * @description 一次 SSE 流式会话的封装，提供事件发送、增量推送与安全结束能力。
 */
export interface SseSession {
  /**
   * @description 发送任意命名的 SSE 事件（如 start、context），非 delta/done 的自定义事件。
   * @param event 事件类型名
   * @param data 可 JSON 序列化的载荷
   */
  send: (event: string, data: unknown) => void;
  /**
   * @description 推送 assistant 文本增量，内部累计 streamedChars 并发送 `delta` 事件。
   * @param text 增量文本片段
   */
  pushDelta: (text: string) => void;
  /**
   * @description 结束会话：发送最终 done/error 事件并关闭 Response，重复调用无效。
   * @param event 结束事件类型
   * @param payload 最终载荷（如 answer、error）
   */
  finish: (event: "done" | "error", payload: Record<string, unknown>) => void;
  /**
   * @description 返回本连接已通过 pushDelta 推送的字符总数，用于判断是否需要兜底模拟流式。
   * @returns 累计字符数
   */
  streamedChars: () => number;
}

/**
 * @description 启动 SSE 心跳定时器，定期写入注释行 `: ping` 防止代理或浏览器 idle 断开。
 * @param res Express Response 对象
 * @param keepaliveMs 心跳间隔毫秒数
 * @param isSettled 回调，返回 true 时会话已结束，跳过本次 ping
 * @returns Node.js 定时器句柄，finish 时需 clearInterval
 */
function startSseKeepalive(res: Response, keepaliveMs: number, isSettled: () => boolean) {
  return setInterval(() => {
    if (isSettled()) return;
    flushSse(res);
    res.write(": ping\n\n");
    flushSse(res);
  }, keepaliveMs);
}

/**
 * @description 创建一次完整的 SSE 会话：初始化头、心跳保活、delta 计数与安全 finish。
 * @param res Express Response 对象
 * @param keepaliveMs 心跳间隔，默认 8000ms
 * @returns SseSession 实例，含 send / pushDelta / finish / streamedChars
 */
export function createSseSession(res: Response, keepaliveMs = 8000): SseSession {
  initSse(res);

  let settled = false;
  let streamedChars = 0;
  const keepalive = startSseKeepalive(res, keepaliveMs, () => settled);

  const finish = (event: "done" | "error", payload: Record<string, unknown>) => {
    if (settled) return;
    settled = true;
    clearInterval(keepalive);
    sendSse(res, event, payload);
    res.end();
  };

  const pushDelta = (text: string) => {
    if (!text) return;
    streamedChars += text.length;
    sendSse(res, "delta", { text });
  };

  return {
    send: (event, data) => sendSse(res, event, data),
    pushDelta,
    finish,
    streamedChars: () => streamedChars,
  };
}

/**
 * @description 当 cursor-agent 未产出增量时，将完整答案按固定块大小切块并可选延迟，模拟流式输出体验。
 * @param sendDelta 增量推送回调，通常绑定 SseSession.pushDelta
 * @param text 待切分的完整答案文本
 * @param chunkSize 每块字符数，默认 16
 * @param delayMs 块间延迟毫秒数，默认 12；为 0 时不等待
 * @returns Promise，全部块推送完成后 resolve
 */
export async function streamTextAsDeltas(
  sendDelta: (text: string) => void,
  text: string,
  chunkSize = 16,
  delayMs = 12,
) {
  if (!text) return;
  for (let i = 0; i < text.length; i += chunkSize) {
    sendDelta(text.slice(i, i + chunkSize));
    if (delayMs > 0 && i + chunkSize < text.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export type StreamTextCharByCharOptions = {
  /** 目标每字间隔；长文会自动缩短以满足 maxDurationMs */
  charDelayMs?: number;
  /** 整段流式输出最长耗时，避免 Mock 长文过慢 */
  maxDurationMs?: number;
};

/**
 * @description 按 Unicode 字符逐字推送 delta，用于 Mock Agent 模拟打字机效果。
 * @param sendDelta 增量推送回调
 * @param text 完整文本
 * @param options 字符间隔与总时长上限
 */
export async function streamTextCharByChar(
  sendDelta: (text: string) => void,
  text: string,
  options: StreamTextCharByCharOptions = {},
) {
  if (!text) return;

  const chars = [...text];
  if (chars.length === 0) return;

  const charDelayMs = options.charDelayMs ?? 22;
  const maxDurationMs = options.maxDurationMs ?? 12_000;
  const delayMs =
    chars.length <= 1 || charDelayMs <= 0
      ? 0
      : Math.max(6, Math.min(charDelayMs, maxDurationMs / (chars.length - 1)));

  for (let i = 0; i < chars.length; i++) {
    sendDelta(chars[i]!);
    if (delayMs > 0 && i < chars.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
