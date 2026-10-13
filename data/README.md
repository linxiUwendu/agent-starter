# Travel SQLite Database

本目录包含预置的 **`travel.db`**，作为 POI 与 RAG 知识库的**唯一运行时数据源**。

| 文件 | 说明 |
|------|------|
| `travel.db` | 11 城 POI、行程、知识库分块（提交到 Git，启动时只读打开） |

## 修改数据

**运行时不会自动灌库。** 需要变更种子数据时：

1. 编辑 `backend/scripts/seed-data/` 下的 TS 文件
2. 执行 `npm run db:init` 重新生成 `travel.db`
3. 提交更新后的 `travel.db`

运行时仍可通过 API 增删知识库文档、持久化对话（写入同一 DB 文件）。
