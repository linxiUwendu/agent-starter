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
    <el-button size="small" data-testid="new-conversation" @click="emit('newChat')">
      + 新对话
    </el-button>
    <el-select
      class="conv-select"
      data-testid="conversation-select"
      :model-value="currentConversationId ?? ''"
      placeholder="历史对话"
      :disabled="loading"
      filterable
      @update:model-value="(v: string) => v && emit('select', v)"
    >
      <el-option
        v-for="conv in conversations"
        :key="conv.id"
        :label="`${conv.title} (${conv.messageCount})`"
        :value="conv.id"
      />
    </el-select>
    <el-button
      v-if="currentConversationId"
      size="small"
      type="danger"
      plain
      title="删除当前对话"
      @click="emit('delete', currentConversationId)"
    >
      删除
    </el-button>
  </div>
</template>

<style scoped>
.conversation-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.conv-select {
  flex: 1;
  min-width: 0;
}
</style>
