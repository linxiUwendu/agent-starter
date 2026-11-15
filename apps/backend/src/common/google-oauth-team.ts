import fs from "node:fs";
import path from "node:path";

import { findRepoRoot } from "./repo-root";

const GOOGLE_OAUTH_TEAM_FILENAME = "google-oauth.team.json";

type GoogleOAuthTeamFile = {
  clientId?: string;
};

const PLACEHOLDER_CLIENT_ID =
  /^(YOUR_TEAM_CLIENT_ID|xxxx)(\.apps\.googleusercontent\.com)?$/i;

/**
 * 团队共用的公开 Web Client ID（可提交 Git）。环境变量 GOOGLE_CLIENT_ID 优先级更高。
 */
export function readGoogleOAuthTeamClientId(startDir: string): string | null {
  const filePath = path.join(findRepoRoot(startDir), "config", GOOGLE_OAUTH_TEAM_FILENAME);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as GoogleOAuthTeamFile;
    const id = parsed.clientId?.trim();
    if (!id || PLACEHOLDER_CLIENT_ID.test(id)) return null;
    return id;
  } catch {
    return null;
  }
}
