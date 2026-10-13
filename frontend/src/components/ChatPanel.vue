<script setup lang="ts">
import CitySelector from "./CitySelector.vue";
import Composer from "./Composer.vue";
import ConversationBar from "./ConversationBar.vue";
import MessageList from "./MessageList.vue";
import type { ChatMessage, ConversationSummary, StatusVariant } from "../types/travel";

defineProps<{
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
</script>

<template>
  <section class="panel chat-panel">
    <header class="panel-header chat-header">
      <div class="chat-header-top">
        <div>
          <h1 class="panel-title">AI 旅游助手</h1>
          <p class="panel-subtitle">说出目的地，自动规划美食 · 景点 · 行程</p>
        </div>
        <span class="status-badge" :class="statusVariant">{{ statusText }}</span>
      </div>
      <CitySelector :cities="cities" :current-city-id="currentCityId" :current-city-name="currentCityName"
        @select="emit('selectCity', $event)" />
      <ConversationBar
        :conversations="conversations"
        :current-conversation-id="currentConversationId"
        :loading="conversationsLoading"
        @new-chat="emit('newConversation')"
        @select="emit('selectConversation', $event)"
        @delete="emit('deleteConversation', $event)"
      />
    </header>

    <MessageList :messages="messages" :streaming-content="streamingContent" :is-streaming="isStreaming" />

    <Composer placeholder="例如：成都 2 日美食攻略 / 西安必吃小吃 / 杭州出片机位" :disabled="false" :is-submitting="isSubmitting"
      @submit="emit('submit', $event)" @stop="emit('stop')" />
  </section>
</template>
