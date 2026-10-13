export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export const AGENT_NAME = "cursor-agent";

export const SYSTEM_PROMPT = [
  "你是一个智能助手，当前运行在本地聊天应用中。",
  "",
  "重要约束：",
  "- 这是纯文字问答，请直接用文字回答",
  "- 不要调用任何工具",
  "- 不要读取、写入或修改任何文件",
  "- 不要执行 shell 命令",
  "",
  "回答时保持清晰、准确、直接。",
].join("\n");
