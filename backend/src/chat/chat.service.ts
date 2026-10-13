import { Injectable, Logger } from "@nestjs/common";
import type { Response } from "express";

import { ChatMessage } from "../agent/agent.constants";
import { createSseSession, streamTextAsDeltas } from "../common/sse.util";
import { CursorAgentService } from "./cursor-agent.service";

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly cursorAgent: CursorAgentService) {}

  /**
   * @description 通用聊天 SSE 主流程：组装 prompt → 建立 SSE 会话 → 调用 cursor-agent 流式生成 → 无增量时兜底切块 → 发送 done/error。
   * @param messages 前端传入的对话历史
   * @param res Express Response，用于 SSE 连接与事件推送
   * @returns Promise，在 SSE finish 并关闭连接后 resolve
   */
  async streamChat(messages: ChatMessage[], res: Response) {
    const prompt = this.cursorAgent.buildPrompt(messages);
    const sse = createSseSession(res);
    sse.send("start", {});

    this.logger.log(`chat start messages=${messages.length} promptLen=${prompt.length}`);

    try {
      const answer = await this.cursorAgent.run(prompt, sse.pushDelta);

      // agent 只在结束时返回全文、过程中无 delta 时，兜底模拟流式
      if (sse.streamedChars() === 0 && answer) {
        await streamTextAsDeltas(sse.pushDelta, answer);
      }

      sse.finish("done", { answer });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown cursor-agent error.";
      sse.finish("error", { error: message });
    }
  }
}
