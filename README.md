# agent-starter

基于 **NestJS + Vue 3** 的 AI 旅游助手 monorepo：结构化 POI 检索 + RAG 知识库增强，SSE 流式对话，支持 **Mock 模式**（无需 cursor-agent 即可完整演示）。

## 项目亮点（面试向）

| 亮点 | 说明 |
|------|------|
| **双轨检索** | POI 工具链（SQL 结构化）+ RAG 文档检索（攻略长文本）并行，合并注入 prompt |
| **SSE 流式** | 自研 `createSseSession`：心跳保活、delta 增量、TCP_NODELAY 防缓冲 |
| **RAG 实践** | SQLite 分块 + LIKE + **按城市分区 TF-IDF 向量**混合检索（RRF 融合），支持多城市 lazy 索引 |
| **可演示** | `MOCK_AGENT=true` + Docker Compose 一键启动 |
| **工程化** | Jest 单测 + Playwright E2E + GitHub Actions CI + Render 部署 |

更详细的 RAG 说明见 [docs/RAG.md](docs/RAG.md)，部署见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 快速开始

```bash
yarn install
cp .env.example .env   # 默认 MOCK_AGENT=true，开箱可跑
# data/travel.db 已预置；缺失时运行 npm run db:init

yarn dev       # 后端 :3300，前端 :5173
yarn test      # 单元测试
yarn test:e2e  # Playwright E2E
yarn build
yarn start

# Docker 一键启动（Mock 模式，适合 demo / 部署）
yarn docker:up
```

### Docker / 在线 Demo

```bash
docker compose up --build   # 或 yarn docker:up
# 访问 http://localhost:3000
```

部署到 Render：见 [docs/DEPLOY.md](docs/DEPLOY.md)（含 `render.yaml` Blueprint）。

### 两种运行模式

| 模式 | 配置 | 适用场景 |
|------|------|----------|
| **Mock（推荐 demo）** | `MOCK_AGENT=true` | 面试演示、CI、无 Cursor CLI |
| **真实 Agent** | `MOCK_AGENT=false` + `cursor-agent login` 或 API Key | 完整 AI 体验 |

真实 Agent 认证（二选一）：

```bash
cursor-agent login
# 或在 .env 中设置 CURSOR_USE_API_KEY=true 和有效的 CURSOR_API_KEY
```

## 项目结构

```
agent-starter/
├── backend/          # NestJS API、SSE 流、SQLite、RAG、Agent 集成
├── frontend/         # Vue 3 三栏 UI（聊天 | 地图 | 行程/美食/知识库）
├── data/travel.db    # 预置 SQLite（POI + 知识库，运行时只读打开）
├── docs/RAG.md       # RAG 详细说明
└── .env              # MOCK_AGENT、端口、认证等
```

## 数据库结构（SQLite）

预置库路径：`data/travel.db`。Schema 定义见 [`backend/src/travel/database/schema.ts`](backend/src/travel/database/schema.ts)。

### 领域划分

| 领域 | 表 | 用途 |
|------|-----|------|
| **POI** | `cities`、`pois`、`itineraries` | 结构化旅游数据（景点、美食、机位、参考行程） |
| **RAG** | `kb_documents`、`kb_chunks`、`kb_chunks_fts` | 攻略长文、分块检索、FTS5 全文索引 |
| **对话** | `conversations`、`conversation_messages` | 聊天会话与消息持久化 |

### ER 关系图

```mermaid
erDiagram
  cities ||--o{ pois : "拥有"
  cities ||--o{ itineraries : "拥有"
  cities ||--o{ kb_documents : "可选归属"
  cities ||--o{ conversations : "可选关联"

  pois ||--o{ pois : "parent_poi_id 机位挂靠"
  kb_documents ||--|{ kb_chunks : "1:N 切分"
  kb_chunks ||--|| kb_chunks_fts : "FTS 同步"
  conversations ||--|{ conversation_messages : "1:N 消息"

  cities {
    text id PK
    text name
    text province
    real center_lat
    real center_lng
    json highlights
  }

  pois {
    text id PK
    text city_id FK
    text category
    text parent_poi_id FK
    json capture_meta
    real lat
    real lng
  }

  itineraries {
    text id PK
    text city_id FK
    int days
    json schedule
  }

  kb_documents {
    text id PK
    text city_id FK
    text title
    text content
    text source
  }

  kb_chunks {
    text id PK
    text document_id FK
    text city_id FK
    int chunk_index
    text embedding
  }

  conversations {
    text id PK
    text city_id FK
    text title
  }

  conversation_messages {
    text id PK
    text conversation_id FK
    text role
    int sort_order
    json context_snapshot
  }
```

### 表说明

#### `cities` — 城市

| 字段 | 说明 |
|------|------|
| `id` | 城市 ID，如 `chengdu` |
| `name` / `province` | 显示名、省份 |
| `center_lat` / `center_lng` | 地图默认中心 |
| `highlights` | JSON 数组，城市亮点标签 |

#### `pois` — 统一 POI（含摄影机位）

| 字段 | 说明 |
|------|------|
| `category` | `attraction` / `food` / `hotel` / `photo` |
| `tags` | JSON 标签数组 |
| `lat` / `lng` | 坐标（地图 marker） |
| `parent_poi_id` | 机位所属景点（`category='photo'` 时使用） |
| `capture_meta` | 机位 JSON：`{ angle, best_light, best_season }` |

> API 层仍将 `category='photo'` 映射为 `PhotoSpot` 类型；普通 POI 查询默认排除机位。

#### `itineraries` — 参考行程

| 字段 | 说明 |
|------|------|
| `title` / `days` / `summary` / `tags` | 行程标题、天数、简介、标签 |
| `schedule` | JSON 数组，每条含 `day`、`order`、`time`、`poi_id`、`note`、`duration_min` |

示例：

```json
[
  { "day": 1, "order": 1, "time": "10:00", "poi_id": "poi_chengdu_panda", "note": "看熊猫", "duration_min": 120 }
]
```

#### `kb_documents` — 攻略原文

| 字段 | 说明 |
|------|------|
| `city_id` | 所属城市；`NULL` 表示全国通用攻略 |
| `content` | 完整 Markdown 长文 |
| `source` | `seed` / `api` / `import` / `test` |
| `created_at` / `updated_at` | ISO 时间戳 |

#### `kb_chunks` — 检索块

| 字段 | 说明 |
|------|------|
| `document_id` | 所属文档 |
| `chunk_index` | 块序号（0, 1, 2…） |
| `content` | 约 380 字一块的正文 |
| `city_id` | 冗余字段，便于按城市分区向量检索 |
| `embedding` | 可选 OpenAI 向量（JSON 字符串） |

#### `kb_chunks_fts` — FTS5 虚拟表

与 `kb_chunks` 同步写入，供 LIKE + 向量均无结果时的全文兜底检索。

#### `conversations` / `conversation_messages` — 对话持久化

| 表 | 说明 |
|----|------|
| `conversations` | 会话头：`title`、`city_id`、时间戳 |
| `conversation_messages` | 消息：`role`（user/assistant）、`content`、`sort_order`；可选 `context_snapshot` 存该轮上下文快照 |

### 数据形成方式

| 表 | 初始数据（`npm run db:init`） | 运行时写入 |
|----|-------------------------------|------------|
| `cities` | seed-data.cities.ts | — |
| `pois` | seed（景点 + 美食 + 机位合一） | — |
| `itineraries` | seed（`schedule` JSON） | — |
| `kb_documents` | seed-data.kb.ts | `POST /api/travel/rag/documents` |
| `kb_chunks` / `kb_chunks_fts` | 文档写入时自动切分 | 随文档 API 同步 |
| `conversations` / `conversation_messages` | — | 聊天完成后 `appendExchange` |

维护流程：编辑 `backend/scripts/seed-data/` → `npm run db:init` → 提交新的 `data/travel.db`。

### 与 `TravelContext` 的映射

| Context 字段 | 数据来源 |
|--------------|----------|
| `pois` | `pois`（`category != 'photo'`，经工具 SQL 查询） |
| `photoSpots` | `pois`（`category = 'photo'`，映射为 PhotoSpot） |
| `itinerary` | `itineraries` + 解析 `schedule` + JOIN `pois` |
| `ragChunks` | 检索 `kb_chunks`（非表字段，运行时生成） |
| `ragMeta` | 检索过程统计（非表字段） |

当前预置规模（`db:init` 后）：**11 城 · 76 POI（含 11 机位）· 11 篇 KB 文档**。

## 代码流程图

### 1. 系统分层与模块依赖

```mermaid
graph TB
  subgraph Frontend["frontend/"]
    App[App.vue<br/>handleSubmit / SSE 消费]
    API_FE[api/travel.ts<br/>sendTravelChat / consumeTravelSse]
    Store[useTravelChat.ts<br/>状态：messages / context / city]
    UI[ChatPanel · MapPanel · ItineraryPanel]
    App --> API_FE
    App --> Store
    UI --> App
  end

  subgraph Backend["backend/"]
    TC[TravelController<br/>chat / conversations / rag]
    TS[TravelService<br/>streamTravelChat]
    TT[TravelToolsService<br/>buildContext / planToolCalls]
    RS[RagService<br/>retrieveWithMeta]
    PS[PoiService<br/>searchPoi / findItinerary]
    CS[ConversationService<br/>appendExchange]
    CA[CursorAgentService<br/>run / runMock]
    SSE[sse.util<br/>createSseSession]
    DB[(SQLite<br/>pois · kb_* · conversations)]
  end

  App -->|POST SSE| TC
  TC --> TS
  TS --> TT
  TS --> CA
  TS --> CS
  TS --> SSE
  TT --> PS
  TT --> RS
  PS --> DB
  RS --> DB
  CS --> DB
  SSE -->|delta/context/done| App
```

### 2. 旅游聊天完整时序（含核心函数）

```mermaid
sequenceDiagram
  autonumber
  participant U as 用户
  participant App as App.vue
  participant API as api/travel.ts
  participant TC as TravelController.chat
  participant TS as TravelService.streamTravelChat
  participant TT as TravelToolsService.buildContext
  participant PS as PoiService
  participant RS as RagService.retrieveWithMeta
  participant SSE as createSseSession
  participant CA as CursorAgentService.run
  participant CS as ConversationService.appendExchange

  U->>App: 输入消息，点击发送
  App->>App: detectAndApplyCity()
  App->>API: sendTravelChat(messages, city, conversationId)
  API->>TC: POST /api/travel/chat
  TC->>TS: streamTravelChat(messages, res, city, conversationId)

  TS->>TT: buildContext(messages, cityHint)
  TT->>TT: resolveCityFromConversation()
  TT->>TT: planToolCalls(message, city)
  loop 每个工具
    TT->>TT: executeTool(name, args)
    TT->>PS: searchPoi / findItinerary / ...
    PS-->>TT: POI / 行程 / 机位
  end
  TT->>RS: retrieveWithMeta(message, city, 5)
  RS-->>TT: { chunks, meta }
  TT-->>TS: TravelContext

  TS->>TS: buildTravelPrompt(messages, context)
  TS->>SSE: createSseSession(res)
  SSE-->>App: event: start
  SSE-->>App: event: context (pois, ragChunks, ragMeta)

  TS->>CA: run(prompt, pushDelta)
  alt MOCK_AGENT=true
    CA->>CA: runMock → generateMockAnswer()
  else 真实 Agent
    CA->>CA: spawn cursor-agent → computeStreamDelta()
  end
  loop 流式
    CA->>SSE: pushDelta(text)
    SSE-->>App: event: delta
  end

  TS->>CS: appendExchange(conversationId, user, answer, city)
  TS->>SSE: finish(done, { answer, context, conversationId })
  SSE-->>App: event: done
  App->>App: setContext() / appendMessage()
```

### 3. buildContext 检索编排

```mermaid
flowchart TD
  A[buildContext messages, cityHint] --> B[resolveCityFromConversation]
  B --> C[取最后一条 user 消息]
  C --> D[planToolCalls 关键词规划]
  D --> E{意图识别}
  E -->|美食| F[recommend_food + get_itinerary]
  E -->|拍照| G[get_photo_spots]
  E -->|行程| H[get_itinerary]
  E --> I[search_poi 兜底]
  F --> J[executeTool → PoiService SQL]
  G --> J
  H --> J
  I --> J
  J --> K[合并 pois / photoSpots / itinerary]
  C --> L[RagService.retrieveWithMeta]
  L --> M[LIKE + 分区向量 + FTS → RRF]
  M --> N[reciprocalRankFusion 融合]
  K --> O[TravelContext]
  N --> O
  O --> P[formatContextForPrompt → 注入 LLM prompt]
```

### 4. RAG 混合检索流程（按城市分区优化）

```mermaid
flowchart TD
  Q[用户消息 + cityHint] --> T[extractSearchTerms 分词]
  T --> L[searchLike<br/>SQL LIKE + city 过滤]
  T --> EP[ensureSearchPartitions<br/>lazy build city + global]
  EP --> V[CityPartitionedVectorIndex.search<br/>只扫该城 + __global__ 分区]
  L --> R[reciprocalRankFusion 多路排名融合]
  V --> R
  L -->|两路均无结果| F[searchFts FTS5 兜底]
  F --> R
  R --> TOP[Top-N RagChunk]
  TOP --> META[ragMeta<br/>scope/total chunks · 耗时 · 方法]
  TOP --> P[formatContextForPrompt<br/>参考文档摘录]
```

**分区向量索引生命周期：**

```mermaid
flowchart LR
  Boot[onModuleInit] --> G[预热 __global__ 分区]
  Query[首次检索某城市] --> LB[lazy build 该 city 分区]
  Upsert[POST/DELETE 文档] --> INV[invalidate city + global]
  INV --> RB[增量 rebuild 受影响分区]
  LB --> Mem[(内存 Map&lt;city, VectorIndex&gt;)]
  RB --> Mem
  G --> Mem
```

### 5. SSE 流式协议

```mermaid
stateDiagram-v2
  [*] --> initSse: createSseSession
  initSse --> streaming: send(start)
  streaming --> streaming: send(context)
  streaming --> streaming: pushDelta → send(delta)
  streaming --> streaming: : ping 心跳
  streaming --> done: finish(done)
  streaming --> error: finish(error)
  done --> [*]: res.end()
  error --> [*]: res.end()
```

### 6. 前端交互流程

```mermaid
flowchart TD
  Mount[onMounted] --> LoadCities[fetchCities]
  LoadCities --> LoadConv[fetchConversations]
  Submit[handleSubmit] --> Detect[detectAndApplyCity]
  Detect --> Send[sendTravelChat]
  Send --> SSE[consumeTravelSse]
  SSE --> Ctx[onContext → setContext]
  SSE --> Delta[onDelta → streamingContent]
  SSE --> Done[onDone → appendMessage + conversationId]
  Ctx --> Map[MapPanel 渲染 marker]
  Ctx --> Rag[ItineraryPanel 知识库命中]
  NewChat[新对话] --> Create[createConversation]
  SelectConv[选择历史] --> Fetch[fetchConversation → loadConversationMessages]
```

### 7. 对话持久化

```mermaid
sequenceDiagram
  participant TS as TravelService
  participant CS as ConversationService
  participant DB as SQLite

  TS->>CS: appendExchange(conversationId?, user, answer, city)
  alt 无 conversationId
    CS->>DB: INSERT conversations
  end
  CS->>DB: INSERT conversation_messages (user)
  CS->>DB: INSERT conversation_messages (assistant)
  CS->>DB: UPDATE conversations.updated_at
  CS-->>TS: conversationId
  TS-->>前端: done.conversationId
```

### 8. 核心函数索引

| 层级 | 函数 | 文件 | 职责 |
|------|------|------|------|
| 前端 | `handleSubmit` | `App.vue` | 发消息、消费 SSE、更新 UI |
| 前端 | `consumeTravelSse` | `api/travel.ts` | 解析 SSE 事件流 |
| 前端 | `buildContext` 消费 | `useTravelChat.setContext` | 同步地图/行程/知识库状态 |
| 控制器 | `TravelController.chat` | `travel.controller.ts` | 校验 DTO，委托 `streamTravelChat` |
| 服务 | `streamTravelChat` | `travel.service.ts` | 编排检索 → prompt → Agent → 持久化 |
| 服务 | `buildContext` | `travel-tools.service.ts` | POI 工具链 + RAG 双轨检索 |
| 服务 | `planToolCalls` | `travel-tools.service.ts` | 正则意图 → 工具调用计划 |
| 服务 | `retrieveWithMeta` | `rag.service.ts` | LIKE + 分区 TF-IDF 向量 + FTS + RRF |
| 服务 | `CityPartitionedVectorIndex` | `city-partitioned-vector-index.ts` | 按 city 分区 lazy build / 增量 rebuild |
| 服务 | `run` | `cursor-agent.service.ts` | Mock 或 spawn cursor-agent |
| 工具 | `createSseSession` | `sse.util.ts` | SSE 会话：心跳 + delta + 结束 |
| 工具 | `init-travel-db` | `backend/scripts/init-travel-db.ts` | 从 seed-data 重新生成 travel.db（维护工具） |
| 工具 | `indexDocumentChunks` | `kb-index.util.ts` | 文档分块 + FTS 索引 |
| 持久化 | `appendExchange` | `conversation.service.ts` | 保存一轮 user/assistant |

## 整体架构

```mermaid
graph LR
  subgraph Frontend["frontend (Vue 3 + Vite)"]
    Chat[ChatPanel / MessageList]
    Map[MapPanel / Leaflet]
    Side[ItineraryPanel / 知识库]
  end

  subgraph Backend["backend (NestJS)"]
    API[TravelController]
    SSE[createSseSession]
    Agent[CursorAgentService]
    Tools[TravelToolsService]
    RAG[RagService]
    DB[(SQLite POI + kb_*)]
  end

  CLI[cursor-agent CLI]
  Mock[Mock Agent]

  Chat -->|POST SSE| API
  API --> Tools --> DB
  Tools --> RAG --> DB
  API --> SSE
  API --> Agent
  Agent -->|MOCK_AGENT=false| CLI
  Agent -->|MOCK_AGENT=true| Mock
  SSE -->|delta / context| Chat
```

## 旅游聊天请求流（简版）

```mermaid
sequenceDiagram
  participant FE as 前端
  participant TS as TravelService
  participant TT as TravelToolsService
  participant RAG as RagService
  participant Agent as Agent

  FE->>TS: POST /api/travel/chat
  TS->>TT: buildContext()
  TT->>TT: planToolCalls → POI SQL
  TT->>RAG: retrieveWithMeta(message, city)
  RAG-->>TT: ragChunks + ragMeta
  TT-->>TS: TravelContext
  TS->>FE: SSE context（pois + ragChunks）
  TS->>Agent: run(prompt)
  loop 流式
    Agent-->>FE: SSE delta
  end
  TS->>FE: SSE done（含 conversationId）
```

## 优化后的 RAG 流程

RAG 在本项目中的用法：**Retrieve → Augment prompt → Generate**。RAG 只负责检索与注入上下文，最终回答由 cursor-agent（或 Mock）基于完整 prompt 生成。

### 端到端时序

1. 用户发送消息 → `TravelToolsService.buildContext()` 解析城市（`resolveCityFromConversation`）
2. **并行双轨**：POI 工具链（结构化 SQL）+ `RagService.retrieveWithMeta(message, city, 5)`（攻略长文本）
3. 检索结果写入 `TravelContext.ragChunks`，经 `formatContextForPrompt()` 拼入 prompt 的「参考文档摘录（RAG）」段落
4. Agent 流式生成；SSE `context` 事件同时把 `ragChunks` + `ragMeta` 推给前端展示

### 混合检索（三路 + RRF 融合）

每条用户消息会走以下检索路径，最后用 **Reciprocal Rank Fusion（RRF）** 合并排名：

| 路径 | 实现 | 作用 |
|------|------|------|
| **LIKE** | `searchLike()` — SQL `LIKE '%关键词%'` + `city_id` 过滤 | 中文短问句精确命中（如「火锅」「熊猫」） |
| **向量** | `CityPartitionedVectorIndex` — 本地 TF-IDF + 余弦相似度 | 补充语义相近片段（如「微辣」↔「火锅起步」） |
| **FTS** | `searchFts()` — SQLite FTS5 + BM25 | 仅当 LIKE + 向量均无结果时兜底 |

```
用户消息
  → extractSearchTerms()           # 中文 n-gram + 英文词
  → searchLike()                   # SQL 按 city 过滤
  → ensureSearchPartitions()       # lazy build 目标分区
  → CityPartitionedVectorIndex     # 只扫 city + __global__
  → searchFts()                    # 兜底（可选）
  → reciprocalRankFusion()         # 多路排名融合
  → Top-N RagChunk + ragMeta
```

### 多城市优化：按城市分区向量索引

旧设计将全国 chunk 载入单个 `VectorIndex`，城市增多时内存、CPU、写入 rebuild 都会线性恶化。优化后采用 **`CityPartitionedVectorIndex`**：

| 机制 | 说明 |
|------|------|
| **分区** | 每个 `city_id` 独立 TF-IDF 索引 + `__global__` 通用攻略分区 |
| **Lazy build** | 启动只预热 global；首次检索某城市时再 build 该分区 |
| **增量失效** | 文档 upsert/delete 只 rebuild 受影响城市 + global，不再全量重建 |
| **检索范围** | 单次向量扫描 ≈ O(该城 chunk + global chunk)，与全国城市总数解耦 |

OpenAI embedding 调试路径（`?provider=openai`）在 SQL 层按 city 过滤并 `LIMIT 300`，同样避免全国向量扫描。

### 数据层（预置 DB）

完整表结构与 ER 图见上文 [数据库结构](#数据库结构sqlite) 一节。

| 阶段 | 行为 |
|------|------|
| **仓库** | `data/travel.db` 已包含 11 城 POI + 知识库，提交到 Git |
| **启动** | `DatabaseService` 只打开 DB，**不建表、不灌数据** |
| **维护** | 改 `backend/scripts/seed-data/` → `npm run db:init` → 提交新 db |
| **文档 API** | `POST /api/travel/rag/documents` → 分块 + 增量 rebuild 向量分区 |
| **删除** | `DELETE .../documents/:id` → 删除 chunk + FTS → 增量 rebuild 分区 |

### ragMeta 可观测字段

SSE `context` 中的 `ragMeta` 便于调试与面试演示：

| 字段 | 含义 |
|------|------|
| `durationMs` | 检索耗时 |
| `methods` | 实际命中的路径（`like` / `vector` / `fts` / `hybrid`） |
| `vectorIndexSize` | 本次扫描的分区 chunk 数（city + global） |
| `totalChunks` | 全库 chunk 总数 |
| `vectorPartitions` | 内存中已构建的分区数 |
| `tokenEstimate` | 注入 prompt 的 token 估算 |

日志示例：`scope=12/8500` 表示只扫描 12 个 chunk，全库共 8500 个。

### 与 POI 检索的分工

| 维度 | POI 工具链 | RAG |
|------|-----------|-----|
| 数据形态 | 结构化（名称、坐标、评分） | 非结构化长文本（攻略、避坑） |
| 触发方式 | `planToolCalls` 正则意图规划 | 每条消息自动检索 |
| 典型内容 | 景点列表、行程表、机位 | 「火锅怎么选」「熊猫几点去」 |
| 注入位置 | `### POI 列表` / `### 参考行程` | `### 参考文档摘录（RAG）` |

更详细的 API、Prompt 示例与扩展指南见 [docs/RAG.md](docs/RAG.md)。

## SSE 事件协议

| 事件 | 发送方 | 用途 |
|------|--------|------|
| `start` | Chat / Travel | 流已开始 |
| `context` | Travel only | POI、机位、行程、**ragChunks** |
| `delta` | Chat / Travel | AI 增量文本 `{ text }` |
| `done` | Chat / Travel | 完成 `{ answer, context? }` |
| `error` | Chat | 失败 `{ error }` |
| `: ping` | createSseSession | 8s 心跳保活 |

## API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | Agent 健康（含 `mockAgent`） |
| POST | `/api/chat` | 通用聊天 SSE |
| GET | `/api/travel/health` | 旅游模块 + RAG 统计 |
| GET | `/api/travel/cities` | 城市列表 |
| GET | `/api/travel/rag/documents` | 知识库文档列表 |
| POST | `/api/travel/chat` | 旅游聊天 SSE（POI + RAG） |
| GET | `/api/travel/conversations` | 对话列表 |
| POST | `/api/travel/conversations` | 创建对话 |
| GET | `/api/travel/conversations/:id` | 对话详情 + 消息 |
| DELETE | `/api/travel/conversations/:id` | 删除对话 |
| POST | `/api/travel/rag/documents` | 创建/更新知识库文档并 reindex |
| DELETE | `/api/travel/rag/documents/:id` | 删除知识库文档 |

## 第三阶段能力

| 能力 | 说明 |
|------|------|
| **对话持久化** | SQLite `conversations` / `conversation_messages`，聊天完成后自动保存 |
| **知识库管理** | POST/DELETE 文档 API + 前端「添加文档」表单，自动分块索引 |
| **E2E 测试** | Playwright：发消息 → 地图 marker → 知识库命中 |

## 配置项（`.env`）

| 变量 | 默认 | 说明 |
|------|------|------|
| `MOCK_AGENT` | false（example 为 true） | true = 不调 cursor-agent，演示模式 |
| `RAG_EMBEDDING_PROVIDER` | tfidf | 本地向量；`openai` 需 API Key + 回填 embedding |
| `OPENAI_API_KEY` | — | OpenAI embedding（可选） |
| `PORT` | 3000 | 监听端口 |
| `HOST` | 127.0.0.1 | 监听地址 |
| `CURSOR_AGENT_COMMAND` | cursor-agent | CLI 命令 |
| `CURSOR_USE_API_KEY` | false | 是否使用 API Key |
| `CURSOR_API_KEY` | — | API Key |
| `CURSOR_TIMEOUT_MS` | 300000 | 总超时 |
| `CURSOR_STALL_MS` | 45000 | 无输出超时 |
| `TRAVEL_DB_PATH` | data/travel.db | SQLite 路径 |

## 测试

```bash
yarn test       # Jest 单元测试
yarn test:e2e   # Playwright E2E（自动 build + 启动 Mock 服务）
```

CI：`.github/workflows/ci.yml`（unit test + build + E2E）。

## 技术决策（面试可讲）

- **SSE vs WebSocket**：单向 AI 流足够，SSE 更简单、易过 HTTP 代理
- **LIKE 优先于 FTS**：中文短问句在 SQLite FTS 分词不稳定
- **预置 SQLite**：POI/KB 数据在 `data/travel.db`，启动只连接不灌库；种子 TS 仅作维护脚本输入
- **向量按城市分区**：lazy build + 增量 rebuild，避免全国 chunk 全量扫描
- **Mock 在 Agent 层**：POI/RAG 仍真实，保证 demo 与生产路径一致
- **Agent 失败兜底**：`TravelService.buildFallbackAnswer` 仍可用本地 Markdown 回复

## 扩展指南

1. **新增城市/POI**：编辑 `backend/scripts/seed-data/seed-data.cities.ts` → `npm run db:init` → 提交 `data/travel.db`
2. **新增 RAG 文档**：编辑 `backend/scripts/seed-data/seed-data.kb.ts` 后同上；或通过 `POST /api/travel/rag/documents` 运行时写入
3. **换 LLM**：替换 `CursorAgentService.run`，SSE 层无需改动

更详细的后端目录说明见 [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md)。核心函数均含中文 JSDoc，可直接在 IDE 中 hover 查看。
