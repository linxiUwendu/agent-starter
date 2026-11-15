import type { Request, Response } from "express";

import { AUTH_COOKIE } from "../constants/auth";
import type { AuthUser } from "./auth.types";

type RequestWithAuthUser = Request & { authUser?: AuthUser };

export function readSessionToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = req.cookies?.[AUTH_COOKIE];
  if (typeof cookie === "string") return cookie;
  return undefined;
}

export function attachAuthUser(req: Request, user: AuthUser): void {
  (req as RequestWithAuthUser).authUser = user;
}

export function getAuthUser(req: Request): AuthUser | undefined {
  return (req as RequestWithAuthUser).authUser;
}

export function setAuthSessionCookie(res: Response, token: string, secure: boolean) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthSessionCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, { path: "/" });
}
