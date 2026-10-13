import { ConversationRepository } from "./database/repositories/conversation.repository";
import { TravelService } from "./travel.service";
import { createTestDatabase } from "../test/test-db";

describe("TravelService conversations", () => {
  let service: TravelService;
  let db: ReturnType<typeof createTestDatabase>;

  beforeEach(() => {
    db = createTestDatabase();
    const conversations = new ConversationRepository({ connection: db } as never);
    service = new TravelService(
      {} as never,
      {} as never,
      { listCities: jest.fn().mockReturnValue([]) } as never,
      {} as never,
      conversations,
    );
  });

  afterEach(() => {
    db.close();
  });

  it("creates and lists conversations", () => {
    const created = service.createConversation("chengdu", "成都美食");
    expect(created.id).toBeTruthy();
    const list = service.listConversations();
    expect(list.some((c) => c.id === created.id)).toBe(true);
  });

  it("appends user and assistant messages via private exchange through chat persistence path", () => {
    const id = service["appendExchange"](undefined, "成都火锅", "推荐蜀大侠", "chengdu");
    const detail = service.getConversation(id);
    expect(detail?.messages).toHaveLength(2);
    expect(detail?.messages[0]?.role).toBe("user");
    expect(detail?.messages[1]?.role).toBe("assistant");
  });

  it("deletes conversation", () => {
    const created = service.createConversation();
    expect(service.deleteConversation(created.id)).toBe(true);
    expect(service.getConversation(created.id)).toBeNull();
  });
});
