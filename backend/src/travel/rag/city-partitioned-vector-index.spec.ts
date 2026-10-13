import {
  CityPartitionedVectorIndex,
  GLOBAL_PARTITION,
  toPartitionKey,
} from "./city-partitioned-vector-index";
import type { VectorDocument } from "./vector-index";

describe("CityPartitionedVectorIndex", () => {
  const chengduDocs: VectorDocument[] = [
    { id: "cd1", content: "成都火锅微辣起步", cityId: "chengdu" },
    { id: "cd2", content: "宽窄巷子晚上逛", cityId: "chengdu" },
  ];
  const shanghaiDocs: VectorDocument[] = [
    { id: "sh1", content: "上海本帮菜小笼包", cityId: "shanghai" },
  ];
  const globalDocs: VectorDocument[] = [
    { id: "g1", content: "出行记得带身份证", cityId: null },
  ];

  it("toPartitionKey maps empty city to global", () => {
    expect(toPartitionKey(null)).toBe(GLOBAL_PARTITION);
    expect(toPartitionKey("")).toBe(GLOBAL_PARTITION);
    expect(toPartitionKey("chengdu")).toBe("chengdu");
  });

  it("search only scans city + global partitions", () => {
    const index = new CityPartitionedVectorIndex();
    index.buildPartition("chengdu", chengduDocs);
    index.buildPartition("shanghai", shanghaiDocs);
    index.buildPartition(GLOBAL_PARTITION, globalDocs);

    const hits = index.search("火锅", "chengdu", 5);
    const ids = hits.map((h) => h.id);

    expect(ids).toContain("cd1");
    expect(ids).not.toContain("sh1");
  });

  it("scopedSize counts only relevant built partitions", () => {
    const index = new CityPartitionedVectorIndex();
    index.buildPartition("chengdu", chengduDocs);
    index.buildPartition(GLOBAL_PARTITION, globalDocs);

    expect(index.scopedSize("chengdu")).toBe(3);
    expect(index.scopedSize(undefined)).toBe(1);
    expect(index.totalBuiltSize()).toBe(3);
  });

  it("invalidate removes partition until rebuilt", () => {
    const index = new CityPartitionedVectorIndex();
    index.buildPartition("chengdu", chengduDocs);
    expect(index.hasPartition("chengdu")).toBe(true);

    index.invalidate("chengdu");
    expect(index.hasPartition("chengdu")).toBe(false);
    expect(index.search("火锅", "chengdu", 5)).toEqual([]);
  });
});
