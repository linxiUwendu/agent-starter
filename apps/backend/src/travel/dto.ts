import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

import { ChatMessageDto } from "../agent/dto";
import { TrimString } from "../common/trim-string.util";

export class TravelChatRequestDto {
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(64)
  city?: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];
}

export class CreateConversationDto {
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(64)
  city?: string;

  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class RagAdminLoginDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  key?: string;
}

export class UpsertKbDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  id?: string;

  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  cityId!: string;

  @IsOptional()
  @IsBoolean()
  cityIdLocked?: boolean;

  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @TrimString()
  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];
}

export class UploadRagPdfBodyDto {
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  cityId!: string;

  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(500)
  title?: string;
}
