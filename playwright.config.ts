import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && MOCK_AGENT=true PORT=3000 HOST=127.0.0.1 npm start",
    url: "http://127.0.0.1:3000/api/travel/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
