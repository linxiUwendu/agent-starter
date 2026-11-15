import { Module } from "@nestjs/common";

import { DatabaseModule } from "../travel/database/database.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard, OptionalJwtAuthGuard } from "./auth.guard";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard],
})
export class AuthModule {}
