/* eslint-disable @typescript-eslint/ban-ts-comment -- jose FetchImplementation 与 undici 类型不完全重叠 */
// @ts-nocheck
import { createRemoteJWKSet, customFetch } from "jose";
import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

const PROXY_KEYS = ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"] as const;

function hasHttpProxyEnv(): boolean {
  return PROXY_KEYS.some((key) => Boolean(process.env[key]?.trim()));
}

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedDispatcher: EnvHttpProxyAgent | undefined;

/** 拉取 Google JWKS；若配置了 HTTPS_PROXY 则经 undici EnvHttpProxyAgent（不依赖 NODE_USE_ENV_PROXY） */
export function getGoogleJwks() {
  if (cachedJwks) return cachedJwks;

  const url = new URL(GOOGLE_JWKS_URL);
  if (!hasHttpProxyEnv()) {
    cachedJwks = createRemoteJWKSet(url);
    return cachedJwks;
  }

  cachedDispatcher ??= new EnvHttpProxyAgent();
  cachedJwks = createRemoteJWKSet(url, {
    [customFetch]: (requestUrl, options) =>
      undiciFetch(requestUrl, { ...options, dispatcher: cachedDispatcher }),
  });
  return cachedJwks;
}
