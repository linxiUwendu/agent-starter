<script setup lang="ts">
import { ref } from "vue";

import type { CityRecord } from "../types/travel";

defineProps<{
  cities: CityRecord[];
  currentCityId: string;
  currentCityName: string;
}>();

const emit = defineEmits<{
  select: [cityId: string];
}>();

const expanded = ref(false);
</script>

<template>
  <div class="city-bar">
    <div class="city-current">
      <span class="city-label">当前</span>
      <span class="city-name">{{ currentCityName }}</span>
      <span v-if="currentCityName === '全国'" class="city-hint">· 在消息里提城市名即可</span>
    </div>
    <button type="button" class="city-toggle" @click="expanded = !expanded">
      {{ expanded ? "收起" : "手动切换" }}
    </button>
    <div v-if="expanded" class="city-selector">
      <button
        v-for="city in cities"
        :key="city.id"
        type="button"
        class="city-chip"
        :class="{ active: city.id === currentCityId }"
        @click="emit('select', city.id)"
      >
        {{ city.name }}
      </button>
    </div>
  </div>
</template>
