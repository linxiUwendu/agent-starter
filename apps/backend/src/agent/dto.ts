import { IsIn, IsString, MinLength } from "class-validator";

import { TrimString } from "../common/trim-string.util";

export class ChatMessageDto {
  @IsIn(["user", "assistant"])
  role!: "user" | "assistant";

  @TrimString()
  @IsString()
  @MinLength(1)
  content!: string;
}
