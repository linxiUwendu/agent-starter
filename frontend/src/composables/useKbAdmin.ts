import { computed, ref } from "vue";

import { fetchKbAdminConfig, verifyKbAdminLogin } from "../api/travel";

const SESSION_TOKEN_KEY = "travel_kb_admin";

/** 可选：与后端同密钥时可本地校验；未配置时仅靠 /rag/admin-config + admin-login */
const viteKey = (import.meta.env.VITE_KB_ADMIN_KEY ?? "").trim();

function readSessionToken(): string {
  return sessionStorage.getItem(SESSION_TOKEN_KEY)?.trim() ?? "";
}

const adminEnabledOnServer = ref(false);
const configLoaded = ref(false);
const isKbAdmin = ref(readSessionToken().length > 0);

async function loadAdminConfig() {
  try {
    const cfg = await fetchKbAdminConfig();
    adminEnabledOnServer.value = cfg.enabled;
  } catch {
    adminEnabledOnServer.value = viteKey.length > 0;
  } finally {
    configLoaded.value = true;
  }
}

void loadAdminConfig();

export function useKbAdmin() {
  const adminConfigured = computed(
    () => adminEnabledOnServer.value || viteKey.length > 0,
  );

  async function tryUnlock(token: string): Promise<boolean> {
    const trimmed = token.trim();
    if (!trimmed) return false;

    if (viteKey && trimmed === viteKey) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, trimmed);
      isKbAdmin.value = true;
      return true;
    }

    if (adminEnabledOnServer.value) {
      const ok = await verifyKbAdminLogin(trimmed);
      if (ok) {
        sessionStorage.setItem(SESSION_TOKEN_KEY, trimmed);
        isKbAdmin.value = true;
        return true;
      }
    }

    return false;
  }

  function exitKbAdmin() {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    isKbAdmin.value = false;
  }

  /** 写入/删除知识库时携带，与 Nest TRAVEL_KB_ADMIN_KEY 校验一致 */
  function kbAdminHeaders(): Record<string, string> {
    const token = readSessionToken();
    if (!isKbAdmin.value || !token) return {};
    return { "X-KB-Admin-Key": token };
  }

  async function consumeUrlUnlock() {
    if (typeof window === "undefined") return;
    if (!configLoaded.value) await loadAdminConfig();

    const params = new URLSearchParams(window.location.search);
    const token = params.get("kb_admin")?.trim();
    if (!token) return;

    const ok = await tryUnlock(token);
    if (ok) {
      params.delete("kb_admin");
      const qs = params.toString();
      const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", next);
    }
  }

  return {
    isKbAdmin,
    adminConfigured,
    configLoaded,
    tryUnlock,
    exitKbAdmin,
    kbAdminHeaders,
    consumeUrlUnlock,
    refreshAdminConfig: loadAdminConfig,
  };
}
