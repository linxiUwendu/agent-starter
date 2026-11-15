import { ref } from "vue";

import {
  fetchAuthConfig,
  fetchMe,
  logoutAuth,
  type AuthConfig,
  type AuthUser,
} from "../api/auth";

export const user = ref<AuthUser | null>(null);
export const authConfig = ref<AuthConfig>({
  googleEnabled: false,
  googleClientId: null,
  devLoginEnabled: false,
});
export const loading = ref(false);
const authLoaded = ref(false);

async function refreshAuthState() {
  loading.value = true;
  try {
    authConfig.value = await fetchAuthConfig();
    const me = await fetchMe();
    user.value = me.user;
  } catch {
    user.value = null;
  } finally {
    loading.value = false;
    authLoaded.value = true;
  }
}

export async function ensureAuthLoaded() {
  if (authLoaded.value) return;
  await refreshAuthState();
}

export function useAuth() {
  async function refresh() {
    await refreshAuthState();
  }

  async function logout() {
    await logoutAuth();
    user.value = null;
    sessionStorage.removeItem("travel_guest");
  }

  return {
    user,
    authConfig,
    loading,
    refresh,
    logout,
  };
}
