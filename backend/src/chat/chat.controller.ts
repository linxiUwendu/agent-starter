import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";

import { ChatService } from "./chat.service";
import { ChatMessageDto } from "./dto/chat-message.dto";
import { ChatRequestDto } from "./dto/chat-request.dto";
import { CursorAgentService } from "./cursor-agent.service";

function normalizeMessages(messages: ChatMessageDto[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content.trim(),
  }));
}

@Controller("api")
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly cursorAgent: CursorAgentService,
  ) {}

  @Get("health")
  health() {
    return this.cursorAgent.getHealthInfo();
  }

  @Post("chat")
  async chat(@Body() body: ChatRequestDto, @Res() res: Response) {
    const messages = normalizeMessages(body.messages ?? []);

    if (messages.length === 0) {
      throw new BadRequestException({ error: "messages is required." });
    }

    await this.chatService.streamChat(messages, res);
  }
}
