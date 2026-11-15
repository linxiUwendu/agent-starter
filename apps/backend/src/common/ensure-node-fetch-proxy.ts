import fs from "node:fs";

import { repoEnvFile } from "./repo-root";

const PROXY_KEYS = ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"] as const;

function hasProxyEnv(): boolean {
  return PROXY_KEYS.some((key) => Boolean(process.env[key]?.trim()));
}

/** 在 Nest ConfigModule 之前把根目录 .env 中的代理变量注入 process.env（仅补缺，不覆盖已有） */
function mergeProxyVarsFromRepoEnv(startDir: string): void {
  const envPath = repoEnvFile(startDir);
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!PROXY_KEYS.includes(key as (typeof PROXY_KEYS)[number])) continue;
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/**
 * jose 拉 JWKS 使用 global fetch；Node 22.21+ 需 NODE_USE_ENV_PROXY=1 才会读 HTTPS_PROXY。
 * 在 main 入口最早调用，使 .env 里的 HTTPS_PROXY 对验签生效。
 */
export function ensureNodeFetchEnvProxy(startDir: string): void {
  mergeProxyVarsFromRepoEnv(startDir);
  if (hasProxyEnv()) {
    process.env.NODE_USE_ENV_PROXY ??= "1";
    return;
  }

  const insecureOff = process.env.AUTH_GOOGLE_INSECURE_LOCAL_JWT === "false";
  if (insecureOff && process.env.NODE_ENV !== "production") {
    console.warn(
      "[agent-starter] AUTH_GOOGLE_INSECURE_LOCAL_JWT=false 但未配置 HTTPS_PROXY；" +
        "Google 登录验签需访问 googleapis.com，请在根目录 .env 添加 HTTPS_PROXY=http://127.0.0.1:<代理HTTP端口> 后重启 backend。",
    );
  }
}
