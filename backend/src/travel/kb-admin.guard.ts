import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

import { readKbAdminKey } from "./kb-admin.util";

/** 配置 TRAVEL_KB_ADMIN_KEY 后，知识库写操作与文档列表 API 需携带 X-KB-Admin-Key */
@Injectable()
export class KbAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = readKbAdminKey(this.config);
    if (!expected) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header("x-kb-admin-key")?.trim();
    if (provided !== expected) {
      throw new ForbiddenException({ error: "KB admin key required." });
    }
    return true;
  }
}
