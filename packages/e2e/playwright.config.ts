import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  outputDir: path.join(repoRoot, "packages/e2e/test-results"),
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "pnpm run build && MOCK_AGENT=true AUTH_ALLOW_DEV_LOGIN=true PORT=3000 HOST=127.0.0.1 pnpm start",
    cwd: repoRoot,
    url: "http://127.0.0.1:3000/api/travel/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
