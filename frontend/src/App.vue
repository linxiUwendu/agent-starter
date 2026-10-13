<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import {
  consumeTravelSse,
  createConversation,
  deleteConversation,
  fetchCities,
  fetchConversation,
  fetchConversations,
  fetchFoodGuide,
  sendTravelChat,
} from "./api/travel";
import ChatPanel from "./components/ChatPanel.vue";
import ItineraryPanel from "./components/ItineraryPanel.vue";
import MapPanel from "./components/MapPanel.vue";
import { useTravelChat } from "./composables/useTravelChat";
import { getCityDisplayName } from "./utils/detectCity";
import type { ConversationSummary, StatusVariant } from "./types/travel";

const statusText = ref("Ready");
const statusVariant = ref<StatusVariant>("");
const streamingContent = ref("");
const isStreaming = ref(false);
const isSubmitting = ref(false);
const conversations = ref<ConversationSummary[]>([]);
const conversationsLoading = ref(false);

const {
  cities,
  currentCityId,
  currentCity,
  currentCityName,
  conversationId,
  messages,
  travelContext,
  foodGuide,
  activeItinerary,
  mapPois,
  mapPhotoSpots,
  highlightedPoiIds,
  setCities,
  setContext,
  setFoodGuide,
  appendMessage,
  highlightPoi,
  detectAndApplyCity,
  switchCityManual,
  setConversationId,
  resetChatState,
  loadConversationMessages,
} = useTravelChat();

const cityCenter = computed(() => {
  const c = currentCity.value;
  if (c?.center_lat != null && c?.center_lng != null) {
    return { lat: c.center_lat, lng: c.center_lng };
  }
  return null;
});

let activeStream: AbortController | null = null;

function setStatus(text: string, variant: StatusVariant = "") {
  statusText.value = text;
  statusVariant.value = variant;
}

async function loadFoodGuide(cityId: string) {
  try {
    setFoodGuide(await fetchFoodGuide(cityId));
  } catch {
    setFoodGuide({ foods: [], foodItinerary: null });
  }
}

async function syncCitySideEffects(cityId: string) {
  await loadFoodGuide(cityId);
}

async function refreshConversations() {
  conversationsLoading.value = true;
  try {
    conversations.value = await fetchConversations();
  } catch {
    conversations.value = [];
  } finally {
    conversationsLoading.value = false;
  }
}

async function handleCityChange(cityId: string) {
  switchCityManual(cityId);
  await syncCitySideEffects(cityId);
}

async function handleNewConversation() {
  try {
    const created = await createConversation(currentCityId.value);
    setConversationId(created.id);
    resetChatState();
    await refreshConversations();
  } catch {
    setStatus("创建对话失败", "error");
  }
}

async function handleSelectConversation(id: string) {
  if (!id || id === conversationId.value) return;
  try {
    const detail = await fetchConversation(id);
    setConversationId(detail.id);
    resetChatState();
    loadConversationMessages(detail.messages, detail.cityId);
    if (detail.cityId) await syncCitySideEffects(detail.cityId);
  } catch {
    setStatus("加载对话失败", "error");
  }
}

async function handleDeleteConversation(id: string) {
  try {
    await deleteConversation(id);
    if (conversationId.value === id) {
      setConversationId(null);
      resetChatState();
    }
    await refreshConversations();
  } catch {
    setStatus("删除对话失败", "error");
  }
}

async function handleSubmit(content: string) {
  const detected = detectAndApplyCity(content);
  const cityName = detected
    ? getCityDisplayName(detected, cities.value)
    : currentCityName.value;

  appendMessage({ role: "user", content });

  if (detected) {
    await syncCitySideEffects(detected);
  }

  isSubmitting.value = true;
  isStreaming.value = true;
  streamingContent.value = "";
  setStatus(`识别到${cityName}，检索数据中...`, "streaming");

  activeStream = new AbortController();

  try {
    const response = await sendTravelChat(
      messages.value,
      currentCityId.value,
      activeStream.signal,
      conversationId.value,
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || `Request failed (${response.status}).`);
    }

    await consumeTravelSse(response, {
      onStart() {
        setStatus("思考中...", "streaming");
      },
      onContext(context) {
        setContext(context);
        if (context.city) {
          void syncCitySideEffects(context.city);
        }
        setStatus(`生成${context.cityName}攻略中...`, "streaming");
      },
      onDelta(text) {
        streamingContent.value += text;
      },
      onDone(payload) {
        streamingContent.value = payload.answer || streamingContent.value;
        if (payload.context) {
          setContext(payload.context);
          if (payload.context.city) void syncCitySideEffects(payload.context.city);
        }
        if (payload.conversationId) {
          setConversationId(payload.conversationId);
          void refreshConversations();
        }
      },
      onError(error) {
        throw new Error(error);
      },
      onIdleTimeout() {
        throw new Error("等待响应超时，请重试。");
      },
    });

    const answer = streamingContent.value.trim();
    if (!answer) throw new Error("Empty response from server.");

    appendMessage({ role: "assistant", content: answer });
    setStatus("Ready");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (streamingContent.value.trim()) {
        appendMessage({ role: "assistant", content: streamingContent.value });
      }
      setStatus("已停止");
    } else {
      const errorText = `抱歉，暂时无法获取回复。\n${error instanceof Error ? error.message : "Unknown error."}`;
      appendMessage({ role: "assistant", content: errorText });
      setStatus("Error", "error");
    }
  } finally {
    isStreaming.value = false;
    streamingContent.value = "";
    isSubmitting.value = false;
    activeStream = null;
  }
}

function handleStop() {
  activeStream?.abort();
}

onMounted(async () => {
  try {
    const list = await fetchCities();
    setCities(list);
    await loadFoodGuide(currentCityId.value);
    await refreshConversations();
  } catch {
    setStatus("加载城市失败", "error");
  }
});
</script>

<template>
  <div class="travel-app">
    <ChatPanel
      :cities="cities"
      :current-city-id="currentCityId"
      :current-city-name="currentCityName"
      :messages="messages"
      :streaming-content="streamingContent"
      :is-streaming="isStreaming"
      :status-text="statusText"
      :status-variant="statusVariant"
      :is-submitting="isSubmitting"
      :conversations="conversations"
      :current-conversation-id="conversationId"
      :conversations-loading="conversationsLoading"
      @submit="handleSubmit"
      @stop="handleStop"
      @select-city="handleCityChange"
      @new-conversation="handleNewConversation"
      @select-conversation="handleSelectConversation"
      @delete-conversation="handleDeleteConversation"
    />
    <MapPanel
      :city-id="currentCityId"
      :pois="mapPois"
      :photo-spots="mapPhotoSpots"
      :highlighted-ids="highlightedPoiIds"
      :city-center="cityCenter"
    />
    <ItineraryPanel
      :itinerary="activeItinerary"
      :pois="mapPois"
      :food-guide="foodGuide"
      :city-name="currentCityName === '全国' ? '当前' : currentCityName"
      :city-id="currentCityId"
      :rag-chunks="travelContext?.ragChunks ?? []"
      :rag-meta="travelContext?.ragMeta ?? null"
      @select-poi="highlightPoi"
    />
  </div>
</template>
