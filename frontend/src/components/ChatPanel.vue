<script setup lang="ts">
import { computed } from "vue";

import CitySelector from "./CitySelector.vue";
import Composer from "./Composer.vue";
import ConversationBar from "./ConversationBar.vue";
import MessageList from "./MessageList.vue";
import type { ChatMessage, ConversationSummary, StatusVariant } from "../types/travel";

const props = defineProps<{
  currentCityId: string;
  currentCityName: string;
  cities: import("../types/travel").CityRecord[];
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  statusText: string;
  statusVariant: StatusVariant;
  isSubmitting: boolean;
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  conversationsLoading: boolean;
}>();

const emit = defineEmits<{
  submit: [content: string];
  stop: [];
  selectCity: [cityId: string];
  newConversation: [];
  selectConversation: [id: string];
  deleteConversation: [id: string];
}>();

const statusTagType = computed(() => {
  if (props.statusVariant === "error") return "danger";
  if (props.statusVariant === "streaming") return "success";
  return "info";
});
</script>

<template>
  <section class="panel chat-panel">
    <header class="panel-header chat-header">
      <div class="chat-header-top">
        <div>
          <h1 class="panel-title">AI 旅游助手</h1>
          <p class="panel-subtitle">说出目的地，自动规划美食 · 景点 · 行程</p>
        </div>
        <el-tag
          v-if="!isStreaming"
          :type="statusTagType"
          effect="plain"
          round
        >
          {{ statusText }}
        </el-tag>
      </div>
      <CitySelector
        :cities="cities"
        :current-city-id="currentCityId"
        :current-city-name="currentCityName"
        @select="emit('selectCity', $event)"
      />
      <ConversationBar
        :conversations="conversations"
        :current-conversation-id="currentConversationId"
        :loading="conversationsLoading"
        @new-chat="emit('newConversation')"
        @select="emit('selectConversation', $event)"
        @delete="emit('deleteConversation', $event)"
      />
    </header>

    <MessageList
      :messages="messages"
      :streaming-content="streamingContent"
      :is-streaming="isStreaming"
      :streaming-status="isStreaming ? statusText : ''"
    />

    <Composer
      placeholder="例如：成都 2 日美食攻略 / 西安必吃小吃 / 杭州出片机位"
      :disabled="false"
      :is-generating="isSubmitting"
      @submit="emit('submit', $event)"
      @stop="emit('stop')"
    />
  </section>
</template>

<style scoped>
.chat-header {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.chat-header-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
</style>
