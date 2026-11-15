import { verifyGoogleIdTokenInsecureLocal } from "./google-id-token.util";

/** 仅结构演示；真实 token 由 GIS 签发 */
function fakeJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

describe("google-id-token.util", () => {
  it("verifyGoogleIdTokenInsecureLocal checks aud and exp", () => {
    const clientId = "test-client.apps.googleusercontent.com";
    const token = fakeJwt({
      iss: "https://accounts.google.com",
      aud: clientId,
      sub: "google-sub-1",
      email: "u@example.com",
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
      name: "Test",
    });
    const profile = verifyGoogleIdTokenInsecureLocal(token, clientId);
    expect(profile.email).toBe("u@example.com");
    expect(profile.sub).toBe("google-sub-1");
  });
});
