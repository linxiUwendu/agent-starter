import fs from "node:fs";
import path from "node:path";

/**
 * 从当前编译/源码目录向上查找根 workspace（package.json name === agent-starter）。
 */
export function findRepoRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 12; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const { name } = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
          name?: string;
        };
        if (name === "agent-starter") return dir;
      } catch {
        // ignore invalid package.json
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'Monorepo root not found (expected package.json with "name": "agent-starter")',
  );
}

export function travelDbPath(startDir: string): string {
  return path.join(findRepoRoot(startDir), "packages", "data", "travel.db");
}

export function frontendDistDir(startDir: string): string {
  return path.join(findRepoRoot(startDir), "apps", "frontend", "dist");
}

export function repoEnvFile(startDir: string): string {
  return path.join(findRepoRoot(startDir), ".env");
}
