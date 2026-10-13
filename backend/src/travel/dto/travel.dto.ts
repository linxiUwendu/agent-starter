import { Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";

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

export class SearchPoiQueryDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(["attraction", "food", "hotel", "photo_spot", "all"])
  type?: "attraction" | "food" | "hotel" | "photo_spot" | "all";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ItineraryQueryDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  days?: number;

  @IsOptional()
  @IsString()
  theme?: string;
}

export class UpsertKbDocumentDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsString()
  title!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
