import { expect, test } from "@playwright/test";

test.describe("AI Travel Assistant", () => {
  test("chat flow updates map markers and rag hits", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("map-panel")).toBeVisible();
    await expect(page.getByTestId("chat-input")).toBeVisible();

    await page.getByTestId("chat-input").fill("成都火锅推荐");
    await page.getByTestId("chat-submit").click();

    await expect(page.getByTestId("assistant-message").last()).toContainText(/成都|火锅|Mock/i, {
      timeout: 30_000,
    });

    await expect(page.getByTestId("map-marker-count")).not.toHaveText("0 标记", {
      timeout: 15_000,
    });

    await page.getByTestId("panel-tab-rag").click();
    await expect(page.getByTestId("rag-hits")).toBeVisible({ timeout: 10_000 });
  });

  test("creates and lists conversation", async ({ page, request }) => {
    const health = await request.get("/api/travel/health");
    expect(health.ok()).toBeTruthy();

    const created = await request.post("/api/travel/conversations", {
      data: { city: "chengdu", title: "E2E 测试" },
    });
    expect(created.ok()).toBeTruthy();
    const body = (await created.json()) as { id: string };
    expect(body.id).toBeTruthy();

    const list = await request.get("/api/travel/conversations");
    expect(list.ok()).toBeTruthy();
    const conversations = (await list.json()) as Array<{ id: string }>;
    expect(conversations.some((c) => c.id === body.id)).toBe(true);
  });

  test("upserts knowledge base document", async ({ request }) => {
    const res = await request.post("/api/travel/rag/documents", {
      data: {
        id: "kb_e2e_test",
        cityId: "chengdu",
        title: "E2E 火锅笔记",
        content: "成都火锅建议微辣起步，避开景区门口店。",
        tags: ["e2e"],
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { chunkCount: number };
    expect(body.chunkCount).toBeGreaterThan(0);

    const search = await request.get(
      "/api/travel/rag/search?q=火锅微辣&city=chengdu",
    );
    expect(search.ok()).toBeTruthy();
  });
});
