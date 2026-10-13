<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

const props = defineProps<{
  disabled: boolean;
  isSubmitting: boolean;
  placeholder?: string;
}>();

const emit = defineEmits<{
  submit: [content: string];
  stop: [];
}>();

const prompt = ref("");
const textareaRef = ref<HTMLTextAreaElement | null>(null);

function autoResize() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
}

watch(prompt, () => nextTick(autoResize));

function onSubmit() {
  const content = prompt.value.trim();
  if (!content || props.disabled || props.isSubmitting) return;
  emit("submit", content);
  prompt.value = "";
  nextTick(autoResize);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    onSubmit();
  }
}
</script>

<template>
  <div class="composer-wrap">
    <form class="composer" @submit.prevent="onSubmit">
      <div class="composer-box">
        <label class="sr-only" for="prompt">Message</label>
        <textarea
          id="prompt"
          ref="textareaRef"
          v-model="prompt"
          rows="1"
          data-testid="chat-input"
          :placeholder="placeholder ?? '发送消息...'"
          :disabled="disabled || isSubmitting"
          @keydown="onKeydown"
        />
        <div class="composer-actions">
          <button v-if="isSubmitting" type="button" class="stop-btn" @click="emit('stop')">
            停止生成
          </button>
          <button type="submit" class="send-btn" data-testid="chat-submit" aria-label="发送" :disabled="disabled || isSubmitting">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
      </div>
      <p class="composer-hint">Enter 发送 · Shift+Enter 换行</p>
    </form>
  </div>
</template>
