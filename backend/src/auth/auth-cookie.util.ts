import type { Response } from "express";

export const AUTH_COOKIE = "auth_token";

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
