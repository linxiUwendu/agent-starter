/**
 * @description 从 cursor-agent stream-json 单行事件中提取相对已推送文本的新增增量，便于流式回调与单测。
 * @param event 解析后的 JSON 行对象，通常为 type=assistant 的 partial 输出
 * @param streamedText 当前已推送给客户端的累积文本
 * @returns 新增后缀字符串；无增量或重复内容时返回 null
 */
/** 供 login-shell  spawn 安全拼接 prompt 等参数 */
export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export function buildCursorAgentShellCommand(command: string, args: string[]): string {
  return [command, ...args.map(shellSingleQuote)].join(" ");
}

/** cursor-agent 子进程/云端常见的可重试网络错误 */
export function isRetryableCursorAgentError(message: string): boolean {
  return /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|\[unavailable\]|timed out/i.test(message);
}

/** 将 CLI 原始错误转为可操作的提示（不改变 Mock / 单元测试行为） */
export function enrichCursorAgentErrorMessage(message: string, authHint: string): string {
  if (/ETIMEDOUT|ECONNRESET|\[unavailable\]/i.test(message)) {
    return [
      `cursor-agent 连接 Cursor 云端失败（${message.trim()}）。`,
      "常见原因：网络不稳定、需要可用的代理/VPN、防火墙拦截，或登录/API Key 异常导致长时间重连。",
      `可检查：终端执行 \`cursor-agent -p --trust "ping" --mode ask\` 是否成功；${authHint}`,
      "开发演示可设 MOCK_AGENT=true，仍保留 RAG/POI 检索与规则 Tool Loop。",
      "若曾设 CURSOR_AGENT_SPAWN_SHELL=login，请改回 direct（login-shell 易触发 12s ETIMEDOUT）。",
    ].join(" ");
  }
  if (/Authentication required/i.test(message)) {
    return `cursor-agent 未登录。${authHint}`;
  }
  return message.trim() || "cursor-agent failed";
}

export function computeStreamDelta(
  event: Record<string, unknown>,
  streamedText: string,
): string | null {
  if (event.type !== "assistant") return null;

  const message = event.message as { content?: Array<{ text?: string }> } | undefined;
  if (!message?.content?.length) return null;

  const text = message.content.map((p) => p.text ?? "").join("");
  if (!text) return null;

  if (streamedText && text.startsWith(streamedText)) {
    const suffix = text.slice(streamedText.length);
    return suffix || null;
  }
  if (!streamedText) return text;
  if ("timestamp_ms" in event && event.timestamp_ms != null) return text;
  return null;
}

/**
 * @description 从 mock/travel prompt 中按三级 Markdown 标题提取指定区块正文。
 * @param prompt 完整 prompt 文本
 * @param heading 不含 `###` 前缀的标题名（如「POI 列表」）
 * @returns 该标题至下一 `###` 之间的 trimmed 文本；未找到时返回空串
 */
function extractSection(prompt: string, heading: string): string {
  const marker = `### ${heading}`;
  const idx = prompt.indexOf(marker);
  if (idx === -1) return "";
  const rest = prompt.slice(idx + marker.length);
  const nextHeading = rest.search(/\n### /);
  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
}

/**
 * @description 从 travel prompt 的「检索到的{城市}旅游数据」标题中解析城市显示名。
 * @param prompt 完整 prompt 文本
 * @returns 城市名；匹配失败时返回「目的地」
 */
function extractCityName(prompt: string): string {
  const match = prompt.match(/检索到的(.+?)旅游数据/);
  return match?.[1] ?? "目的地";
}

/**
 * @description 基于 travel prompt 内嵌的 RAG/行程/POI 区块生成 Mock 模式下的 Markdown 演示回复。
 * @param prompt 含结构化旅游数据的完整 prompt
 * @returns Mock 旅行建议 Markdown 文本
 */
function generateTravelMockAnswer(prompt: string): string {
  const city = extractCityName(prompt);
  const parts = [
    "> **Mock 模式**：未调用 cursor-agent，基于检索数据生成的演示回复。",
    "",
    `## ${city}旅行建议`,
    "",
    "根据当前检索到的 POI、行程与知识库文档，整理如下：",
    "",
  ];

  const rag = extractSection(prompt, "参考文档摘录（RAG）");
  if (rag) {
    parts.push("### 攻略要点", ...rag.split("\n").slice(0, 10), "");
  }

  const itineraryLine = prompt.match(/### 参考行程：(.+)/);
  if (itineraryLine) {
    const block = extractSection(prompt, `参考行程：${itineraryLine[1]}`);
    parts.push(`### 行程安排：${itineraryLine[1]}`, ...block.split("\n").slice(0, 8), "");
  }

  const pois = extractSection(prompt, "POI 列表");
  if (pois) {
    parts.push(
      "### 推荐地点",
      ...pois.split("\n").filter((line) => line.startsWith("-")).slice(0, 6),
      "",
    );
  }

  if (parts.length <= 6) {
    parts.push("暂未检索到足够数据，请尝试更具体的问题，例如「成都火锅推荐」或「西安三日行程」。");
  }

  parts.push("", "---", "*设置 `MOCK_AGENT=false` 并配置 cursor-agent 后可启用真实 AI 回复。*");
  return parts.join("\n");
}

/**
 * @description 为通用聊天 prompt 生成 Mock 模式下的简短占位回复。
 * @param prompt 含对话 transcript 的 prompt
 * @returns Mock 通用聊天 Markdown 文本
 */
function generateChatMockAnswer(prompt: string): string {
  const lines = prompt.split("\n");
  const lastUser = [...lines].reverse().find((line) => line.startsWith("用户："));
  const question = lastUser?.replace(/^用户：/, "") ?? "你的问题";
  return [
    "> **Mock 模式** 演示回复",
    "",
    `收到你的消息：「${question.slice(0, 200)}」`,
    "",
    "当前为 Mock Agent 模式，未连接真实 LLM。旅游相关问答请使用 `/api/travel/chat` 以获得 POI + RAG 增强回复。",
  ].join("\n");
}

/**
 * @description MOCK_AGENT=true 时，根据 prompt 是否含旅游数据区块，路由到旅行或通用 Mock 答案生成器。
 * @param prompt 传给 cursor-agent 的完整 prompt
 * @returns 可经 streamTextAsDeltas 流式输出的演示答案全文
 */
export function generateMockAnswer(prompt: string): string {
  const isTravel = prompt.includes("检索到的") && prompt.includes("旅游数据");
  return isTravel ? generateTravelMockAnswer(prompt) : generateChatMockAnswer(prompt);
}
