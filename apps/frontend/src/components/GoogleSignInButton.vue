<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

import { loginWithGoogleCredential } from "../api/auth";

const GIS_SCRIPT = "https://accounts.google.com/gsi/client";
const GIS_LOAD_MS = 8_000;

const props = defineProps<{
  clientId: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  success: [];
  error: [message: string];
  unavailable: [];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
const phase = ref<"loading" | "ready" | "unavailable">("loading");
let mounted = false;

type GoogleCredentialResponse = { credential: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (res: GoogleCredentialResponse) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, string | number | boolean>,
          ) => void;
        };
      };
    };
  }
}

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("GIS_TIMEOUT")), GIS_LOAD_MS);

    const finish = (fn: () => void) => {
      clearTimeout(timer);
      fn();
    };

    const existing = document.querySelector(`script[src="${GIS_SCRIPT}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.accounts?.id) {
        finish(() => resolve());
        return;
      }
      existing.addEventListener("load", () => finish(() => resolve()), { once: true });
      existing.addEventListener("error", () => finish(() => reject(new Error("GIS_LOAD_ERROR"))), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => finish(() => resolve());
    script.onerror = () => finish(() => reject(new Error("GIS_LOAD_ERROR")));
    document.head.appendChild(script);
  });
}

async function handleCredential(response: GoogleCredentialResponse) {
  if (props.disabled) return;
  try {
    await loginWithGoogleCredential(response.credential);
    emit("success");
  } catch (error) {
    emit("error", error instanceof Error ? error.message : "Google 登录失败");
  }
}

async function renderButton() {
  if (!mounted || !hostRef.value || !props.clientId) return;
  phase.value = "loading";
  hostRef.value.innerHTML = "";

  try {
    await loadGisScript();
  } catch {
    phase.value = "unavailable";
    emit("unavailable");
    emit("error", "无法加载 Google 登录组件，请使用下方邮箱登录或检查网络。");
    return;
  }

  if (!window.google?.accounts?.id) {
    phase.value = "unavailable";
    emit("unavailable");
    return;
  }

  window.google.accounts.id.initialize({
    client_id: props.clientId,
    callback: handleCredential,
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  window.google.accounts.id.renderButton(hostRef.value, {
    type: "standard",
    theme: "outline",
    size: "large",
    width: 360,
    text: "signin_with",
    locale: "zh_CN",
  });
  phase.value = "ready";
}

onMounted(() => {
  mounted = true;
  void renderButton();
});

onBeforeUnmount(() => {
  mounted = false;
});

watch(
  () => [props.clientId, props.disabled] as const,
  () => {
    void renderButton();
  },
);
</script>

<template>
  <div class="google-signin-wrap" :class="{ disabled: disabled }">
    <p v-if="phase === 'loading'" class="google-signin-status">正在加载 Google 登录…</p>
    <p v-else-if="phase === 'unavailable'" class="google-signin-status google-signin-unavailable">
      Google 组件不可用（网络限制时可改用邮箱登录）
    </p>
    <div ref="hostRef" class="google-signin-host" data-testid="google-signin-host" />
  </div>
</template>

<style scoped>
.google-signin-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
}

.google-signin-wrap.disabled {
  opacity: 0.55;
  pointer-events: none;
}

.google-signin-status {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.google-signin-unavailable {
  color: var(--el-color-warning);
  text-align: center;
  line-height: 1.4;
}

.google-signin-host {
  display: flex;
  justify-content: center;
  min-height: 44px;
}
</style>
