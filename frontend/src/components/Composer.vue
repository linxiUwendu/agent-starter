<script setup lang="ts">
import { ref } from "vue";
import { Top } from "@element-plus/icons-vue";

const props = defineProps<{
  disabled: boolean;
  isGenerating: boolean;
  placeholder?: string;
}>();

const emit = defineEmits<{
  submit: [content: string];
  stop: [];
}>();

const prompt = ref("");

function onSubmit() {
  const content = prompt.value.trim();
  if (!content || props.disabled || props.isGenerating) return;
  emit("submit", content);
  prompt.value = "";
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (props.isGenerating) return;
    onSubmit();
  }
}
</script>

<template>
  <div class="composer-wrap">
    <div class="composer-shell">
      <el-input
        v-model="prompt"
        class="composer-input"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 8 }"
        data-testid="chat-input"
        :placeholder="isGenerating ? '正在生成回复…' : (placeholder ?? '发送消息...')"
        :disabled="disabled"
        resize="none"
        @keydown="onKeydown"
      />
      <div class="composer-toolbar">
        <button
          v-if="isGenerating"
          type="button"
          class="composer-stop"
          aria-label="停止生成"
          @click="emit('stop')"
        >
          <span class="stop-icon" />
        </button>
        <el-button
          v-else
          type="primary"
          circle
          data-testid="chat-submit"
          aria-label="发送"
          :icon="Top"
          :disabled="disabled || !prompt.trim()"
          @click="onSubmit"
        />
      </div>
    </div>
    <p class="composer-hint">
      {{ isGenerating ? "可随时停止生成" : "Enter 发送 · Shift+Enter 换行" }}
    </p>
  </div>
</template>

<style scoped>
.composer-wrap {
  padding: 12px 16px 16px;
  background: var(--el-bg-color);
}

.composer-shell {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px 10px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 24px;
  background: var(--el-bg-color);
  box-shadow: 0 2px 12px rgb(0 0 0 / 6%);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.composer-shell:focus-within {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 16px rgb(16 163 127 / 12%);
}

.composer-input {
  flex: 1;
  min-width: 0;
}

.composer-input :deep(.el-textarea__inner) {
  border: none;
  box-shadow: none;
  padding: 0;
  background: transparent;
  line-height: 1.5;
}

.composer-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding-bottom: 2px;
}

.composer-stop {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  background: var(--el-text-color-primary);
  color: #fff;
  padding: 0;
}

.composer-stop:hover {
  opacity: 0.85;
}

.stop-icon {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: currentColor;
}

.composer-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
</style>
