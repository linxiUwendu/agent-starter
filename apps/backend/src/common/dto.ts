import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class OptionalCityQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  city?: string;
}

/** 对话等 UUID 以外、知识库文档等字符串主键 */
export class ResourceIdParamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  id!: string;
}

export class UuidParamDto {
  @IsUUID()
  id!: string;
}
