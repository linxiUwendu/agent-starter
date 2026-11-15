<script setup lang="ts">
import { ref } from "vue";

import { useKbAdmin } from "../composables/useKbAdmin";

const { isKbAdmin, adminConfigured, tryUnlock } = useKbAdmin();
const showPrompt = ref(false);
const tokenInput = ref("");
const error = ref("");
const unlocking = ref(false);

function openPrompt() {
  showPrompt.value = true;
  tokenInput.value = "";
  error.value = "";
}

async function submitUnlock() {
  unlocking.value = true;
  error.value = "";
  try {
    if (await tryUnlock(tokenInput.value)) {
      showPrompt.value = false;
      return;
    }
    error.value = "密钥不正确";
  } finally {
    unlocking.value = false;
  }
}
</script>

<template>
  <div v-if="adminConfigured && !isKbAdmin" class="kb-admin-bar">
    <el-button size="small" plain @click="openPrompt">运维登录</el-button>

    <el-dialog v-model="showPrompt" title="知识库运维" width="400px" align-center destroy-on-close>
      <p class="hint">输入运维密钥以管理攻略文档（普通用户不可见）。</p>
      <el-input
        v-model="tokenInput"
        type="password"
        show-password
        autocomplete="off"
        placeholder="运维密钥"
        @keyup.enter="submitUnlock"
      />
      <el-alert v-if="error" class="err-alert" type="error" :title="error" show-icon :closable="false" />
      <template #footer>
        <el-button @click="showPrompt = false">取消</el-button>
        <el-button type="primary" :loading="unlocking" @click="submitUnlock">进入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.kb-admin-bar {
  display: inline-flex;
  flex-shrink: 0;
}

.hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.err-alert {
  margin-top: 12px;
}
</style>
