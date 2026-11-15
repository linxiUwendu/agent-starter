<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { ArrowDown } from "@element-plus/icons-vue";

import type { ChatMessage } from "../types/travel";

const props = defineProps<{
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  /** 生成阶段提示（检索 / 思考），显示在助手气泡内 */
  streamingStatus?: string;
}>();

const SCROLL_THRESHOLD = 64;

const messagesEl = ref<HTMLElement | null>(null);
const stickToBottom = ref(true);
const showScrollButton = ref(false);

const isTypingPhase = computed(
  () => props.isStreaming && !props.streamingContent.trim(),
);

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
  () => [props.messages, props.streamingContent, props.streamingStatus] as const,
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
    <div ref="messagesEl" class="messages-scroll" @scroll="onScroll">
      <div class="messages" aria-live="polite">
        <el-empty
          v-if="messages.length === 0 && !isStreaming"
          description="有什么可以帮你的？"
          class="chat-empty"
        >
          <template #description>
            <p class="empty-title">有什么可以帮你的？</p>
            <p class="empty-desc">输入问题开始对话。支持多轮上下文，回复将实时流式显示。</p>
          </template>
        </el-empty>

        <div
          v-for="(message, index) in messages"
          :key="index"
          class="message-row"
          :class="message.role"
          :data-testid="message.role === 'assistant' ? 'assistant-message' : 'user-message'"
        >
          <el-avatar class="message-avatar" :size="32">
            {{ message.role === "user" ? "你" : "AI" }}
          </el-avatar>
          <div class="message-content">{{ message.content }}</div>
        </div>

        <div v-if="isStreaming" class="message-row assistant streaming-row">
          <el-avatar class="message-avatar" :size="32">AI</el-avatar>
          <div
            class="message-content streaming"
            :class="{ 'is-typing': isTypingPhase }"
          >
            <template v-if="isTypingPhase">
              <span class="typing-status">{{ streamingStatus || "正在思考" }}</span>
              <span class="typing-dots" aria-hidden="true">
                <span /><span /><span />
              </span>
            </template>
            <template v-else>
              <span class="stream-text">{{ streamingContent }}</span>
              <span class="stream-cursor" aria-hidden="true" />
            </template>
          </div>
        </div>
      </div>
    </div>

    <Transition name="scroll-btn">
      <el-button
        v-if="showScrollButton"
        class="scroll-to-bottom"
        circle
        :icon="ArrowDown"
        aria-label="滚动到最新消息"
        @click="jumpToLatest"
      />
    </Transition>
  </div>
</template>

<style scoped>
.messages-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
}

.messages-scroll {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

.messages {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-empty {
  padding: 48px 16px;
}

.empty-title {
  margin: 0 0 8px;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.empty-desc {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.message-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  max-width: 100%;
}

.message-row.user {
  flex-direction: row-reverse;
}

.message-row.user .message-content {
  background: var(--el-fill-color-light);
  border-radius: 18px 18px 4px 18px;
  max-width: 85%;
}

.message-row.assistant .message-content {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 8px 0;
  max-width: 100%;
}

.message-row.streaming-row .message-content.is-typing {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.typing-status {
  line-height: 1.5;
}

.typing-dots {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 16px;
}

.typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-text-color-placeholder);
  animation: typing-bounce 1.2s ease-in-out infinite;
}

.typing-dots span:nth-child(2) {
  animation-delay: 0.15s;
}

.typing-dots span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes typing-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.45;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

.stream-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}

.stream-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--el-color-primary);
  animation: cursor-blink 1s step-end infinite;
}

@keyframes cursor-blink {
  50% {
    opacity: 0;
  }
}

.message-content {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-content.streaming:not(.is-typing) {
  padding: 8px 0;
  color: var(--el-text-color-primary);
}

.message-avatar {
  flex-shrink: 0;
  font-size: 12px;
  background: var(--el-color-primary-light-7);
  color: var(--el-color-primary);
}

.scroll-to-bottom {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  box-shadow: var(--el-box-shadow-light);
}

.scroll-btn-enter-active,
.scroll-btn-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.scroll-btn-enter-from,
.scroll-btn-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
