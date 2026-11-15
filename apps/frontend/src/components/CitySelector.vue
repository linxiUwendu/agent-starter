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
      <el-text type="info" size="small">当前</el-text>
      <el-text tag="b" size="small">{{ currentCityName }}</el-text>
      <el-text v-if="currentCityName === '全国'" type="info" size="small">
        · 在消息里提城市名即可
      </el-text>
      <el-button link type="primary" size="small" @click="expanded = !expanded">
        {{ expanded ? "收起" : "手动切换" }}
      </el-button>
    </div>
    <div v-if="expanded" class="city-selector">
      <el-check-tag
        v-for="city in cities"
        :key="city.id"
        :checked="city.id === currentCityId"
        @change="(checked: boolean) => checked && emit('select', city.id)"
      >
        {{ city.name }}
      </el-check-tag>
    </div>
  </div>
</template>

<style scoped>
.city-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.city-current {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.city-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
