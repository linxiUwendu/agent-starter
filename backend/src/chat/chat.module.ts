import { Module } from "@nestjs/common";

import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { CursorAgentService } from "./cursor-agent.service";

@Module({
  controllers: [ChatController],
  providers: [ChatService, CursorAgentService],
  exports: [CursorAgentService],
})
export class ChatModule {}
