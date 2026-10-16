import type { KbRepository } from "../database/repositories/kb.repository";
import {
  CityPartitionedVectorIndex,
  GLOBAL_PARTITION,
  toPartitionKey,
} from "./city-partitioned-vector-index";

/**
 * 按城分区的 TF-IDF 索引：封装 lazy build / 失效重建，对外只暴露 prepare + search + 统计。
 */
export class LocalTfidfIndex {
  private readonly partitions = new CityPartitionedVectorIndex();

  warmGlobal(kb: KbRepository) {
    this.loadPartitionFromDb(kb, GLOBAL_PARTITION);
  }

  /** 检索前保证 __global__ + 目标城市分区已在内存中 */
  prepareForSearch(kb: KbRepository, cityId: string | undefined) {
    this.loadPartitionFromDb(kb, GLOBAL_PARTITION);
    if (cityId) this.loadPartitionFromDb(kb, cityId);
  }

  search(query: string, cityId: string | undefined, limit: number) {
    return this.partitions.search(query, cityId, limit);
  }

  /** KB 文档增删后刷新相关分区 */
  refreshAfterKbChange(kb: KbRepository, cityId: string | null) {
    this.partitions.invalidate(GLOBAL_PARTITION);
    this.loadPartitionFromDb(kb, GLOBAL_PARTITION);

    const key = toPartitionKey(cityId);
    if (key !== GLOBAL_PARTITION) {
      this.partitions.invalidate(key);
      this.loadPartitionFromDb(kb, key);
    }
  }

  scopedSize(cityId: string | undefined) {
    return this.partitions.scopedSize(cityId);
  }

  partitionCount() {
    return this.partitions.partitionCount();
  }

  totalBuiltSize() {
    return this.partitions.totalBuiltSize();
  }

  private loadPartitionFromDb(kb: KbRepository, partitionKey: string) {
    if (this.partitions.hasPartition(partitionKey)) return;

    const docs = kb.loadPartitionChunkDocs(partitionKey).map((row) => ({
      id: row.chunk_id,
      content: row.content,
      cityId: row.city_id,
    }));
    this.partitions.buildPartition(partitionKey, docs);
  }
}

export { GLOBAL_PARTITION };
