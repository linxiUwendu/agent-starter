# `@agent-starter/shared`

前后端共用的 **类型与常量**（Chat、TravelContext、RAG 元数据、`KB_ADMIN_HEADER` 等）。

- 构建：`pnpm --filter @agent-starter/shared build`（输出 `dist/`）
- 模块：`constants`、`chat`、`rag`、`travel`、`auth`（鉴权 JSON）、`travel-chat`（SSE phase/done）
- Turbo：`apps/backend` / `apps/frontend`（workspace 名 `backend` / `frontend`）的 `build` / `lint` / `test` 依赖 `^build`，会先编本包

编辑 `src/*.ts` 后需重新 `build`；本地 `turbo run build` 会按依赖顺序执行。
