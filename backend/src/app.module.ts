import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import path from "node:path";

import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { TravelModule } from "./travel/travel.module";

const frontendDist = path.join(__dirname, "../../frontend/dist");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.join(__dirname, "../../.env"),
      ignoreEnvFile: process.env.NODE_ENV === "production",
    }),
    AuthModule,
    ChatModule,
    TravelModule,
    ServeStaticModule.forRoot({
      rootPath: frontendDist,
      exclude: ["/api*"],
      serveRoot: "/",
    }),
  ],
})
export class AppModule {}
