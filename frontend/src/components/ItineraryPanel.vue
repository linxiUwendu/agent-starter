<script setup lang="ts">
import { ref, watch } from "vue";

import { fetchRagDocument, fetchRagDocuments, upsertRagDocument } from "../api/travel";
import type {
  FoodGuide,
  ItineraryDetail,
  KbDocumentDetail,
  KbDocumentSummary,
  PanelTab,
  Poi,
  RagChunk,
  RagRetrieveMeta,
} from "../types/travel";

const props = defineProps<{
  itinerary: ItineraryDetail | null;
  pois: Poi[];
  foodGuide: FoodGuide | null;
  cityName: string;
  cityId: string;
  ragChunks: RagChunk[];
  ragMeta: RagRetrieveMeta | null;
}>();

const emit = defineEmits<{
  selectPoi: [id: string];
}>();

const activeTab = ref<PanelTab>("itinerary");
const ragStats = ref({ documents: 0, chunks: 0 });
const ragDocuments = ref<KbDocumentSummary[]>([]);
const ragLoading = ref(false);
const expandedDocId = ref<string | null>(null);
const expandedDoc = ref<KbDocumentDetail | null>(null);
const showAddForm = ref(false);
const addTitle = ref("");
const addContent = ref("");
const addSaving = ref(false);

function groupedDays(trip: ItineraryDetail) {
  const map = new Map<number, typeof trip.items>();
  for (const item of trip.items) {
    const list = map.get(item.day) ?? [];
    list.push(item);
    map.set(item.day, list);
  }
  return [...map.entries()].sort(([a], [b]) => a - b);
}

async function submitNewDocument() {
  if (!addTitle.value.trim() || !addContent.value.trim()) return;
  addSaving.value = true;
  try {
    await upsertRagDocument({
      cityId: props.cityId,
      title: addTitle.value.trim(),
      content: addContent.value.trim(),
    });
    addTitle.value = "";
    addContent.value = "";
    showAddForm.value = false;
    await loadRagLibrary();
  } finally {
    addSaving.value = false;
  }
}

async function loadRagLibrary() {
  ragLoading.value = true;
  try {
    const data = await fetchRagDocuments(props.cityId);
    ragStats.value = data.stats;
    ragDocuments.value = data.documents;
  } catch {
    ragStats.value = { documents: 0, chunks: 0 };
    ragDocuments.value = [];
  } finally {
    ragLoading.value = false;
  }
}

async function toggleDocument(id: string) {
  if (expandedDocId.value === id) {
    expandedDocId.value = null;
    expandedDoc.value = null;
    return;
  }
  expandedDocId.value = id;
  try {
    expandedDoc.value = await fetchRagDocument(id);
  } catch {
    expandedDoc.value = null;
  }
}

watch(
  () => [activeTab.value, props.cityId] as const,
  ([tab]) => {
    if (tab === "rag") void loadRagLibrary();
  },
);
</script>

<template>
  <section class="panel itinerary-panel">
    <header class="panel-header compact">
      <h2 class="panel-title">{{ cityName }} · 攻略</h2>
      <div class="tab-bar">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'itinerary' }"
          @click="activeTab = 'itinerary'"
        >
          行程
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'food' }"
          @click="activeTab = 'food'"
        >
          美食
        </button>
        <button
          type="button"
          class="tab-btn"
          data-testid="panel-tab-rag"
          :class="{ active: activeTab === 'rag' }"
          @click="activeTab = 'rag'"
        >
          知识库
        </button>
      </div>
    </header>

    <div class="itinerary-scroll">
      <template v-if="activeTab === 'itinerary'">
        <template v-if="itinerary">
          <article class="itinerary-card">
            <h3>{{ itinerary.title }}</h3>
            <p class="itinerary-summary">{{ itinerary.summary }}</p>
            <div class="tag-row">
              <span v-for="tag in itinerary.tags" :key="tag" class="tag">{{ tag }}</span>
            </div>
          </article>

          <section v-for="[day, items] in groupedDays(itinerary)" :key="day" class="day-block">
            <h4>Day {{ day }}</h4>
            <ul class="timeline">
              <li v-for="item in items" :key="item.id" class="timeline-item">
                <span class="time">{{ item.time_slot }}</span>
                <div class="timeline-body">
                  <button
                    v-if="item.poi"
                    type="button"
                    class="poi-link"
                    @click="emit('selectPoi', item.poi!.id)"
                  >
                    {{ item.poi.name }}
                  </button>
                  <span v-else>自由活动</span>
                  <p v-if="item.note" class="note">{{ item.note }}</p>
                </div>
              </li>
            </ul>
          </section>
        </template>
        <p v-else class="empty-hint">发送消息后，相关行程会显示在这里。</p>

        <section v-if="pois.length" class="poi-list-block">
          <h4>相关地点</h4>
          <ul class="poi-mini-list">
            <li v-for="poi in pois.slice(0, 8)" :key="poi.id">
              <button type="button" class="poi-link" @click="emit('selectPoi', poi.id)">
                {{ poi.name }}
              </button>
              <span class="poi-meta">{{ poi.type }} · {{ poi.price_level ?? "—" }}</span>
            </li>
          </ul>
        </section>
      </template>

      <template v-else-if="activeTab === 'food'">
        <template v-if="foodGuide?.foodItinerary">
          <article class="itinerary-card food-card">
            <h3>{{ foodGuide.foodItinerary.title }}</h3>
            <p class="itinerary-summary">{{ foodGuide.foodItinerary.summary }}</p>
          </article>
          <section
            v-for="[day, items] in groupedDays(foodGuide.foodItinerary)"
            :key="day"
            class="day-block"
          >
            <h4>Day {{ day }}</h4>
            <ul class="timeline">
              <li v-for="item in items" :key="item.id" class="timeline-item">
                <span class="time">{{ item.time_slot }}</span>
                <div class="timeline-body">
                  <button
                    v-if="item.poi"
                    type="button"
                    class="poi-link"
                    @click="emit('selectPoi', item.poi!.id)"
                  >
                    {{ item.poi.name }}
                  </button>
                  <p v-if="item.note" class="note">{{ item.note }}</p>
                </div>
              </li>
            </ul>
          </section>
        </template>

        <section v-if="foodGuide?.foods.length" class="poi-list-block">
          <h4>{{ cityName }}必吃清单</h4>
          <ul class="food-list">
            <li v-for="food in foodGuide.foods" :key="food.id" class="food-item">
              <button type="button" class="poi-link" @click="emit('selectPoi', food.id)">
                {{ food.name }}
              </button>
              <p class="food-desc">{{ food.description }}</p>
              <div class="food-meta">
                <span v-for="tag in food.tags.slice(0, 3)" :key="tag" class="tag small">{{ tag }}</span>
                <span class="price">{{ food.price_level ?? "—" }}</span>
              </div>
              <p v-if="food.tips" class="note">{{ food.tips }}</p>
            </li>
          </ul>
        </section>
        <p v-else class="empty-hint">加载美食数据中...</p>
      </template>

      <template v-else>
        <p class="rag-stats-line">
          共 {{ ragStats.documents }} 篇文档 · {{ ragStats.chunks }} 个分块
          <button type="button" class="link-btn" :disabled="ragLoading" @click="loadRagLibrary">
            {{ ragLoading ? "加载中…" : "刷新" }}
          </button>
        </p>

        <section v-if="ragChunks.length" class="poi-list-block rag-hit-block" data-testid="rag-hits">
          <h4>本次对话命中</h4>
          <p v-if="ragMeta" class="rag-meta-line">
            {{ ragMeta.durationMs }}ms · {{ ragMeta.methods.join("+") }} · ≈{{ ragMeta.tokenEstimate }} tokens ·
            {{ ragMeta.provider }}
          </p>
          <ul class="food-list">
            <li v-for="chunk in ragChunks" :key="chunk.chunkId" class="food-item rag-chunk-item">
              <strong>{{ chunk.documentTitle }}</strong>
              <span v-if="chunk.method" class="tag small">{{ chunk.method }}</span>
              <p class="food-desc rag-chunk-preview">{{ chunk.content }}</p>
            </li>
          </ul>
        </section>

        <section class="poi-list-block">
          <div class="rag-add-header">
            <h4>城市知识库</h4>
            <button type="button" class="link-btn" @click="showAddForm = !showAddForm">
              {{ showAddForm ? "取消" : "+ 添加文档" }}
            </button>
          </div>
          <form v-if="showAddForm" class="rag-add-form" @submit.prevent="submitNewDocument">
            <input v-model="addTitle" type="text" placeholder="文档标题" required />
            <textarea v-model="addContent" rows="4" placeholder="Markdown 或纯文本内容" required />
            <button type="submit" class="link-btn" :disabled="addSaving">
              {{ addSaving ? "保存中…" : "保存并索引" }}
            </button>
          </form>
          <p v-if="ragLoading" class="empty-hint">加载知识库…</p>
          <ul v-else-if="ragDocuments.length" class="food-list">
            <li v-for="doc in ragDocuments" :key="doc.id" class="food-item rag-doc-item">
              <button type="button" class="poi-link rag-doc-title" @click="toggleDocument(doc.id)">
                {{ expandedDocId === doc.id ? "▼" : "▶" }} {{ doc.title }}
              </button>
              <div class="food-meta">
                <span v-for="tag in doc.tags" :key="tag" class="tag small">{{ tag }}</span>
                <span class="price">{{ doc.chunkCount }} 块</span>
              </div>
              <template v-if="expandedDocId === doc.id && expandedDoc">
                <pre class="rag-doc-content">{{ expandedDoc.content }}</pre>
                <div v-if="expandedDoc.chunks.length > 1" class="rag-chunks-split">
                  <p class="note">分块预览（{{ expandedDoc.chunks.length }}）</p>
                  <div
                    v-for="chunk in expandedDoc.chunks"
                    :key="chunk.id"
                    class="rag-chunk-block"
                  >
                    <span class="rag-chunk-label">#{{ chunk.index + 1 }}</span>
                    <pre class="rag-chunk-text">{{ chunk.content }}</pre>
                  </div>
                </div>
              </template>
            </li>
          </ul>
          <p v-else class="empty-hint">暂无文档。请重启后端以 seed 知识库。</p>
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.rag-add-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.rag-add-header h4 {
  margin: 0;
}

.rag-add-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.rag-add-form input,
.rag-add-form textarea {
  width: 100%;
  font-size: 0.82rem;
  padding: 6px 8px;
  border: 1px solid var(--border, #ddd);
  border-radius: 6px;
}

.rag-meta-line {
  margin: 0 0 8px;
  font-size: 0.78rem;
  color: var(--muted);
}

.rag-stats-line {
  margin: 0 0 12px;
  font-size: 0.82rem;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 8px;
}

.link-btn {
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.82rem;
  padding: 0;
}

.link-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.rag-hit-block {
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 12px;
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.rag-chunk-preview {
  white-space: pre-wrap;
  max-height: 120px;
  overflow: auto;
}

.rag-doc-title {
  text-align: left;
  width: 100%;
}

.rag-doc-content,
.rag-chunk-text {
  margin: 8px 0 0;
  padding: 8px;
  font-size: 0.78rem;
  line-height: 1.45;
  white-space: pre-wrap;
  background: var(--bg-soft, #f6f6f6);
  border-radius: 6px;
  overflow: auto;
  max-height: 200px;
}

.rag-chunk-block {
  margin-top: 8px;
}

.rag-chunk-label {
  font-size: 0.75rem;
  color: var(--muted);
}
</style>
