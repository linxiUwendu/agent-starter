import jwt from "jsonwebtoken";

import type { JwtPayload } from "./auth.types";

export function signAuthToken(payload: JwtPayload, secret: string, expiresInSec = 60 * 60 * 24 * 7) {
  return jwt.sign(payload, secret, { expiresIn: expiresInSec });
}

export function verifyAuthToken(token: string, secret: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, secret);
    if (!decoded || typeof decoded !== "object") return null;
    const sub = (decoded as JwtPayload).sub;
    const email = (decoded as JwtPayload).email;
    if (!sub || !email) return null;
    return { sub, email };
  } catch {
    return null;
  }
}
