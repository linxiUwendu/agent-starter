import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { frontendDistDir, repoEnvFile } from "./common/repo-root";

import { AuthModule } from "./auth/auth.module";
import { TravelModule } from "./travel/travel.module";

const frontendDist = frontendDistDir(__dirname);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: repoEnvFile(__dirname),
      ignoreEnvFile: process.env.NODE_ENV === "production",
    }),
    AuthModule,
    TravelModule,
    ServeStaticModule.forRoot({
      rootPath: frontendDist,
      exclude: ["/api*"],
      serveRoot: "/",
    }),
  ],
})
export class AppModule {}
