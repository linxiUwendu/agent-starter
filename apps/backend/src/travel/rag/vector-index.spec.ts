import { VectorIndex } from "./vector-index";

describe("VectorIndex", () => {
  const docs = [
    { id: "c1", content: "成都火锅分牛油红锅与清油锅，初来建议微辣起步。", cityId: "chengdu" },
    { id: "c2", content: "上海外滩夜景亮灯约 18:00-22:00，地铁 2 号线较拥挤。", cityId: "shanghai" },
    { id: "c3", content: "大熊猫基地早上 7:30-9:30 活动最频繁。", cityId: "chengdu" },
  ];

  it("ranks relevant content higher", () => {
    const index = new VectorIndex();
    index.build(docs);

    const hits = index.searchUnscoped("成都火锅微辣", 2);
    expect(hits[0]?.id).toBe("c1");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("returns empty when index is empty", () => {
    const index = new VectorIndex();
    expect(index.searchUnscoped("外滩夜景", 5)).toEqual([]);
  });
});
