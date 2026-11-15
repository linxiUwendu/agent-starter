/**
 * 城市中文名、俗称与英文 ID 的映射表。
 *
 * 键为展示用名称（如「汕头」「羊城」「帝都」），值为统一 city id（如 `shantou`）。
 * 供 {@link detectCityInText} 做文本匹配。
 */
const CITY_ALIASES: Record<string, string> = {
  汕头: "shantou",
  长沙: "changsha",
  广州: "guangzhou",
  羊城: "guangzhou",
  杭州: "hangzhou",
  西安: "xian",
  长安: "xian",
  扬州: "yangzhou",
  上海: "shanghai",
  北京: "beijing",
  帝都: "beijing",
  洛阳: "luoyang",
  武汉: "wuhan",
  江城: "wuhan",
  成都: "chengdu",
  蓉城: "chengdu",
};

/**
 * 未从对话或 hint 中识别到城市时使用的默认 city id。
 */
export const DEFAULT_CITY = "shanghai";

const SORTED_ALIAS_ENTRIES = Object.entries(CITY_ALIASES).sort(([a], [b]) => b.length - a.length);

/**
 * 从单条文本中识别城市 ID。
 *
 * 优先按 {@link CITY_ALIASES} 中文别名长度降序匹配（避免「长安」被更短子串误伤），
 * 再尝试匹配英文 city id 子串；均无命中则返回 `null`。
 *
 * @param text - 待分析的文本（通常为单条用户消息）
 * @returns 识别到的 city id，或 `null`
 */
export function detectCityInText(text: string): string | null {
  if (!text.trim()) return null;

  for (const [name, id] of SORTED_ALIAS_ENTRIES) {
    if (text.includes(name)) return id;
  }

  const lower = text.toLowerCase();
  const ids = [...new Set(Object.values(CITY_ALIASES))];
  for (const id of ids) {
    if (lower.includes(id)) return id;
  }

  return null;
}

/**
 * 将 city id 转为用户可见的中文城市名。
 *
 * @param cityId - 城市 ID
 * @param cities - 城市列表（含 id 与 name）；用于查表，找不到时回退为 id 本身
 * @returns 展示用城市名，或原样返回 `cityId`
 */
export function getCityDisplayName(cityId: string, cities: Array<{ id: string; name: string }>) {
  return cities.find((c) => c.id === cityId)?.name ?? cityId;
}
