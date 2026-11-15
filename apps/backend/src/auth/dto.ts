import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { TrimString } from "../common/trim-string.util";

export class GoogleSignInDto {
  @IsString()
  @MinLength(20)
  credential!: string;
}

export class DevLoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}
