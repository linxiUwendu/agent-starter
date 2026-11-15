import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "./auth.service";
import { attachAuthUser, readSessionToken } from "./auth.session";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = this.auth.userFromToken(readSessionToken(req));
    if (!user) throw new UnauthorizedException({ error: "Login required." });
    attachAuthUser(req, user);
    return true;
  }
}

/** 有 token 则解析用户，无 token 继续（游客） */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = this.auth.userFromToken(readSessionToken(req));
    if (user) attachAuthUser(req, user);
    return true;
  }
}
