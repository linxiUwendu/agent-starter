import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from "class-validator";

import { ChatMessageDto } from "../../chat/dto/chat-message.dto";

export class TravelChatRequestDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];
}

export class UpsertKbDocumentDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsBoolean()
  cityIdLocked?: boolean;

  @IsString()
  title!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
