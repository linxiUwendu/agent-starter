# 部署指南

本项目已支持 **Docker 一键启动** 与 **Render 在线 Demo**（Mock 模式，无需 API Key）。

## Docker Compose（本地 / 服务器）

```bash
# 构建并启动（默认 MOCK_AGENT=true）
docker compose up --build

# 访问
open http://localhost:3000
```

数据持久化在 Docker volume `travel-data`，重启不丢库。

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `MOCK_AGENT` | true | 演示模式，不调 cursor-agent |
| `RAG_EMBEDDING_PROVIDER` | tfidf | 本地 TF-IDF 向量；可选 `openai` |
| `OPENAI_API_KEY` | — | 启用 OpenAI embedding 时必填 |
| `PORT` | 3000 | 对外端口 |

## Render 部署（免费 Demo）

1. Fork 本仓库到 GitHub
2. 登录 [Render](https://render.com) → New → Blueprint
3. 连接仓库，Render 会读取 `render.yaml`
4. 部署完成后访问 `https://<your-service>.onrender.com`

> Render 免费实例冷启动约 30–60 秒，适合面试作品集链接。

## Railway / Fly.io

均支持直接使用根目录 `Dockerfile`：

```bash
# Railway CLI 示例
railway up

# Fly.io 示例
fly launch --dockerfile Dockerfile
fly secrets set MOCK_AGENT=true
```

## OpenAI 向量检索（可选）

默认使用 **TF-IDF 本地向量**，无需外部服务。

启用 OpenAI embedding：

```bash
# .env
RAG_EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

回填 chunk embedding（需先 build）：

```bash
npm run build -w backend
npm run rag:embed
```

调试 OpenAI 检索：

```bash
curl -N -X POST http://localhost:3000/api/travel/chat -H "Content-Type: application/json" -d '{"city":"chengdu","messages":[{"role":"user","content":"成都火锅推荐"}]}'
```

## 健康检查

```bash
curl http://localhost:3000/api/travel/health
# 含 rag.vectorIndexSize、rag.embeddingProvider
```
