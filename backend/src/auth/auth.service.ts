import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";

import { DatabaseService } from "../travel/database/database.service";
import { applyMemoryPatch } from "../travel/user-memory.util";
import type { AuthUser } from "./auth.types";
import {
  GoogleVerifyTimeoutError,
  isGoogleNetworkError,
  raceWithTimeout,
  verifyGoogleIdTokenInsecureLocal,
  verifyGoogleIdTokenWithJwks,
} from "./google-id-token.util";
import { signAuthToken, verifyAuthToken } from "./jwt.util";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private get jwtSecret() {
    const secret = this.config.get<string>("JWT_SECRET");
    return secret?.trim() || "dev-only-change-jwt-secret-in-env";
  }

  /** GIS / One Tap 只需 Web Client ID（公开），无需 Client Secret */
  getGoogleClientId(): string | null {
    const id = this.config.get<string>("GOOGLE_CLIENT_ID")?.trim();
    return id || null;
  }

  googleSignInEnabled() {
    return !!this.getGoogleClientId();
  }

  allowDevLogin() {
    if (this.config.get<string>("AUTH_ALLOW_DEV_LOGIN") === "false") return false;
    if (this.config.get<string>("AUTH_ALLOW_DEV_LOGIN") === "true") return true;
    if (this.config.get<string>("NODE_ENV") === "production") return false;
    // 本地开发始终提供邮箱登录（GIS 脚本在国内常加载失败时的兜底）
    return true;
  }

  /**
   * 验证 Google Identity Services 返回的 ID Token，注册或登录用户。
   * @see https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
   */
  async signInWithGoogleCredential(credential: string): Promise<{ token: string; user: AuthUser }> {
    const clientId = this.getGoogleClientId();
    if (!clientId) {
      throw new UnauthorizedException({ error: "Google sign-in is not available." });
    }
    if (!credential?.trim()) {
      throw new UnauthorizedException({ error: "Missing Google credential." });
    }

    const profile = await this.verifyGoogleIdToken(credential.trim(), clientId);
    const user = this.upsertGoogleUser(
      profile.sub,
      profile.email,
      profile.name ?? null,
      profile.picture ?? null,
    );
    const token = signAuthToken({ sub: user.id, email: user.email }, this.jwtSecret);
    return { token, user };
  }

  /** 本地演示：仅 AUTH_ALLOW_DEV_LOGIN=true 时可用 */
  devSignIn(email: string, displayName?: string): { token: string; user: AuthUser } {
    if (!this.allowDevLogin()) {
      throw new UnauthorizedException({ error: "Dev login is disabled." });
    }
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new UnauthorizedException({ error: "Invalid email." });
    }
    const user = this.upsertGoogleUser(`dev_${normalized}`, normalized, displayName?.trim() || "演示用户", null);
    const token = signAuthToken({ sub: user.id, email: user.email }, this.jwtSecret);
    return { token, user };
  }

  private allowInsecureGoogleJwtOnNetworkFailure() {
    if (this.config.get<string>("NODE_ENV") === "production") return false;
    return this.config.get<string>("AUTH_GOOGLE_INSECURE_LOCAL_JWT") !== "false";
  }

  private isProduction() {
    return this.config.get<string>("NODE_ENV") === "production";
  }

  private verifyTimeoutMs() {
    return Number(this.config.get<string>("AUTH_GOOGLE_VERIFY_TIMEOUT_MS") ?? 4000);
  }

  private async verifyGoogleIdToken(idToken: string, clientId: string) {
    // 开发环境：GIS 已在浏览器完成授权，后端不再访问 googleapis.com（避免长时间挂起导致 500/超时）
    if (!this.isProduction() && this.allowInsecureGoogleJwtOnNetworkFailure()) {
      try {
        return verifyGoogleIdTokenInsecureLocal(idToken, clientId);
      } catch (localError) {
        throw new UnauthorizedException({
          error: localError instanceof Error ? localError.message : "Invalid Google token.",
        });
      }
    }

    try {
      return await raceWithTimeout(
        verifyGoogleIdTokenWithJwks(idToken, clientId),
        this.verifyTimeoutMs(),
      );
    } catch (error) {
      if (
        (error instanceof GoogleVerifyTimeoutError || isGoogleNetworkError(error)) &&
        this.allowInsecureGoogleJwtOnNetworkFailure()
      ) {
        this.logger.warn("Google JWKS 超时或不可达，已降级为本地解析 GIS token（仅开发）。");
        return verifyGoogleIdTokenInsecureLocal(idToken, clientId);
      }

      if (error instanceof GoogleVerifyTimeoutError || isGoogleNetworkError(error)) {
        throw new ServiceUnavailableException({
          error: "服务端无法访问 Google 验证接口，请配置 HTTPS_PROXY 后重试。",
        });
      }

      throw new UnauthorizedException({
        error: error instanceof Error ? error.message : "Invalid Google token.",
      });
    }
  }

  upsertGoogleUser(googleSub: string, email: string, displayName: string | null, avatarUrl: string | null): AuthUser {
    const conn = this.db.connection;
    const now = new Date().toISOString();
    const existing = conn
      .prepare("SELECT id, email, display_name, avatar_url FROM users WHERE google_sub = ?")
      .get(googleSub) as { id: string; email: string; display_name: string | null; avatar_url: string | null } | undefined;

    if (existing) {
      conn
        .prepare(
          "UPDATE users SET email = ?, display_name = ?, avatar_url = ?, updated_at = ? WHERE id = ?",
        )
        .run(email, displayName, avatarUrl, now, existing.id);
      return {
        id: existing.id,
        email,
        displayName,
        avatarUrl,
      };
    }

    const id = randomUUID();
    conn
      .prepare(
        `INSERT INTO users (id, email, display_name, avatar_url, google_sub, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, email, displayName, avatarUrl, googleSub, now, now);
    conn
      .prepare("INSERT INTO user_memory (user_id, content_md, updated_at) VALUES (?, ?, ?)")
      .run(id, "", now);

    return { id, email, displayName, avatarUrl };
  }

  userFromToken(token: string | undefined): AuthUser | null {
    if (!token?.trim()) return null;
    const payload = verifyAuthToken(token.trim(), this.jwtSecret);
    if (!payload) return null;
    const row = this.db.connection
      .prepare("SELECT id, email, display_name, avatar_url FROM users WHERE id = ?")
      .get(payload.sub) as
      | { id: string; email: string; display_name: string | null; avatar_url: string | null }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    };
  }

  getMemoryMarkdown(userId: string): string {
    const row = this.db.connection
      .prepare("SELECT content_md FROM user_memory WHERE user_id = ?")
      .get(userId) as { content_md: string } | undefined;
    return row?.content_md ?? "";
  }

  saveMemoryMarkdown(userId: string, contentMd: string) {
    const now = new Date().toISOString();
    this.db.connection
      .prepare(
        `INSERT INTO user_memory (user_id, content_md, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET content_md = excluded.content_md, updated_at = excluded.updated_at`,
      )
      .run(userId, contentMd, now);
  }

  updateMemoryFromUserMessage(userId: string, userText: string) {
    const trimmed = userText.trim();
    if (!trimmed) return;
    const current = this.getMemoryMarkdown(userId);
    const next = applyMemoryPatch(current, trimmed);
    if (next !== current.trim()) {
      this.saveMemoryMarkdown(userId, next);
    }
  }
}
