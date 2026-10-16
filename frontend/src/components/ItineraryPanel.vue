<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { UploadFile } from "element-plus";

import {
  deleteRagDocument,
  fetchRagDocument,
  fetchRagDocuments,
  uploadRagPdfDocument,
  upsertRagDocument,
} from "../api/travel";
import KbAdminBar from "./KbAdminBar.vue";
import { useKbAdmin } from "../composables/useKbAdmin";
import { getCityDisplayName } from "../utils/detectCity";
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
  cities: Array<{ id: string; name: string }>;
  ragChunks: RagChunk[];
  ragMeta: RagRetrieveMeta | null;
  /** 运维模式下才展示知识库管理 Tab */
  kbAdmin: boolean;
}>();

const emit = defineEmits<{
  selectPoi: [id: string];
}>();

const { kbAdminHeaders } = useKbAdmin();

const activeTab = ref<PanelTab>("itinerary");
const ragStats = ref({ documents: 0, chunks: 0 });
const ragDocuments = ref<KbDocumentSummary[]>([]);
const ragLoading = ref(false);
const expandedDocId = ref<string | null>(null);
const expandedDoc = ref<KbDocumentDetail | null>(null);
const showAddForm = ref(false);
const addTitle = ref("");
const addContent = ref("");
/** 添加文档时必选归属城市（与列表筛选独立） */
const addDocCityId = ref("");
const addPdfFile = ref<File | null>(null);
const addSaving = ref(false);
const addError = ref("");
const deletingDocId = ref<string | null>(null);
/** 运维列表筛选：默认当前浏览城市，保存后可切到文档归属城市（不改动地图/对话城市） */
const ragListCityId = ref<string>("");
const addSaveSuccess = ref("");

function docCityLabel(cityId: string | null) {
  if (!cityId) return "通用";
  return getCityDisplayName(cityId, props.cities);
}

function ragListQueryCity(): string | undefined {
  if (!ragListCityId.value || ragListCityId.value === "__all__") return undefined;
  return ragListCityId.value;
}

const browseCityLabel = computed(() => getCityDisplayName(props.cityId, props.cities));

function defaultAddDocCityId(): string {
  if (ragListCityId.value && ragListCityId.value !== "__all__") return ragListCityId.value;
  return props.cityId;
}

function openAddDialog() {
  showAddForm.value = true;
}

watch(showAddForm, (open) => {
  if (!open) return;
  addDocCityId.value = defaultAddDocCityId();
  addTitle.value = "";
  addContent.value = "";
  addPdfFile.value = null;
  addError.value = "";
});

watch(activeTab, (tab) => {
  if (tab !== "rag") showAddForm.value = false;
});

function onPdfUpload(file: UploadFile) {
  addPdfFile.value = file.raw ?? null;
  if (addPdfFile.value && !addTitle.value.trim()) {
    addTitle.value = addPdfFile.value.name.replace(/\.pdf$/i, "");
  }
}

function clearPdf() {
  addPdfFile.value = null;
}

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
  if (!addDocCityId.value) {
    addError.value = "请先选择归属城市";
    return;
  }
  const hasPdf = addPdfFile.value != null;
  const hasText = addContent.value.trim().length > 0;
  if (!hasPdf && !hasText) {
    addError.value = "请粘贴文本或上传 PDF";
    return;
  }
  if (!hasPdf && !addTitle.value.trim()) {
    addError.value = "请填写文档标题";
    return;
  }

  addSaving.value = true;
  addError.value = "";
  addSaveSuccess.value = "";
  try {
    const saved = hasPdf
      ? await uploadRagPdfDocument(
        {
          cityId: addDocCityId.value,
          title: addTitle.value.trim() || undefined,
          file: addPdfFile.value!,
        },
        kbAdminHeaders(),
      )
      : await upsertRagDocument(
        {
          cityId: addDocCityId.value,
          title: addTitle.value.trim(),
          content: addContent.value.trim(),
        },
        kbAdminHeaders(),
      );
    addTitle.value = "";
    addContent.value = "";
    addPdfFile.value = null;
    showAddForm.value = false;

    const savedCity = saved.cityIdResolved ?? addDocCityId.value;
    if (savedCity) {
      ragListCityId.value = savedCity;
      addSaveSuccess.value = `已保存至「${docCityLabel(savedCity)}」知识库（列表筛选已同步，地图仍为「${browseCityLabel.value}」）。`;
    }

    await loadRagLibrary();
  } catch (error) {
    addError.value = error instanceof Error ? error.message : "保存失败";
  } finally {
    addSaving.value = false;
  }
}

async function loadRagLibrary() {
  ragLoading.value = true;
  try {
    const data = await fetchRagDocuments(ragListQueryCity(), kbAdminHeaders());
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
    expandedDoc.value = await fetchRagDocument(id, kbAdminHeaders());
  } catch {
    expandedDoc.value = null;
  }
}

async function removeDocument(doc: KbDocumentSummary) {
  try {
    await ElMessageBox.confirm(`确定删除「${doc.title}」？此操作不可恢复。`, "删除文档", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }

  deletingDocId.value = doc.id;
  try {
    await deleteRagDocument(doc.id, kbAdminHeaders());
    if (expandedDocId.value === doc.id) {
      expandedDocId.value = null;
      expandedDoc.value = null;
    }
    await loadRagLibrary();
    ElMessage.success("已删除");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "删除失败");
  } finally {
    deletingDocId.value = null;
  }
}

watch(
  () => props.kbAdmin,
  (admin) => {
    if (!admin && activeTab.value === "rag") activeTab.value = "itinerary";
  },
);

watch(
  () => [activeTab.value, props.kbAdmin, ragListCityId.value] as const,
  ([tab, admin]) => {
    if (tab !== "rag" || !admin) return;
    if (!ragListCityId.value) ragListCityId.value = props.cityId;
    void loadRagLibrary();
  },
);
</script>

<template>
  <section class="panel itinerary-panel">
    <header class="panel-header compact itinerary-panel-header">
      <h2 class="panel-title">{{ cityName }} · 攻略</h2>
      <div class="itinerary-header-tools">
        <el-radio-group v-model="activeTab" size="small">
          <el-radio-button label="itinerary">行程</el-radio-button>
          <el-radio-button label="food">美食</el-radio-button>
          <el-radio-button v-if="kbAdmin" label="rag" data-testid="panel-tab-rag" title="知识库运维">
            知识库
          </el-radio-button>
        </el-radio-group>
        <KbAdminBar />
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
                  <button v-if="item.poi" type="button" class="poi-link" @click="emit('selectPoi', item.poi!.id)">
                    {{ item.poi.name }}
                  </button>
                  <span v-else>自由活动</span>
                  <p v-if="item.note" class="note">{{ item.note }}</p>
                </div>
              </li>
            </ul>
          </section>
        </template>
        <el-empty v-else description="发送消息后，相关行程会显示在这里。" :image-size="64" />

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

        <section v-if="ragChunks.length" class="poi-list-block rag-hit-block" data-testid="rag-hits">
          <h4>参考攻略摘录</h4>
          <ul class="food-list">
            <li v-for="chunk in ragChunks" :key="chunk.chunkId" class="food-item rag-chunk-item">
              <strong>{{ chunk.documentTitle }}</strong>
              <p class="food-desc rag-chunk-preview">{{ chunk.content }}</p>
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
          <section v-for="[day, items] in groupedDays(foodGuide.foodItinerary)" :key="day" class="day-block">
            <h4>Day {{ day }}</h4>
            <ul class="timeline">
              <li v-for="item in items" :key="item.id" class="timeline-item">
                <span class="time">{{ item.time_slot }}</span>
                <div class="timeline-body">
                  <button v-if="item.poi" type="button" class="poi-link" @click="emit('selectPoi', item.poi!.id)">
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
        <el-empty v-else description="加载美食数据中..." :image-size="64" />
      </template>

      <template v-else-if="kbAdmin">
        <div class="rag-stats-line">
          <el-text size="small">
            全库 {{ ragStats.documents }} 篇 · {{ ragStats.chunks }} 分块
          </el-text>
          <el-button size="small" link type="primary" :loading="ragLoading" @click="loadRagLibrary">
            刷新
          </el-button>
        </div>

        <el-card shadow="never" class="rag-admin-card">
          <template #header>
            <div class="rag-add-header">
              <span>攻略文档</span>
              <div class="rag-add-header-actions">
                <el-button type="primary" plain size="small" @click="openAddDialog">+ 添加文档</el-button>
              </div>
            </div>
          </template>

          <el-form label-position="top" class="rag-filter-form">
            <el-form-item label="列表筛选">
              <el-select v-model="ragListCityId" class="full-width" @change="loadRagLibrary">
                <el-option v-for="c in cities" :key="c.id" :label="c.name" :value="c.id" />
                <el-option label="全部城市" value="__all__" />
              </el-select>
            </el-form-item>
          </el-form>

          <el-alert v-if="addSaveSuccess" type="success" :title="addSaveSuccess" show-icon :closable="false" />
          <el-text v-if="ragMeta" tag="p" size="small" type="info" class="rag-meta-line">
            最近检索 {{ ragMeta.durationMs }}ms · {{ ragMeta.methods.join("+") }} · {{ ragMeta.provider }}
          </el-text>

          <div v-if="ragLoading" v-loading="true" class="rag-loading" />
          <el-collapse v-else-if="ragDocuments.length" accordion class="rag-doc-collapse">
            <el-collapse-item v-for="doc in ragDocuments" :key="doc.id" :name="doc.id">
              <template #title>
                <div class="rag-doc-title-row">
                  <span class="rag-doc-title-text">{{ doc.title }}</span>
                  <el-button type="danger" link size="small" :loading="deletingDocId === doc.id"
                    @click.stop="removeDocument(doc)">
                    删除
                  </el-button>
                </div>
              </template>
              <div class="food-meta">
                <el-tag size="small" type="info">{{ docCityLabel(doc.cityId) }}</el-tag>
                <el-tag v-for="tag in doc.tags" :key="tag" size="small">{{ tag }}</el-tag>
                <el-text size="small" type="info">{{ doc.chunkCount }} 块</el-text>
              </div>
              <el-button link type="primary" size="small" @click="toggleDocument(doc.id)">
                {{ expandedDocId === doc.id ? "收起详情" : "查看全文" }}
              </el-button>
              <template v-if="expandedDocId === doc.id && expandedDoc">
                <el-input class="rag-doc-content" type="textarea" :model-value="expandedDoc.content" readonly
                  :autosize="{ minRows: 4, maxRows: 16 }" />
                <div v-if="expandedDoc.chunks.length > 1" class="rag-chunks-split">
                  <el-text size="small" type="info">分块预览（{{ expandedDoc.chunks.length }}）</el-text>
                  <el-card v-for="chunk in expandedDoc.chunks" :key="chunk.id" shadow="never" class="rag-chunk-block">
                    <template #header>#{{ chunk.index + 1 }}</template>
                    <el-text tag="pre" class="rag-chunk-text">{{ chunk.content }}</el-text>
                  </el-card>
                </div>
              </template>
            </el-collapse-item>
          </el-collapse>
          <el-empty v-else description="暂无文档。请重启后端以 seed 知识库。" :image-size="56" />
        </el-card>

        <el-dialog
          v-model="showAddForm"
          title="添加攻略文档"
          width="min(480px, 92vw)"
          destroy-on-close
          align-center
        >
          <el-form label-position="top" class="rag-add-form" @submit.prevent="submitNewDocument">
            <el-form-item label="归属城市（必选）" required>
              <el-select v-model="addDocCityId" placeholder="请选择城市" class="full-width">
                <el-option v-for="c in cities" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="文档标题">
              <el-input v-model="addTitle" placeholder="PDF 可留空，默认用文件名" clearable />
            </el-form-item>
            <el-form-item label="PDF 上传（可选，服务端解析）">
              <el-upload
                accept=".pdf,application/pdf"
                :auto-upload="false"
                :limit="1"
                :on-change="onPdfUpload"
                :on-remove="clearPdf"
              >
                <el-button size="small">选择 PDF</el-button>
              </el-upload>
            </el-form-item>
            <el-form-item label="正文">
              <el-input
                v-model="addContent"
                type="textarea"
                :rows="4"
                placeholder="Markdown 或纯文本；上传 PDF 时可留空，由后端解析"
              />
            </el-form-item>
            <el-alert v-if="addError" type="error" :title="addError" show-icon :closable="false" />
          </el-form>
          <template #footer>
            <el-button @click="showAddForm = false">取消</el-button>
            <el-button type="primary" :loading="addSaving" :disabled="!addDocCityId" @click="submitNewDocument">
              保存并索引
            </el-button>
          </template>
        </el-dialog>
      </template>
    </div>
  </section>
</template>

<style scoped>
.itinerary-panel-header {
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
}

.itinerary-panel-header .panel-title {
  flex-shrink: 0;
  font-size: 0.92rem;
  white-space: nowrap;
}

.itinerary-header-tools {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.itinerary-header-tools :deep(.el-radio-group) {
  flex-wrap: nowrap;
}

.full-width {
  width: 100%;
}

.rag-stats-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.rag-admin-card {
  border: 1px solid var(--el-border-color-lighter);
}

.rag-loading {
  min-height: 80px;
}

.rag-doc-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
  padding-right: 8px;
}

.rag-doc-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rag-meta-line {
  display: block;
  margin: 8px 0;
}

.rag-add-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rag-add-header-actions .link-btn.muted {
  color: var(--muted);
}

.rag-add-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.rag-add-header h4 {
  margin: 0;
}

.rag-filter-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--muted);
  margin-bottom: 10px;
}

.rag-filter-select {
  font-size: 0.82rem;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--border, #ddd);
}

.rag-save-success {
  margin: 0 0 10px;
  font-size: 0.78rem;
  color: #2e7d32;
  line-height: 1.45;
}

.admin-only-meta {
  margin: 0 0 8px;
}

.rag-city-tag {
  font-weight: 600;
}

.rag-add-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.rag-doc-city-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
}

.rag-add-error {
  margin: 0;
  font-size: 0.78rem;
  color: #c0392b;
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

.rag-doc-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.rag-doc-title {
  text-align: left;
  flex: 1;
  min-width: 0;
}

.rag-doc-delete {
  flex-shrink: 0;
  border: none;
  background: none;
  color: #c0392b;
  cursor: pointer;
  font-size: 0.78rem;
  padding: 2px 4px;
}

.rag-doc-delete:disabled {
  opacity: 0.5;
  cursor: default;
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
