export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type AuthConfig = {
  googleEnabled: boolean;
  googleClientId: string | null;
  devLoginEnabled: boolean;
};

const jsonHeaders = { "Content-Type": "application/json" };

export async function fetchAuthConfig() {
  const res = await fetch("/api/auth/config", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load auth config.");
  return res.json() as Promise<AuthConfig>;
}

export async function fetchMe() {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load profile.");
  return res.json() as Promise<{ user: AuthUser | null }>;
}

export async function logoutAuth() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

export async function loginWithGoogleCredential(credential: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch("/api/auth/google", {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify({ credential }),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; user?: AuthUser };
    if (!res.ok) {
      const msg = body.error ?? body.message ?? `Google 登录失败 (${res.status})`;
      throw new Error(typeof msg === "string" ? msg : "Google 登录失败");
    }
    return body.user!;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("登录请求超时，请确认 backend 已重启并重试。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function loginWithDevAccount(email: string, displayName?: string) {
  const res = await fetch("/api/auth/dev-login", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify({ email, displayName }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; user?: AuthUser };
  if (!res.ok) throw new Error(body.error ?? "登录失败");
  return body.user!;
}

export async function fetchUserMemory() {
  const res = await fetch("/api/auth/memory", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load memory.");
  return res.json() as Promise<{ contentMd: string }>;
}
