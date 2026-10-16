import { resolveKbDocumentCity } from "./travel.constants";

describe("resolveKbDocumentCity", () => {
  it("prefers city inferred from title/content over request cityId", () => {
    const result = resolveKbDocumentCity({
      cityId: "shanghai",
      title: "成都旅行攻略",
      content: "春熙路与大熊猫基地",
    });
    expect(result.cityId).toBe("chengdu");
    expect(result.warning).toMatch(/shanghai/);
  });

  it("uses request cityId when text has no city hint", () => {
    const result = resolveKbDocumentCity({
      cityId: "shanghai",
      title: "通用贴士",
      content: "出门记得带伞",
    });
    expect(result.cityId).toBe("shanghai");
    expect(result.warning).toBeUndefined();
  });

  it("returns null when no city in text and no cityId", () => {
    const result = resolveKbDocumentCity({
      title: "通用贴士",
      content: "出门记得带伞",
    });
    expect(result.cityId).toBeNull();
  });

  it("keeps locked cityId when admin selected city", () => {
    const result = resolveKbDocumentCity({
      cityId: "shanghai",
      cityIdLocked: true,
      title: "成都旅行攻略",
      content: "大熊猫与春熙路",
    });
    expect(result.cityId).toBe("shanghai");
    expect(result.warning).toBeUndefined();
  });
});
