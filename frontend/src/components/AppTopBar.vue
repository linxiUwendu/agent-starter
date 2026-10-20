<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { fetchUserMemory } from "../api/auth";
import { useAuth } from "../composables/useAuth";

withDefaults(
  defineProps<{
    /** app=主界面顶栏；minimal=登录页仅品牌 */
    variant?: "app" | "minimal";
  }>(),
  { variant: "app" },
);

const router = useRouter();
const { user, loading, refresh, logout: signOut } = useAuth();

const memoryMd = ref("");
const memoryOpen = ref(false);

const displayName = computed(() => user.value?.displayName || user.value?.email?.split("@")[0] || "用户");
const avatarLetter = computed(() => displayName.value.slice(0, 1).toUpperCase());
const isGuest = computed(() => sessionStorage.getItem("travel_guest") === "1" && !user.value);

onMounted(() => {
  void refresh();
});

async function openMemory() {
  memoryOpen.value = true;
  try {
    const data = await fetchUserMemory();
    memoryMd.value = data.contentMd.trim() || "（暂无记录，聊天中提到的偏好会自动写入）";
  } catch {
    memoryMd.value = "加载失败";
  }
}

async function logout() {
  await signOut();
  void router.push("/login");
}

function goLogin() {
  void router.push("/login");
}

function goApp() {
  if (user.value || isGuest.value) void router.push("/app");
}

function onUserMenu(command: string | number) {
  const cmd = String(command);
  if (cmd === "memory") void openMemory();
  if (cmd === "logout") void logout();
}

</script>

<template>
  <header class="app-top-bar" data-testid="app-top-bar">
    <button type="button" class="app-top-brand" @click="goApp">
      <span class="app-top-logo" aria-hidden="true">🧭</span>
      <span class="app-top-title">AI 旅游助手</span>
    </button>

    <div v-if="variant === 'app'" class="app-top-actions">
      <template v-if="loading">
        <span class="app-top-muted">…</span>
      </template>

      <template v-else-if="user">
        <el-dropdown trigger="click" @command="onUserMenu">
          <button type="button" class="app-top-user">
            <el-avatar :size="28" class="app-top-avatar">{{ avatarLetter }}</el-avatar>
            <span class="app-top-name">{{ displayName }}</span>
            <span class="app-top-caret">▾</span>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled class="app-top-email-item">
                {{ user.email }}
              </el-dropdown-item>
              <el-dropdown-item command="memory">旅行记忆</el-dropdown-item>
              <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>

      <template v-else>
        <el-tag v-if="isGuest" size="small" type="info" effect="plain">游客</el-tag>
        <span v-else class="app-top-muted">未登录</span>
        <el-button size="small" type="primary" @click="goLogin">登录 / 注册</el-button>
      </template>
    </div>

    <el-dialog v-model="memoryOpen" title="我的旅行记忆（Markdown）" width="520px" append-to-body>
      <pre class="memory-pre">{{ memoryMd }}</pre>
    </el-dialog>
  </header>
</template>

<style scoped>
.app-top-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 48px;
  padding: 0 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
}

.app-top-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  padding: 4px 0;
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.app-top-logo {
  font-size: 20px;
  line-height: 1;
}

.app-top-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.app-top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.app-top-user {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 999px;
  padding: 4px 12px 4px 4px;
  background: var(--el-fill-color-blank);
  cursor: pointer;
  font: inherit;
  color: inherit;
  max-width: 220px;
}

.app-top-user:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-fill-color-light);
}

.app-top-avatar {
  background: var(--el-color-primary);
  color: #fff;
  font-size: 13px;
}

.app-top-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}

.app-top-caret {
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.app-top-muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.memory-pre {
  white-space: pre-wrap;
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
  max-height: 360px;
  overflow: auto;
}

:deep(.app-top-email-item) {
  font-size: 12px;
  opacity: 0.85;
  cursor: default;
}
</style>
