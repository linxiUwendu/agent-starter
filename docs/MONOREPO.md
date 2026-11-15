# Monorepo 说明

包管理：**pnpm 10.x**，版本由 **Corepack + `packageManager`** 钉扎（当前 **`pnpm@10.34.9`**，见根 `package.json`）。

```bash
corepack enable
corepack install   # 读取 packageManager，与本仓库一致
pnpm -v
```

- **升级 pnpm**：只改 `packageManager` 与 `engines.pnpm`，再 `corepack install`，全仓库 `pnpm install`，提交锁文件。
- **CI**：`corepack enable` + `pnpm/action-setup` 的 `package_json: true`（与本地同一来源）。
- **Docker**：`corepack enable && corepack install`（构建阶段已 COPY `package.json`）。
- 其它 pnpm 选项在 `pnpm-workspace.yaml`（勿写在 `package.json` 的 `pnpm` 块），见 [pnpm settings](https://pnpm.io/settings)。

## 布局（apps / packages）

```
agent-starter/
├── apps/
│   ├── backend/        # NestJS + Jest（单元 / Supertest 集成）
│   └── frontend/       # Vue 3 + Vite
├── packages/
│   ├── shared/         # @agent-starter/shared 类型
│   ├── data/           # @agent-starter/data — 预置 travel.db
│   └── e2e/            # Playwright 端到端
├── scripts/            # postinstall、wait-for-backend 等根级脚本
├── docs/
└── turbo.json
```

| 路径 | 说明 |
|------|------|
| `packages/shared` | 共享类型；`^build` 拓扑下 apps 先依赖其 `dist` |
| `packages/data` | 提交的 `travel.db`；种子 TS 仍在 `apps/backend/scripts/seed-data` |
| `packages/e2e` | `pnpm test:e2e` → `pnpm --filter e2e test:e2e`（不进 `turbo run test`） |
| `apps/backend` | NestJS API、Swagger `/api/docs` |
| `apps/frontend` | Vue 3；Vite alias → `packages/shared/src` |

仓库根路径（`packages/data/travel.db`、`.env`、前端静态）由 `apps/backend/src/common/repo-root.ts` 向上查找 `agent-starter` 根 `package.json` 解析。

### 根目录还适合下沉到 `packages/` 吗？

| 项 | 建议 |
|----|------|
| `scripts/`（ensure-sqlite3、wait-for-backend） | **可留根目录**；体小且只为 workspace 服务。若要统一可建 `packages/tooling`（非必须） |
| `docs/` | **留根目录**（与 README、开源习惯一致） |
| Jest / Supertest | **留在 `apps/backend`**（与实现同仓，行业惯例）；不要与 Playwright 混到同一 packages |
| `eslint.config.mjs` / `turbo.json` | **留根**（编排入口） |
| 种子数据 TS | 暂留 `apps/backend/scripts`；若要多 app 复用可再抽 `packages/seed-data` |

### `shared` 里已有 / 新增 / 不宜共享

| 类别 | 位置 | 说明 |
|------|------|------|
| 旅游领域 + RAG 上下文 | `shared/travel.ts`, `rag.ts`, `chat.ts` | 原有 |
| 鉴权 API JSON | `shared/auth.ts` | **新增** `AuthUser`、`AuthConfig`、`UserMemoryContent` |
| SSE 聊天 | `shared/travel-chat.ts` | **新增** `TravelChatPhase`、`TravelChatDonePayload` |
| 不宜进 shared | 后端 only | `JwtPayload`、class-validator DTO、DB Row 类型、`AgentToolCall` / registry 内部类型 |

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
| **HTTP 集成** | Jest + Supertest + `Test.createTestingModule` | 真实 `AppModule`、`packages/data/travel.db`；如 `travel.http.spec.ts` |
| **E2E** | Playwright | `packages/e2e`；根 `pnpm run test:e2e` |

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
