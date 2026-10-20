import { Body, Controller, Get, Logger, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";

import { clearAuthSessionCookie, setAuthSessionCookie } from "./auth-cookie.util";
import { AuthService } from "./auth.service";
import { getAuthUser, JwtAuthGuard, OptionalJwtAuthGuard } from "./auth.guard";

@Controller("api/auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get("config")
  configStatus() {
    const googleClientId = this.auth.getGoogleClientId();
    return {
      googleEnabled: this.auth.googleSignInEnabled(),
      googleClientId,
      devLoginEnabled: this.auth.allowDevLogin(),
    };
  }

  /** Google Identity Services：前端提交 credential (ID Token)，服务端校验后写 HttpOnly Cookie */
  @Post("google")
  async googleSignIn(@Body("credential") credential: string, @Res({ passthrough: true }) res: Response) {
    try {
      const { token, user } = await this.auth.signInWithGoogleCredential(credential);
      const secure = this.config.get<string>("NODE_ENV") === "production";
      setAuthSessionCookie(res, token, secure);
      this.logger.log(`Google sign-in ok user=${user.email}`);
      return { ok: true, user };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Google sign-in failed: ${message}`);
      throw error;
    }
  }

  /** 无 Google 配置时的本地演示登录（需 AUTH_ALLOW_DEV_LOGIN=true） */
  @Post("dev-login")
  devLogin(
    @Body("email") email: string,
    @Body("displayName") displayName: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = this.auth.devSignIn(email, displayName);
    const secure = this.config.get<string>("NODE_ENV") === "production";
    setAuthSessionCookie(res, token, secure);
    return { ok: true, user };
  }

  @Get("me")
  @UseGuards(OptionalJwtAuthGuard)
  me(@Req() req: Request) {
    const user = getAuthUser(req);
    return { user: user ?? null };
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    clearAuthSessionCookie(res);
    return { ok: true };
  }

  @Get("memory")
  @UseGuards(JwtAuthGuard)
  getMemory(@Req() req: Request) {
    const user = getAuthUser(req)!;
    return { contentMd: this.auth.getMemoryMarkdown(user.id) };
  }

  @Patch("memory")
  @UseGuards(JwtAuthGuard)
  patchMemory(@Req() req: Request, @Body("contentMd") contentMd?: string) {
    const user = getAuthUser(req)!;
    this.auth.saveMemoryMarkdown(user.id, String(contentMd ?? ""));
    return { ok: true };
  }
}
