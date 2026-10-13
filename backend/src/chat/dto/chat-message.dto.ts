import { IsIn, IsString, MinLength } from "class-validator";

export class ChatMessageDto {
  @IsIn(["user", "assistant"])
  role!: "user" | "assistant";

  @IsString()
  @MinLength(1)
  content!: string;
}
