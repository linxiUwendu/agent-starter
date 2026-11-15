/** @description 解析 SQLite 中 JSON 字符串数组列（tags、highlights 等）。 */
export function parseJsonStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export type CaptureMeta = {
  angle?: string;
  best_light?: string;
  best_season?: string;
};

export type ItineraryScheduleEntry = {
  day: number;
  order: number;
  time?: string | null;
  poi_id?: string | null;
  note?: string | null;
  duration_min?: number | null;
};

/** @description 解析机位 POI 的 capture_meta JSON 列。 */
export function parseCaptureMeta(raw: string | null): CaptureMeta {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const obj = parsed as Record<string, unknown>;
    return {
      angle: obj.angle != null ? String(obj.angle) : undefined,
      best_light: obj.best_light != null ? String(obj.best_light) : undefined,
      best_season: obj.best_season != null ? String(obj.best_season) : undefined,
    };
  } catch {
    return {};
  }
}

/** @description 解析 itineraries.schedule JSON 列为有序条目。 */
export function parseItinerarySchedule(raw: string): ItineraryScheduleEntry[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const entries: ItineraryScheduleEntry[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const obj = entry as Record<string, unknown>;
      const day = Number(obj.day);
      const order = Number(obj.order);
      if (!Number.isFinite(day) || !Number.isFinite(order)) continue;
      entries.push({
        day,
        order,
        time: obj.time != null ? String(obj.time) : null,
        poi_id: obj.poi_id != null ? String(obj.poi_id) : null,
        note: obj.note != null ? String(obj.note) : null,
        duration_min:
          obj.duration_min != null && Number.isFinite(Number(obj.duration_min))
            ? Number(obj.duration_min)
            : null,
      });
    }

    return entries.sort((a, b) => a.day - b.day || a.order - b.order);
  } catch {
    return [];
  }
}
