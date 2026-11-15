import { Module } from "@nestjs/common";

import { CursorAgentService } from "./cursor-agent.service";

/** cursor-agent CLI 封装；旅游流式回答与 Tool Planner 共用，无独立 HTTP */
@Module({
  providers: [CursorAgentService],
  exports: [CursorAgentService],
})
export class AgentModule {}
