import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { DatabaseModule } from "./database/database.module";
import { ConversationRepository } from "./database/repositories/conversation.repository";
import { KbRepository } from "./database/repositories/kb.repository";
import { PoiRepository } from "./database/repositories/poi.repository";
import { PoiService } from "./poi.service";
import { EmbeddingService } from "./rag/embedding.service";
import { RagService } from "./rag/rag.service";
import { KbAdminGuard } from "./kb-admin.guard";
import { TravelController } from "./travel.controller";
import { TravelService } from "./travel.service";
import { TravelToolsService } from "./travel-tools.service";

const repositories = [PoiRepository, KbRepository, ConversationRepository];

const domainServices = [PoiService, EmbeddingService, RagService, TravelToolsService, TravelService];

@Module({
  imports: [DatabaseModule, AuthModule, ChatModule],
  controllers: [TravelController],
  providers: [KbAdminGuard, ...repositories, ...domainServices],
})
export class TravelModule {}
