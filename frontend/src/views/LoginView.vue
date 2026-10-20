<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { loginWithDevAccount } from "../api/auth";
import AppTopBar from "../components/AppTopBar.vue";
import GoogleSignInButton from "../components/GoogleSignInButton.vue";
import { useAuth } from "../composables/useAuth";

const router = useRouter();
const { user, authConfig, loading, refresh } = useAuth();

const signingIn = ref(false);
const loginError = ref("");
const devEmail = ref("demo@example.com");
const devName = ref("演示用户");

const googleClientId = computed(() => {
  const fromApi = authConfig.value.googleClientId?.trim();
  if (fromApi) return fromApi;
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || "";
});

const showGoogle = computed(() => !!googleClientId.value);
const showDevLogin = computed(() => authConfig.value.devLoginEnabled);

async function afterLogin() {
  sessionStorage.removeItem("travel_guest");
  await refresh();
  void router.replace("/app");
}

async function onGoogleSuccess() {
  loginError.value = "";
  signingIn.value = true;
  try {
    await afterLogin();
  } catch (error) {
    loginError.value = error instanceof Error ? error.message : "登录后刷新失败";
  } finally {
    signingIn.value = false;
  }
}

function onGoogleError(message: string) {
  loginError.value = message;
}

async function submitDevLogin() {
  loginError.value = "";
  signingIn.value = true;
  try {
    await loginWithDevAccount(devEmail.value, devName.value);
    await afterLogin();
  } catch (error) {
    loginError.value = error instanceof Error ? error.message : "登录失败";
  } finally {
    signingIn.value = false;
  }
}

function enterAsGuest() {
  sessionStorage.setItem("travel_guest", "1");
  void router.push("/app");
}

onMounted(async () => {
  await refresh();
  if (user.value) {
    sessionStorage.removeItem("travel_guest");
    void router.replace("/app");
  }
});
</script>

<template>
  <div class="login-page" data-testid="login-page">
    <AppTopBar variant="minimal" class="login-top-bar" />
    <div class="login-card-wrap">
    <div class="login-card">
      <div class="login-brand">
        <h1 class="login-title">欢迎回来</h1>
        <p class="login-tagline">登录后保存对话，并自动记录你的旅行偏好</p>
      </div>

      <el-alert
        v-if="loginError"
        :title="loginError"
        type="error"
        show-icon
        :closable="true"
        class="login-alert"
        @close="loginError = ''"
      />

      <div v-if="loading" class="login-loading">正在检查登录状态…</div>

      <template v-else>
        <div v-if="showGoogle" class="login-oauth">
          <GoogleSignInButton
            :client-id="googleClientId"
            :disabled="signingIn"
            @success="onGoogleSuccess"
            @error="onGoogleError"
          />
          <p class="login-hint">使用 Google 账号登录；<strong>首次授权即完成注册</strong>。</p>
        </div>

        <el-alert
          v-if="!showGoogle && !showDevLogin"
          title="登录功能暂未开放"
          description="您可使用游客试用；生产环境请配置 Google 登录。"
          type="info"
          show-icon
          :closable="false"
          class="login-alert"
        />

        <div v-if="showDevLogin" class="dev-login">
          <p v-if="showGoogle" class="dev-login-label">或使用邮箱登录（推荐：Google 按钮加载失败时）</p>
          <el-input v-model="devEmail" placeholder="邮箱" />
          <el-input v-model="devName" placeholder="昵称（可选）" />
          <el-button
            type="primary"
            size="large"
            class="login-full-btn"
            :loading="signingIn"
            @click="submitDevLogin"
          >
            邮箱快捷登录（演示）
          </el-button>
        </div>

        <ul class="login-features">
          <li>云端保存多轮对话</li>
          <li>Markdown 旅行记忆（饮食、约束、预算等）</li>
          <li>RAG 攻略 + 智能行程工具</li>
        </ul>

        <el-divider>或</el-divider>

        <el-button class="login-full-btn" size="large" :disabled="signingIn" @click="enterAsGuest">
          游客试用（不保存对话与记忆）
        </el-button>

        <p class="login-legal">登录即表示您同意我们用于提供旅游助手服务而处理必要的账号信息。</p>
      </template>
    </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(145deg, #e8f5f0 0%, #f5f7fa 45%, #eef2ff 100%);
}

.login-top-bar {
  flex-shrink: 0;
}

.login-card-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  width: 100%;
  box-sizing: border-box;
}

.login-card {
  width: 100%;
  max-width: 420px;
  padding: 36px 32px 32px;
  border-radius: 16px;
  background: var(--el-bg-color);
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
  border: 1px solid var(--el-border-color-lighter);
}

.login-brand {
  text-align: center;
  margin-bottom: 28px;
}

.login-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 600;
}

.login-tagline {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.login-alert {
  margin-bottom: 16px;
}

.login-loading {
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.login-oauth {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.login-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
  line-height: 1.5;
}

.dev-login {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 8px;
}

.dev-login-label {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.login-features {
  margin: 20px 0 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.8;
}

.login-full-btn {
  width: 100%;
}

.login-legal {
  margin: 16px 0 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  text-align: center;
  line-height: 1.5;
}
</style>
