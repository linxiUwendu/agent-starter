<script setup lang="ts">
import type { ConversationSummary } from "../types/travel";

defineProps<{
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  newChat: [];
  select: [id: string];
  delete: [id: string];
}>();
</script>

<template>
  <div class="conversation-bar" data-testid="conversation-bar">
    <button type="button" class="conv-new-btn" data-testid="new-conversation" @click="emit('newChat')">
      + 新对话
    </button>
    <select
      class="conv-select"
      data-testid="conversation-select"
      :value="currentConversationId ?? ''"
      :disabled="loading"
      @change="emit('select', ($event.target as HTMLSelectElement).value)"
    >
      <option value="" disabled>历史对话</option>
      <option v-for="conv in conversations" :key="conv.id" :value="conv.id">
        {{ conv.title }} ({{ conv.messageCount }})
      </option>
    </select>
    <button
      v-if="currentConversationId"
      type="button"
      class="conv-delete-btn"
      title="删除当前对话"
      @click="emit('delete', currentConversationId)"
    >
      删除
    </button>
  </div>
</template>

<style scoped>
.conversation-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}

.conv-new-btn,
.conv-delete-btn {
  border: 1px solid var(--border, #ddd);
  background: var(--bg-soft, #f8f8f8);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.8rem;
  cursor: pointer;
}

.conv-select {
  flex: 1;
  min-width: 0;
  font-size: 0.82rem;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border, #ddd);
}
</style>
