# Monorepo 说明

包管理：**pnpm**（`pnpm-workspace.yaml` + 根目录 `packageManager` 字段；CI/Docker 使用 `pnpm install --frozen-lockfile`）。

## 布局

| 包 | 说明 |
|----|------|
| `packages/shared` | 共享类型 `@agent-starter/shared`，前后端从同一源码生成声明 |
| `backend` | NestJS API |
| `frontend` | Vue 3 + Vite（dev 时用 alias 指到 `packages/shared/src`） |
| 根目录 | Playwright E2E、`turbo.json`、`eslint.config.mjs` |

## 常用命令

```bash
pnpm run lint         # turbo run lint — shared → backend / frontend
pnpm run test         # turbo run test
pnpm run build        # turbo run build（先构建 shared）
pnpm exec turbo run lint test build --summarize   # 与 CI 一致
```

## Swagger

后端启动后：**http://127.0.0.1:3000/api/docs**（OpenAPI UI）。

## E2E、集成测试、单元测试

| 层级 | 工具 | 测什么 |
|------|------|--------|
| **单元** | Jest | util、RAG、service（mock 依赖） |
| **HTTP 集成** | Jest + Supertest + `Test.createTestingModule` | 真实 `AppModule`、`data/travel.db`；如 `travel.http.spec.ts`：health、401、dev-login+会话、SSE Content-Type |
| **E2E** | Playwright | 浏览器：地图、聊天、RAG 命中；根 `pnpm run test:e2e` |

「自觉」若指 **开发自测**：单元跑得快、集成验路由与 DB、E2E 验用户路径；CI 中建议 **lint + turbo(test+build) + e2e** 分层。

## 迁 PostgreSQL + 多实例

**为何**：SQLite 单写者、不宜多容器挂同一文件；水平扩 API 需 **客户端/服务器数据库**。

**步骤概要**：

1. 选托管 PG（RDS / Neon / Supabase）。
2. **Schema**：用 migration（Prisma / Drizzle / 手写 SQL）复刻 `schema.ts`；`json_valid` → `JSONB`；FTS5 → `tsvector` + GIN 或仍用应用内检索。
3. **连接**：`pg` 连接池；Nest `DatabaseModule` 改为注入 Pool；Repository SQL 方言少量调整（`?` → `$1` 等）。
4. **向量**：可选 **pgvector**，替换 TF-IDF 内存索引或并存。
5. **部署**：API **多副本** 连同一 `DATABASE_URL`；Cookie 会话无状态；静态资源 CDN / 对象存储可选。

## Turbo 本地缓存

- 缓存目录：**`.turbo`**（已 gitignore）。
- **命中条件**：同一 `inputs`（源码、配置）未变且 `outputs` 已有 → 跳过命令，显示 `cache hit`。
- **清空**：`rm -rf .turbo` 或 `pnpm exec turbo run build --force`。

## Turbo Remote Cache（Vercel）

1. 安装 [Turbo CLI](https://turbo.build/repo/docs/getting-started/installation)（项目已含 `turbo`）。
2. 登录 Vercel：`pnpm exec turbo login`（需 Vercel 账号）。
3. 仓库链接：`pnpm exec turbo link`（生成 `turbo.json` team / remote 配置，或设环境变量）。
4. CI（GitHub Actions）中设 **`TURBO_TOKEN`**、**`TURBO_TEAM`**，同一 commit 在不同 Runner 可 **复用远端缓存**。

文档：<https://turbo.build/repo/docs/core-concepts/remote-caching>
