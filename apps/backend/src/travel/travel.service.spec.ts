import { ConversationRepository } from "./database/repositories/conversation.repository";
import { TravelService } from "./travel.service";
import { createTestDatabase } from "../test/test-db";

describe("TravelService conversations", () => {
  let service: TravelService;
  let db: ReturnType<typeof createTestDatabase>;

  function seedUser(id: string) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, email, display_name, avatar_url, google_sub, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, `${id}@example.com`, "Test", null, `google_${id}`, now, now);
    db.prepare("INSERT INTO user_memory (user_id, content_md, updated_at) VALUES (?, ?, ?)").run(id, "", now);
  }

  beforeEach(() => {
    db = createTestDatabase();
    const conversations = new ConversationRepository({ connection: db } as never);
    const auth = {
      getMemoryMarkdown: jest.fn().mockReturnValue(""),
      updateMemoryFromUserMessage: jest.fn(),
    };
    service = new TravelService(
      {} as never,
      {} as never,
      { listCities: jest.fn().mockReturnValue([]) } as never,
      {} as never,
      conversations,
      auth as never,
      { get: jest.fn(() => undefined) } as never,
    );
  });

  afterEach(() => {
    db.close();
  });

  it("creates and lists conversations", () => {
    const userId = "user_test_1";
    seedUser(userId);
    const created = service.createConversation(userId, "chengdu", "成都美食");
    expect(created.id).toBeTruthy();
    const list = service.listConversations(userId);
    expect(list.some((c) => c.id === created.id)).toBe(true);
  });

  it("appends user and assistant messages via private exchange through chat persistence path", () => {
    const userId = "user_test_2";
    seedUser(userId);
    const id = service["appendExchange"](userId, undefined, "成都火锅", "推荐蜀大侠", "chengdu");
    const detail = service.getConversation(id, userId);
    expect(detail?.messages).toHaveLength(2);
    expect(detail?.messages[0]?.role).toBe("user");
    expect(detail?.messages[1]?.role).toBe("assistant");
  });

  it("deletes conversation", () => {
    const userId = "user_test_3";
    seedUser(userId);
    const created = service.createConversation(userId);
    expect(service.deleteConversation(created.id, userId)).toBe(true);
    expect(service.getConversation(created.id, userId)).toBeNull();
  });
});
