# `@agent-starter/shared`

前后端共用的 **TypeScript 类型**（Chat、TravelContext、RAG 元数据等）。

- 构建：`pnpm --filter @agent-starter/shared build`（输出 `dist/`）
- Turbo：`backend` / `frontend` 的 `build` / `lint` / `test` 依赖 `^build`，会先编本包

编辑 `src/*.ts` 后需重新 `build`；本地 `turbo run build` 会按依赖顺序执行。
