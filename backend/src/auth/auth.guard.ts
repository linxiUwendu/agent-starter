import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "./auth.service";
import type { AuthUser } from "./auth.types";

export const AUTH_USER_KEY = "authUser";

function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = req.cookies?.auth_token;
  if (typeof cookie === "string") return cookie;
  return undefined;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = this.auth.userFromToken(readToken(req));
    if (!user) throw new UnauthorizedException({ error: "Login required." });
    (req as Request & { [AUTH_USER_KEY]: AuthUser })[AUTH_USER_KEY] = user;
    return true;
  }
}

/** 有 token 则解析用户，无 token 继续（游客） */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = this.auth.userFromToken(readToken(req));
    if (user) {
      (req as Request & { [AUTH_USER_KEY]: AuthUser })[AUTH_USER_KEY] = user;
    }
    return true;
  }
}

export function getAuthUser(req: Request): AuthUser | undefined {
  return (req as Request & { [AUTH_USER_KEY]?: AuthUser })[AUTH_USER_KEY];
}
