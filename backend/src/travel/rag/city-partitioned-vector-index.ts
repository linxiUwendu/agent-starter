import { VectorDocument, VectorIndex } from "./vector-index";

/** 通用攻略（无 city_id）所在分区键 */
export const GLOBAL_PARTITION = "__global__";

/**
 * @description 将 city_id 映射为分区键；null/空串归入 GLOBAL_PARTITION。
 */
export function toPartitionKey(cityId: string | null | undefined): string {
  if (!cityId) return GLOBAL_PARTITION;
  return cityId;
}

/**
 * @description 按城市分区的 TF-IDF 向量索引管理器。
 * - 检索时只扫描「目标城市分区 + 通用分区」，避免全国 chunk 全量遍历
 * - 支持按分区 lazy build / 增量失效，适配多城市扩展
 */
export class CityPartitionedVectorIndex {
  private readonly partitions = new Map<string, VectorIndex>();

  /** @description 是否已构建某分区索引 */
  hasPartition(key: string): boolean {
    return this.partitions.has(key);
  }

  /** @description 已构建的分区数量 */
  partitionCount(): number {
    return this.partitions.size;
  }

  /** @description 全部已构建分区内的 chunk 总数 */
  totalBuiltSize(): number {
    let total = 0;
    for (const index of this.partitions.values()) {
      total += index.size();
    }
    return total;
  }

  /**
   * @description 某次检索实际会触达的分区 chunk 总量（city + global）。
   * @param cityId 当前检索城市；无则仅 global
   */
  scopedSize(cityId: string | undefined): number {
    let total = this.partitions.get(GLOBAL_PARTITION)?.size() ?? 0;
    if (cityId) {
      total += this.partitions.get(cityId)?.size() ?? 0;
    }
    return total;
  }

  /**
   * @description 构建或覆盖单个城市/通用分区索引。
   */
  buildPartition(key: string, docs: VectorDocument[]) {
    const index = new VectorIndex();
    index.build(docs);
    this.partitions.set(key, index);
  }

  /** @description 使某分区失效，下次检索前需重新 build */
  invalidate(key: string) {
    this.partitions.delete(key);
  }

  /** @description 清空全部分区（如全量重建前） */
  invalidateAll() {
    this.partitions.clear();
  }

  /**
   * @description 在 city 分区 + global 分区内检索并合并 Top-K。
   * 分区已预过滤城市，内部不再逐条比对 city_id。
   */
  search(query: string, cityId: string | undefined, limit: number) {
    if (limit <= 0) return [];

    const keys = cityId ? [cityId, GLOBAL_PARTITION] : [GLOBAL_PARTITION];
    const scoreById = new Map<string, number>();

    for (const key of keys) {
      const index = this.partitions.get(key);
      if (!index) continue;

      for (const hit of index.searchUnscoped(query, limit * 2)) {
        scoreById.set(hit.id, Math.max(scoreById.get(hit.id) ?? 0, hit.score));
      }
    }

    return [...scoreById.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
