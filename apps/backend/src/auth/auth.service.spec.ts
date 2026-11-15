import { AuthService } from "./auth.service";
import { createTestDatabase } from "../test/test-db";

describe("AuthService", () => {
  it("devSignIn creates user when dev login allowed", () => {
    const db = createTestDatabase();
    const config = {
      get: (key: string) => {
        if (key === "AUTH_ALLOW_DEV_LOGIN") return "true";
        return undefined;
      },
    };
    const auth = new AuthService({ connection: db } as never, config as never);
    const { user, token } = auth.devSignIn("traveler@example.com", "旅人");
    expect(user.email).toBe("traveler@example.com");
    expect(token).toBeTruthy();
    expect(auth.userFromToken(token)?.id).toBe(user.id);
    db.close();
  });
});
