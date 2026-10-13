import { computed, ref } from "vue";

import type {
  ChatMessage,
  CityRecord,
  FoodGuide,
  ItineraryDetail,
  Poi,
  PhotoSpot,
  TravelContext,
} from "../types/travel";
import { DEFAULT_CITY, detectCityInText, getCityDisplayName } from "../utils/detectCity";

const STORAGE_KEY = "travel.city";

const GENERIC_WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "你好！我是 **AI 旅游助手** 🧭\n\n" +
    "支持：汕头、长沙、广州、杭州、西安、扬州、上海、北京、洛阳、武汉、成都\n\n" +
    "**直接告诉我你想去哪**，我会自动识别城市，例如：\n" +
    "- 「成都 2 日火锅攻略，想看熊猫」\n" +
    "- 「西安有什么必吃小吃」\n" +
    "- 「杭州西湖拍照机位推荐」",
};

const cities = ref<CityRecord[]>([]);
const currentCityId = ref(localStorage.getItem(STORAGE_KEY) ?? DEFAULT_CITY);
const cityDetectedFromChat = ref(false);
const messages = ref<ChatMessage[]>([GENERIC_WELCOME]);
const conversationId = ref<string | null>(null);
const travelContext = ref<TravelContext | null>(null);
const foodGuide = ref<FoodGuide | null>(null);
const highlightedPoiIds = ref<string[]>([]);

const currentCity = computed(() => cities.value.find((c) => c.id === currentCityId.value) ?? null);

const currentCityName = computed(() => {
  if (!cityDetectedFromChat.value && messages.value.length <= 1) {
    return "全国";
  }
  return currentCity.value?.name ?? getCityDisplayName(currentCityId.value, cities.value);
});

const activeItinerary = computed<ItineraryDetail | null>(
  () => travelContext.value?.itinerary ?? null,
);

const mapPois = computed<Poi[]>(() => travelContext.value?.pois ?? []);

const mapPhotoSpots = computed<PhotoSpot[]>(() => travelContext.value?.photoSpots ?? []);

/**
 * 设置全局城市列表，并在当前选中城市无效时自动回退到列表首项。
 *
 * @param list - 从 API 加载的城市记录数组
 */
function setCities(list: CityRecord[]) {
  cities.value = list;
  if (!list.some((c) => c.id === currentCityId.value) && list[0]) {
    currentCityId.value = list[0].id;
  }
}

/**
 * 更新旅游上下文，同步高亮 POI，并在上下文城市与当前城市不一致时自动切换城市。
 *
 * @param context - 服务端返回或本地组装的旅游上下文（POI、行程、拍照点等）
 */
function setContext(context: TravelContext) {
  travelContext.value = context;
  highlightedPoiIds.value = context.pois.map((p) => p.id);
  if (context.city && context.city !== currentCityId.value) {
    applyCity(context.city);
  }
}

/**
 * 设置当前城市的美食指南数据，供侧边栏或详情面板展示。
 *
 * @param guide - 美食指南对象
 */
function setFoodGuide(guide: FoodGuide) {
  foodGuide.value = guide;
}

/**
 * 向对话末尾追加一条消息（不可变更新 messages 数组）。
 *
 * @param message - 待追加的聊天消息（user 或 assistant）
 */
function appendMessage(message: ChatMessage) {
  messages.value = [...messages.value, message];
}

/**
 * 设置当前活跃会话 ID，用于续写或关联服务端持久化对话。
 *
 * @param id - 会话 ID；传 `null` 表示清除关联（新对话）
 */
function setConversationId(id: string | null) {
  conversationId.value = id;
}

/**
 * 重置聊天相关状态至初始值，保留城市选择不变。
 *
 * 清空旅游上下文、美食指南、POI 高亮，恢复欢迎语，并重置「从对话识别城市」标记。
 */
function resetChatState() {
  travelContext.value = null;
  foodGuide.value = null;
  highlightedPoiIds.value = [];
  messages.value = [GENERIC_WELCOME];
  cityDetectedFromChat.value = false;
}

/**
 * 加载已有会话的消息历史，并可选同步城市。
 *
 * @param loaded - 从 API 拉取的消息列表
 * @param cityId - 可选城市 ID；若提供则调用 {@link applyCity} 切换城市
 */
function loadConversationMessages(loaded: ChatMessage[], cityId?: string | null) {
  messages.value = loaded.length ? loaded : [GENERIC_WELCOME];
  if (cityId) applyCity(cityId);
}

/**
 * 在地图上高亮指定 POI（替换当前高亮列表为单项）。
 *
 * @param id - 要高亮的 POI 唯一标识
 */
function highlightPoi(id: string) {
  highlightedPoiIds.value = [id];
}

/**
 * 识别并切换城市，不清空对话历史。
 *
 * 若 cityId 不在已知城市列表中则忽略；若已是当前城市且已从对话识别过，则跳过以避免重复写入。
 *
 * @param cityId - 目标城市 ID
 */
function applyCity(cityId: string) {
  if (!cities.value.some((c) => c.id === cityId)) return;
  if (cityId === currentCityId.value && cityDetectedFromChat.value) return;
  currentCityId.value = cityId;
  cityDetectedFromChat.value = true;
  localStorage.setItem(STORAGE_KEY, cityId);
}

/**
 * 从用户输入文本中识别城市并立即应用。
 *
 * @param text - 用户输入的自然语言文本
 * @returns 识别到的城市 ID；未命中任何别名或 ID 时返回 `null`
 */
function detectAndApplyCity(text: string): string | null {
  const detected = detectCityInText(text);
  if (detected) applyCity(detected);
  return detected;
}

/**
 * 用户手动切换城市：更新选中城市、持久化到 localStorage，并清空会话与聊天状态。
 *
 * 若目标城市与当前相同则直接返回，不触发重置。
 *
 * @param cityId - 用户选择的目标城市 ID
 */
function switchCityManual(cityId: string) {
  if (cityId === currentCityId.value) return;
  currentCityId.value = cityId;
  cityDetectedFromChat.value = true;
  localStorage.setItem(STORAGE_KEY, cityId);
  conversationId.value = null;
  resetChatState();
}

/**
 * 旅游聊天 composable：提供全局共享的响应式状态与操作方法。
 *
 * 模块级单例 ref/computed，多处调用 `useTravelChat()` 共享同一份城市、消息、
 * 上下文与地图数据。适用于聊天页、地图侧栏、会话列表等组件。
 *
 * @returns 包含响应式状态（ref/computed）与状态变更方法的对象
 */
export function useTravelChat() {
  return {
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
    setConversationId,
    resetChatState,
    loadConversationMessages,
    detectAndApplyCity,
    switchCityManual,
  };
}
