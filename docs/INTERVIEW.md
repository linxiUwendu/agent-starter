# 面试准备：简历写了就要能讲

本文档对应作品集「建议补」清单：**文档对齐、Demo 链接、E2E 与登录、架构口述**。按条准备即可在面试里讲清设计与取舍。

---

## 1. README 与代码对齐（Auth / 记忆 / 游客）

### 面试官可能问

- 登录怎么做？Token 放哪？
- 游客和登录用户能力差在哪？
- 「旅行记忆」存在哪、什么时候写？

### 标准答法（30～60 秒）

1. **Google GIS**：前端拿 ID Token，`POST /api/auth/google`，后端验签后写 **HttpOnly Cookie** `auth_token`（JWT），前端用 `credentials: 'include'` 调 `/api/auth/me`。
2. **开发兜底**：`AUTH_ALLOW_DEV_LOGIN` 非生产默认可用 `POST /api/auth/dev-login`（E2E/无 Google 环境）。
3. **游客**：`sessionStorage.travel_guest=1` 可进 `/app` 聊天；**会话 CRUD、记忆读写需登录**（`JwtAuthGuard`）。
4. **记忆**：SQLite `user_memory.content_md`（Markdown 字符串，不是 repo 里的文件）；聊天时 `TravelService.streamTravelChat` 对最后一条用户消息做 **规则抽取** → `applyMemoryPatch` → UPSERT；读记忆注入 `buildTravelPrompt`。
5. **为何不用 localStorage 存 JWT**：防 XSS 读 token；Cookie + SameSite=Lax。

### 关键文件（便于指给面试官）

| 主题 | 路径 |
|------|------|
| Cookie / 登录 API | `backend/src/auth/auth.controller.ts` |
| 记忆落库 | `backend/src/auth/auth.service.ts` → `updateMemoryFromUserMessage` |
| 规则抽取 | `backend/src/travel/user-memory.util.ts` |
| 聊天触发写入 | `backend/src/travel/travel.service.ts` → `streamTravelChat` |
| 前端守卫 | `frontend/src/router/index.ts`、`composables/useAuth.ts` |
| 顶栏账号 | `frontend/src/components/AppTopBar.vue` |

### 环境变量（口述）

- `GOOGLE_CLIENT_ID`、`JWT_SECRET`
- 国内开发：`AUTH_GOOGLE_INSECURE_LOCAL_JWT`（仅 dev 降级，生产必须 JWKS + 可选 `HTTPS_PROXY`）

---

## 2. 在线 Demo 链接

### 简历怎么写

- **有部署**：`Demo：https://xxx.onrender.com`（注明 Mock 模式、冷启动 30～60s）。
- **无公网**：写 `GitHub 仓库 + CI 通过 + 本地 docker compose up`，面试现场 **`MOCK_AGENT=true pnpm dev`** 演示。

### 部署要点（1 分钟）

- `docker compose up` 或 Render 读 `render.yaml`；镜像内 `MOCK_AGENT=true`，无需 Cursor CLI。
- 数据：Docker volume 持久化 `travel.db`；用户/记忆在运行时 migration 写入同一库。

### 演示脚本（建议练 3 分钟）

1. 打开 `/app` → 问「成都火锅不吃辣」→ 地图 marker + 右侧 RAG 命中。
2. （可选）登录 → 顶栏账号 → 再问带「记住」的话 → 说明记忆进 DB。
3. `/api/travel/health` 展示 `toolLoop`、`rag` stats。

详见 [DEPLOY.md](./DEPLOY.md)。

---

## 3. E2E 与登录

### 现状

- UI 流：`/` 重定向 → 游客或登录后进 `/app`，Mock 聊天 E2E 不依赖登录。
- **会话 API**：`GET/POST /api/travel/conversations` 需 **JwtAuthGuard**；E2E 在测会话前 **`POST /api/auth/dev-login`**（Playwright `request` 会带 Cookie）。

### 面试怎么说

「集成测试里聊天走游客 Optional JWT；测持久化会话时用 dev-login 拿 Cookie，和生产 Google 登录共用同一套 Cookie 鉴权。」

### 本地跑 E2E

```bash
pnpm run test:e2e
# webServer 已设 MOCK_AGENT=true、AUTH_ALLOW_DEV_LOGIN=true
```

---

## 4. 一张架构图熟练讲（3 分钟版）

### 路径（按顺序背）

```text
POST /api/travel/chat (SSE)
  → TravelService.streamTravelChat
      → [已登录] AuthService.updateMemoryFromUserMessage
      → TravelToolsService.runToolLoop
          → prefetchRagRetrieval（可选）
          → planToolCalls（rules 默认 / agent 可选）
          → executeTravelTool → PoiService / RagService
      → buildTravelPrompt（系统提示 + 记忆 + context +  transcript）
      → CursorAgentService.run / runMock
      → createSseSession：start / phase / context / delta / done
      → [已登录] appendExchange → conversations 表
```

### 和 README 图的关系

- 根 [README.md](../README.md) 里时序图若仍写 `buildContext`，口述时改成 **`runToolLoop`**（当前实现名）。
- 双轨：**SQL 结构化 POI** + **RAG 长文**；RRF 融合 FTS / 向量 / LIKE。

### 一张对比表（亮点）

| 能力 | 实现 |
|------|------|
| 检索 | POI 工具 + hybrid RAG（城市分区 TF-IDF + FTS5 + RRF） |
| 编排 | Tool Loop（registry + rules planner） |
| 输出 | SSE 流式 + Mock 可演示 |
| 用户 | Cookie JWT + Markdown 记忆 + 会话隔离 |

更细 RAG：[RAG.md](./RAG.md)。

---

## 5. 自检：五条必答（开卷前闭卷练）

1. 用户发「西安 2 天带娃不吃辣」— 从 HTTP 到回复经过哪些模块？
2. RRF 是什么、为何不只用一个检索通道？
3. 默认 `TRAVEL_TOOL_PLANNER=rules` 规划了哪些典型工具？
4. 登录用户记忆何时写入、如何进入 prompt？
5. 若上线多实例，SQLite 瓶颈是什么、你会先迁什么？

---

## 6. 简历 bullet 与文档索引

| 简历写法 | 对应文档/代码 |
|----------|----------------|
| RAG 混合检索 | [RAG.md](./RAG.md)、`rag-retrieval.ts` |
| Tool Loop | `travel-tools.service.ts`、`travel-tool.registry.ts` |
| SSE | `common/sse.util.ts` |
| Google 登录 + 记忆 | 本文 §1、`README.md` 账号小节 |
| **Monorepo + Turborepo** | 根 `turbo.json`、`pnpm run build/test`、CI `pnpm exec turbo` |
| CI/E2E | `.github/workflows/ci.yml`、`e2e/travel.spec.ts` |

### Turborepo + shared 口述（30 秒）

「pnpm workspace：`packages/shared`（`@agent-starter/shared`）+ backend + frontend；Turbo `dependsOn: ^build` 先 **tsc 出 shared 的 dist**，再编 Nest / Vite。根目录 ESLint + `pnpm run lint`；CI `pnpm install --frozen-lockfile` + `pnpm exec turbo run lint test build`。Remote Cache：Vercel + `TURBO_TOKEN` / `TURBO_TEAM`。详见 [MONOREPO.md](./MONOREPO.md)。」

---

## 7. 仍属「加分」、被问到再展开

- PostgreSQL 迁移：FTS5 → `tsvector` / 外挂；`user_memory` 表结构可平迁。
- 真 embedding：`RAG_EMBEDDING_PROVIDER=openai` + `rag:embed`。
- 限流、CSRF、生产 Google JWKS + 代理。

不要在简历里写没做的；可口述 roadmap。
