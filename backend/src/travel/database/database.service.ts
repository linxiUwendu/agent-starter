import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import { readBootstrapStats } from "./sql-fragments";

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  private db!: Database.Database;

  constructor(private readonly config: ConfigService) {}

  private get dbPath() {
    const configured = this.config.get<string>("TRAVEL_DB_PATH");
    if (configured) return configured;
    return path.resolve(__dirname, "../../../../data/travel.db");
  }

  /**
   * @description 打开预置 SQLite 数据库；不在启动时建表或灌数据。
   */
  onModuleInit() {
    if (!fs.existsSync(this.dbPath)) {
      throw new Error(
        `Travel database not found at ${this.dbPath}. ` +
          `Run "npm run db:init" from the repo root to generate data/travel.db.`,
      );
    }

    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    const stats = readBootstrapStats(this.db);
    if (stats.cities === 0) {
      throw new Error(
        `Travel database at ${this.dbPath} has no cities. ` +
          `Run "npm run db:init" to rebuild from scripts/seed-data/.`,
      );
    }

    this.logger.log(
      `SQLite ready at ${this.dbPath} (${stats.cities} cities, ${stats.kbDocs} kb docs)`,
    );
  }

  get connection(): Database.Database {
    return this.db;
  }
}
