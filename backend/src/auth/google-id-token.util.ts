import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type GoogleIdProfile = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

export function isGoogleNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; cause?: { code?: string } };
  const code = err.code ?? err.cause?.code ?? "";
  return (
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ENOTFOUND" ||
    String(error).includes("fetch failed")
  );
}

function payloadToProfile(payload: JWTPayload, clientId: string): GoogleIdProfile {
  const aud = payload.aud;
  const audOk = aud === clientId || (Array.isArray(aud) && aud.includes(clientId));
  if (!audOk) {
    throw new Error("Google token audience mismatch.");
  }

  const iss = payload.iss;
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") {
    throw new Error("Google token issuer invalid.");
  }

  const email = typeof payload.email === "string" ? payload.email : "";
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const emailVerified = payload.email_verified;
  const verified =
    emailVerified === true || emailVerified === "true" || emailVerified === undefined;
  if (!verified || !sub || !email) {
    throw new Error("Google account email not verified.");
  }

  return {
    sub,
    email,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}

export class GoogleVerifyTimeoutError extends Error {
  constructor() {
    super("GOOGLE_VERIFY_TIMEOUT");
    this.name = "GoogleVerifyTimeoutError";
  }
}

export function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new GoogleVerifyTimeoutError()), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

/** 使用 Google 公钥本地验签（需能访问 googleapis.com 拉 JWKS，会缓存） */
export async function verifyGoogleIdTokenWithJwks(idToken: string, clientId: string): Promise<GoogleIdProfile> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    audience: clientId,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  });
  return payloadToProfile(payload, clientId);
}

/** 仅解析 JWT 载荷并校验 aud/exp（不验签；仅开发且网络不可达 Google 时启用） */
export function verifyGoogleIdTokenInsecureLocal(idToken: string, clientId: string): GoogleIdProfile {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid Google token format.");
  }
  const payloadJson = Buffer.from(parts[1]!, "base64url").toString("utf8");
  const payload = JSON.parse(payloadJson) as JWTPayload;

  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (exp * 1000 < Date.now()) {
    throw new Error("Google token expired.");
  }

  return payloadToProfile(payload, clientId);
}
