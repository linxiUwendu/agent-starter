import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readGoogleOAuthTeamClientId } from "./google-oauth-team";

describe("google-oauth-team", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-starter-oauth-"));
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      JSON.stringify({ name: "agent-starter" }),
    );
    fs.mkdirSync(path.join(tmpRoot, "config"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("reads clientId from team json", () => {
    const id = "1234567890-abcdef.apps.googleusercontent.com";
    fs.writeFileSync(
      path.join(tmpRoot, "config", "google-oauth.team.json"),
      JSON.stringify({ clientId: id }),
    );
    const nested = path.join(tmpRoot, "apps", "backend", "dist");
    fs.mkdirSync(nested, { recursive: true });
    expect(readGoogleOAuthTeamClientId(nested)).toBe(id);
  });

  it("returns null for placeholder clientId", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "config", "google-oauth.team.json"),
      JSON.stringify({
        clientId: "YOUR_TEAM_CLIENT_ID.apps.googleusercontent.com",
      }),
    );
    expect(readGoogleOAuthTeamClientId(tmpRoot)).toBeNull();
  });

  it("returns null when file missing", () => {
    expect(readGoogleOAuthTeamClientId(tmpRoot)).toBeNull();
  });
});
