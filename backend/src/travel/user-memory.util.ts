import { detectCityInText, resolveCityId } from "./travel.constants";

const MAX_SECTION_ITEMS = 12;

type MemorySections = {
  dietary: string[];
  constraints: string[];
  budget: string[];
  defaultCity: string[];
  notes: string[];
};

const EMPTY_SECTIONS = (): MemorySections => ({
  dietary: [],
  constraints: [],
  budget: [],
  defaultCity: [],
  notes: [],
});

const SECTION_HEADERS: Record<keyof MemorySections, string> = {
  dietary: "## 饮食偏好",
  constraints: "## 出行约束",
  budget: "## 预算与节奏",
  defaultCity: "## 常用城市",
  notes: "## 其他",
};

/** 从 Markdown 解析各区块列表项 */
export function parseMemoryMarkdown(md: string): MemorySections {
  const sections = EMPTY_SECTIONS();
  if (!md.trim()) return sections;

  let current: keyof MemorySections | null = null;
  const headerToKey = new Map<string, keyof MemorySections>(
    (Object.entries(SECTION_HEADERS) as [keyof MemorySections, string][]).map(([k, h]) => [h.replace("## ", ""), k]),
  );
  for (const line of md.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      const title = trimmed.slice(3).trim();
      current = headerToKey.get(title) ?? null;
      continue;
    }
    if (current && trimmed.startsWith("- ")) {
      const item = trimmed.slice(2).trim();
      if (item) sections[current].push(item);
    }
  }
  return sections;
}

function renderMemoryMarkdown(sections: MemorySections): string {
  const lines = ["# 用户旅行记忆", ""];
  for (const key of Object.keys(SECTION_HEADERS) as (keyof MemorySections)[]) {
    const items = sections[key];
    if (!items.length) continue;
    lines.push(SECTION_HEADERS[key], ...items.map((i) => `- ${i}`), "");
  }
  return lines.join("\n").trimEnd();
}

function uniquePush(list: string[], item: string) {
  const norm = item.trim();
  if (!norm) return;
  if (list.some((x) => x === norm)) return;
  list.push(norm);
  while (list.length > MAX_SECTION_ITEMS) list.shift();
}

/** 规则从用户话术中抽取可写入记忆的条目（不调用 LLM） */
export function extractMemoryFactsFromText(text: string): Partial<MemorySections> {
  const t = text.trim();
  if (!t) return {};

  const out: Partial<MemorySections> = {};

  if (/不吃辣|忌辣|不要辣|不能吃辣|过敏/.test(t)) {
    out.dietary = ["不吃辣 / 忌辣"];
  } else if (/微辣|少辣|能(?:吃)?辣|喜(?:欢)?辣/.test(t)) {
    out.dietary = ["可接受辣度（见对话细节）"];
  }
  if (/素食|吃素|不吃肉/.test(t)) {
    out.dietary = [...(out.dietary ?? []), "素食"];
  }
  if (/清真|不吃猪/.test(t)) {
    out.dietary = [...(out.dietary ?? []), "清真 / 不吃猪肉"];
  }

  if (/带老人|有老人|父母同行|腿脚不便/.test(t)) {
    out.constraints = ["带老人，行程宜轻松、少步行"];
  }
  if (/带娃|带小孩|亲子|儿童/.test(t)) {
    out.constraints = [...(out.constraints ?? []), "亲子出行"];
  }
  if (/轮椅|无障碍/.test(t)) {
    out.constraints = [...(out.constraints ?? []), "需要无障碍设施"];
  }
  if (/不要早起|睡懒觉|晚起/.test(t)) {
    out.constraints = [...(out.constraints ?? []), "偏好晚出发、勿安排过早行程"];
  }

  if (/预算|省钱|经济实惠|中等消费|轻奢/.test(t)) {
    const snippet = t.match(/预算[^\s，。]{0,12}|省钱|经济实惠|中等消费|轻奢/)?.[0] ?? "预算敏感";
    out.budget = [`预算倾向：${snippet}`];
  }

  const city = detectCityInText(t);
  if (city) {
    out.defaultCity = [`常提及 / 默认城市：${resolveCityId(city)}`];
  }

  if (/记住|以后都|下次也|我一直|我通常/.test(t)) {
    const snippet = t.replace(/\s+/g, " ").slice(0, 80);
    out.notes = [`用户强调：${snippet}`];
  }

  return out;
}

export function mergeMemorySections(existing: MemorySections, patch: Partial<MemorySections>): MemorySections {
  const merged = { ...existing, dietary: [...existing.dietary], constraints: [...existing.constraints], budget: [...existing.budget], defaultCity: [...existing.defaultCity], notes: [...existing.notes] };
  for (const key of Object.keys(patch) as (keyof MemorySections)[]) {
    for (const item of patch[key] ?? []) {
      uniquePush(merged[key], item);
    }
  }
  return merged;
}

/** 将规则抽取结果合并进现有 Markdown 记忆 */
export function applyMemoryPatch(existingMd: string, userText: string): string {
  const patch = extractMemoryFactsFromText(userText);
  if (!Object.values(patch).some((v) => v?.length)) {
    return existingMd.trim();
  }
  const sections = mergeMemorySections(parseMemoryMarkdown(existingMd), patch);
  return renderMemoryMarkdown(sections);
}

export function formatMemoryForPrompt(md: string): string {
  const trimmed = md.trim();
  if (!trimmed) return "";
  return ["## 用户长期记忆（Markdown）", trimmed, ""].join("\n");
}
