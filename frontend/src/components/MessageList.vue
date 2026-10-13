<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";

import type { ChatMessage } from "../types/travel";

const props = defineProps<{
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
}>();

const SCROLL_THRESHOLD = 64;

const messagesEl = ref<HTMLElement | null>(null);
const stickToBottom = ref(true);
const showScrollButton = ref(false);

function isNearBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
}

function updateScrollButton() {
  const el = messagesEl.value;
  if (!el) return;
  showScrollButton.value = !stickToBottom.value && el.scrollHeight > el.clientHeight + 8;
}

function onScroll() {
  const el = messagesEl.value;
  if (!el) return;
  stickToBottom.value = isNearBottom(el);
  updateScrollButton();
}

function scrollToBottom(options: { smooth?: boolean; forceStick?: boolean } = {}) {
  const el = messagesEl.value;
  if (!el) return;

  if (options.forceStick) {
    stickToBottom.value = true;
    showScrollButton.value = false;
  }

  if (!stickToBottom.value && !options.forceStick) return;

  el.scrollTo({
    top: el.scrollHeight,
    behavior: options.smooth ? "smooth" : "instant",
  });
}

async function followContent() {
  await nextTick();
  scrollToBottom();
  updateScrollButton();
}

function jumpToLatest() {
  scrollToBottom({ smooth: true, forceStick: true });
}

watch(
  () => [props.messages, props.streamingContent] as const,
  () => {
    void followContent();
  },
  { deep: true },
);

watch(
  () => props.isStreaming,
  (streaming, wasStreaming) => {
    if (streaming && !wasStreaming) {
      stickToBottom.value = true;
      showScrollButton.value = false;
      void followContent();
    }
  },
);

onMounted(() => {
  void followContent();
});
</script>

<template>
  <div class="messages-wrap">
    <div ref="messagesEl" class="messages" aria-live="polite" @scroll="onScroll">
      <div v-if="messages.length === 0 && !isStreaming" class="empty-state">
        <h2>有什么可以帮你的？</h2>
        <p>输入问题开始对话。支持多轮上下文，回复将实时流式显示。</p>
      </div>

      <div
        v-for="(message, index) in messages"
        :key="index"
        class="message-row"
        :class="message.role"
        :data-testid="message.role === 'assistant' ? 'assistant-message' : 'user-message'"
      >
        <div class="message-inner">
          <div class="message-avatar">{{ message.role === "user" ? "你" : "AI" }}</div>
          <div class="message-content">{{ message.content }}</div>
        </div>
      </div>

      <div v-if="isStreaming" class="message-row assistant">
        <div class="message-inner">
          <div class="message-avatar">AI</div>
          <div class="message-content streaming">{{ streamingContent }}</div>
        </div>
      </div>
    </div>

    <Transition name="scroll-btn">
      <button
        v-if="showScrollButton"
        type="button"
        class="scroll-to-bottom"
        aria-label="滚动到最新消息"
        @click="jumpToLatest"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </Transition>
  </div>
</template>
