import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");

let port = process.env.PORT ?? "3000";
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^PORT=(\d+)\s*$/);
    if (match) port = match[1];
  }
}

const url = `http://127.0.0.1:${port}/api/travel/health`;
const deadline = Date.now() + 120_000;

process.stdout.write(`[wait-for-backend] waiting for ${url} …\n`);

while (Date.now() < deadline) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      process.stdout.write(`[wait-for-backend] ready\n`);
      process.exit(0);
    }
  } catch {
    // backend still starting or watch-mode restarting
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
}

process.stderr.write(`[wait-for-backend] timeout after 120s (PORT=${port})\n`);
process.exit(1);
