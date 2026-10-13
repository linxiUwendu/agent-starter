import { Module } from "@nestjs/common";

import { ChatModule } from "../chat/chat.module";
import { DatabaseService } from "./database/database.service";
import { ConversationRepository } from "./database/repositories/conversation.repository";
import { KbRepository } from "./database/repositories/kb.repository";
import { PoiRepository } from "./database/repositories/poi.repository";
import { PoiService } from "./poi.service";
import { EmbeddingService } from "./rag/embedding.service";
import { RagService } from "./rag/rag.service";
import { TravelController } from "./travel.controller";
import { TravelService } from "./travel.service";
import { TravelToolsService } from "./travel-tools.service";

const repositories = [PoiRepository, KbRepository, ConversationRepository];

const domainServices = [PoiService, EmbeddingService, RagService, TravelToolsService, TravelService];

@Module({
  imports: [ChatModule],
  controllers: [TravelController],
  providers: [DatabaseService, ...repositories, ...domainServices],
})
export class TravelModule {}
