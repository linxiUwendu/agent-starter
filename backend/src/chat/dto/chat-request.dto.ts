import { Type } from "class-transformer";
import { IsArray, ValidateNested } from "class-validator";

import { ChatMessageDto } from "./chat-message.dto";

export class ChatRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];
}
