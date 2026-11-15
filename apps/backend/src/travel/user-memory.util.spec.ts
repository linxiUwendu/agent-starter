import { applyMemoryPatch, extractMemoryFactsFromText, parseMemoryMarkdown } from "./user-memory.util";

describe("user-memory.util", () => {
  it("extracts dietary and constraint facts", () => {
    const facts = extractMemoryFactsFromText("带老人去成都，不吃辣，预算中等");
    expect(facts.dietary).toContain("不吃辣 / 忌辣");
    expect(facts.constraints?.[0]).toMatch(/老人/);
    expect(facts.budget?.[0]).toMatch(/预算/);
    expect(facts.defaultCity?.[0]).toMatch(/chengdu/);
  });

  it("merges into markdown sections", () => {
    const next = applyMemoryPatch("", "西安美食，素食");
    expect(next).toContain("## 饮食偏好");
    expect(next).toContain("素食");
    const sections = parseMemoryMarkdown(next);
    expect(sections.dietary).toContain("素食");
  });
});
