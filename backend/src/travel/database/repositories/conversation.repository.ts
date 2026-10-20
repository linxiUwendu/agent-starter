import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database.service";

type ConversationRow = {
  id: string;
  title: string;
  city_id: string | null;
  created_at: string;
  updated_at: string;
};

type ConversationSummaryRow = ConversationRow & { message_count: number };

type ConversationMessageRow = {
  role: string;
  content: string;
};

@Injectable()
export class ConversationRepository {
  constructor(private readonly database: DatabaseService) {}

  private get db() {
    return this.database.connection;
  }

  insertConversation(
    id: string,
    title: string,
    cityId: string | null,
    now: string,
    userId: string | null = null,
  ) {
    this.db
      .prepare(
        `
      INSERT INTO conversations (id, title, city_id, user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(id, title, cityId, userId, now, now);
  }

  updateCityAndTimestamp(id: string, cityId: string, now: string) {
    this.db
      .prepare("UPDATE conversations SET city_id = ?, updated_at = ? WHERE id = ?")
      .run(cityId, now, id);
  }

  touchUpdatedAt(id: string, now: string) {
    this.db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(now, id);
  }

  listSummaries(limit: number, userId: string): ConversationSummaryRow[] {
    return this.db
      .prepare(
        `
      SELECT c.id, c.title, c.city_id, c.created_at, c.updated_at,
             (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id) AS message_count
      FROM conversations c
      WHERE c.user_id = ?
      ORDER BY c.updated_at DESC
      LIMIT ?
    `,
      )
      .all(userId, limit) as ConversationSummaryRow[];
  }

  findById(id: string, userId?: string | null): ConversationRow | null {
    const row = this.db
      .prepare(
        userId
          ? "SELECT id, title, city_id, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?"
          : "SELECT id, title, city_id, created_at, updated_at FROM conversations WHERE id = ?",
      )
      .get(...(userId ? [id, userId] : [id])) as ConversationRow | undefined;
    return row ?? null;
  }

  findMessages(conversationId: string): ConversationMessageRow[] {
    return this.db
      .prepare(
        `
      SELECT role, content FROM conversation_messages
      WHERE conversation_id = ?
      ORDER BY sort_order ASC
    `,
      )
      .all(conversationId) as ConversationMessageRow[];
  }

  deleteById(id: string, userId: string): boolean {
    const result = this.db.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?").run(id, userId);
    return result.changes > 0;
  }

  nextMessageSortOrder(conversationId: string): number {
    const row = this.db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM conversation_messages WHERE conversation_id = ?",
      )
      .get(conversationId) as { max_order: number };
    return row.max_order + 1;
  }

  insertMessage(
    id: string,
    conversationId: string,
    role: string,
    content: string,
    sortOrder: number,
    createdAt: string,
  ) {
    this.db
      .prepare(
        `
      INSERT INTO conversation_messages (id, conversation_id, role, content, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(id, conversationId, role, content, sortOrder, createdAt);
  }
}
