export const DEFAULT_CITY = "shanghai";

export const CITY_ALIASES: Record<string, string> = {
  汕头: "shantou",
  长沙: "changsha",
  广州: "guangzhou",
  杭州: "hangzhou",
  西安: "xian",
  扬州: "yangzhou",
  上海: "shanghai",
  北京: "beijing",
  洛阳: "luoyang",
  武汉: "wuhan",
  成都: "chengdu",
  蓉城: "chengdu",
  羊城: "guangzhou",
  长安: "xian",
  帝都: "beijing",
  江城: "wuhan",
};

export function getTravelSystemPrompt(cityName: string) {
  return [
    `你是「${cityName} AI 旅游助手」，专注${cityName}旅游咨询。`,
    "",
    "你的能力：",
    "- 推荐景点、美食、出片机位",
    "- 帮用户规划 1-3 日行程",
    "- 给出实用避坑建议和最佳游玩时间",
    "",
    "回答要求：",
    "- 基于提供的 POI 数据、工具检索结果和「参考文档摘录」回答，不要编造不存在的店铺或景点",
    "- POI 列表中的店名、地址、评分为准；文档摘录用于经验性建议、避坑和季节说明",
    "- 可引用文档标题（如「成都美食指南」），文档未覆盖的内容请明确说明",
    "- 美食推荐注明大致人均和排队情况",
    "- 出片建议说明最佳光线时段和机位角度",
    "- 行程按地理区域聚类，减少折返",
    "- 用 Markdown 格式，结构清晰（标题、列表）",
    "- 语气友好、像本地朋友带路",
    "",
    "免责声明：你的建议仅供参考，出行前请核实营业时间和交通信息。",
  ].join("\n");
}

/**
 * Tool definitions exposed to the agent layer (executed server-side).
 * 运行时调用与结果合并见 `travel-tool.registry.ts` 中的 `TRAVEL_TOOL_REGISTRY`。
 */
export const TRAVEL_TOOLS = [
  {
    name: "search_poi",
    description: "按城市、关键词、类型搜索 POI（景点/美食/酒店等）",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "城市 ID，如 shanghai、beijing" },
        query: { type: "string", description: "搜索关键词" },
        type: {
          type: "string",
          enum: ["attraction", "food", "hotel", "photo_spot", "all"],
        },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_photo_spots",
    description: "获取出片机位列表",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string" },
        poi_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_itinerary",
    description: "获取预设行程模板（含美食攻略）",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string" },
        days: { type: "number", enum: [1, 2, 3] },
        theme: { type: "string", description: "主题：美食、经典、拍照" },
      },
      required: ["days"],
    },
  },
  {
    name: "recommend_food",
    description: "推荐当地美食",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string" },
        area: { type: "string" },
        cuisine: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "search_rag",
    description: "检索攻略知识库，获取避坑、季节、交通等经验性长文本",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "城市 ID" },
        query: { type: "string", description: "检索问句或关键词" },
        limit: { type: "number", description: "返回片段数，默认 5" },
      },
      required: ["query"],
    },
  },
] as const;

export type TravelToolName = (typeof TRAVEL_TOOLS)[number]["name"];

export function resolveCityId(input?: string): string {
  if (!input?.trim()) return DEFAULT_CITY;
  const trimmed = input.trim();
  if (CITY_ALIASES[trimmed]) return CITY_ALIASES[trimmed];
  const lower = trimmed.toLowerCase();
  if (Object.values(CITY_ALIASES).includes(lower)) return lower;
  return trimmed;
}

export function detectCityInText(text: string): string | null {
  if (!text.trim()) return null;

  const entries = Object.entries(CITY_ALIASES).sort(([a], [b]) => b.length - a.length);
  for (const [name, id] of entries) {
    if (text.includes(name)) return id;
  }

  const lower = text.toLowerCase();
  for (const id of new Set(Object.values(CITY_ALIASES))) {
    if (lower.includes(id)) return id;
  }

  return null;
}

/**
 * @description 知识库文档归属城市：正文/标题识别优先于请求 cityId（避免前端「当前浏览城市」误绑）。
 */
export function resolveKbDocumentCity(input: {
  cityId?: string | null;
  title: string;
  content: string;
  /** 运维手动选择的城市，不再被正文/标题推断覆盖 */
  cityIdLocked?: boolean;
}): { cityId: string | null; warning?: string } {
  const requested =
    input.cityId != null && String(input.cityId).trim() !== ""
      ? resolveCityId(String(input.cityId))
      : null;

  if (input.cityIdLocked && requested) {
    return { cityId: requested };
  }

  const inferred = detectCityInText(`${input.title}\n${input.content}`);

  if (inferred && requested && inferred !== requested) {
    return {
      cityId: inferred,
      warning: `文档内容识别为 ${inferred}，已忽略请求中的 cityId=${requested}`,
    };
  }

  return { cityId: inferred ?? requested };
}

export function resolveCityFromConversation(
  messages: Array<{ role: string; content: string }>,
  hintCity?: string,
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "user") continue;
    const found = detectCityInText(msg.content);
    if (found) return found;
  }
  return resolveCityId(hintCity);
}
