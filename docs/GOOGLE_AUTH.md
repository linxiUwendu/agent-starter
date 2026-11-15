# Google 登录（团队共用 OAuth 客户端）

本项目使用 [Google Identity Services](https://developers.google.com/identity/gsi/web)（GIS）前端 One Tap / 按钮登录，**只需 Web 应用的 Client ID（公开）**，不需要 Client Secret。

## 推荐：全团队一个 OAuth 客户端

1. 由一名同学在 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 创建 **OAuth 2.0 客户端 ID**，类型选 **Web 应用**。
2. 在 **已授权的 JavaScript 来源** 中一次性加入团队会用到的来源（按需增删）：
   - `http://127.0.0.1:5173`（本地 Vite 前端）
   - `http://localhost:5173`
   - `http://127.0.0.1:3300`（仅当从后端端口直接打开前端静态资源时）
   - 生产域名，例如 `https://your-app.onrender.com`
3. 将得到的 Client ID 写入仓库 **可提交** 的配置文件（见下），全员 `git pull` 即可，**不必每人各自建客户端**，也**不必**在前端再配一份 ID。

### 仓库内配置（推荐）

```bash
cp config/google-oauth.team.json.example config/google-oauth.team.json
# 编辑 clientId 为团队 Web Client ID
```

`config/google-oauth.team.json` **只含公开 Client ID，可安全提交 Git**。后端启动时读取，并通过 `GET /api/auth/config` 下发给前端。

优先级：**`GOOGLE_CLIENT_ID` 环境变量** > **`config/google-oauth.team.json`** > 未配置（仅开发邮箱登录 / 游客）。

### 环境变量（可选覆盖）

适合部署平台注入 Secret，或本地临时覆盖团队文件：

| 变量 | 说明 |
|------|------|
| `GOOGLE_CLIENT_ID` | 覆盖团队 JSON，与 JSON 中应为**同一团队客户端** |
| `JWT_SECRET` | 会话签名，**勿提交**；生产必设 |
| `AUTH_ALLOW_DEV_LOGIN` | 演示邮箱登录；生产应 `false` 或不设 |
| `AUTH_GOOGLE_INSECURE_LOCAL_JWT` | 仅开发；国内无法连 `googleapis.com` 时的降级，生产勿开 |
| `HTTPS_PROXY` | `INSECURE=false` 时后端拉 JWKS 验签用；与本地代理 HTTP 端口一致（见下） |
| `AUTH_GOOGLE_VERIFY_TIMEOUT_MS` | JWKS 验签超时（毫秒），默认 `4000` |

复制根目录 `.env.example` 为 `.env` 时，**通常只需设 `JWT_SECRET`**；若已提交 `google-oauth.team.json`，可**不写** `GOOGLE_CLIENT_ID`。

**不要**再使用 `VITE_GOOGLE_CLIENT_ID`：前端只认后端 `/api/auth/config`，避免前后端双源不一致。

## 本地开发

```bash
pnpm dev   # 前端 :5173，后端 :3300（或见 vite 代理）
```

确保 Google Console 里已包含 `http://127.0.0.1:5173`。登录页加载后会请求 `/api/auth/config` 获取 Client ID。

无 Google 或 GIS 脚本加载失败时，可使用 **演示邮箱登录**（默认本地开启，见 `AUTH_ALLOW_DEV_LOGIN`）。

### 完整验签（`AUTH_GOOGLE_INSECURE_LOCAL_JWT=false`）

1. **浏览器**：能加载 `accounts.google.com`（GIS 脚本），通常需系统/浏览器代理与 VPN 一致。  
2. **后端**：验签会从 `https://www.googleapis.com/oauth2/v3/certs` 拉 JWKS。在根目录 `.env` 写入代理并**重启 backend**：

   ```env
   AUTH_GOOGLE_INSECURE_LOCAL_JWT=false
   HTTPS_PROXY=http://127.0.0.1:7890
   ```

   将 `7890` 改为你本机代理软件的 **HTTP 代理端口**（与浏览器里能访问 Google 的那套一致）。  
   自测：`curl -x http://127.0.0.1:7890 -sS -o /dev/null -w "%{http_code}\n" https://www.googleapis.com/oauth2/v3/certs` 应返回 `200`。

若登录报「无法访问 Google JWKS」，多半是未配 `HTTPS_PROXY`、端口错误，或 proxy 未启动。

## Docker / Render

- 镜像构建会复制 `config/`，若镜像内已有 `google-oauth.team.json`，Compose / Render **无需**再设 `GOOGLE_CLIENT_ID`。
- 生产务必设置 **`JWT_SECRET`**（Compose 可通过根目录 `.env` 注入；Render 在 Dashboard 配置）。
- 将 Render 公网 URL 加入 OAuth 客户端的 JavaScript 来源。

详见 [DEPLOY.md](./DEPLOY.md)。

## 安全说明

- Client ID 为公开标识，泄露风险低于 Secret；仍建议专用「教学 / 内部 demo」项目，勿与生产主业务混用同一客户端。
- **绝不**将 Client Secret、服务账号密钥或真实 `JWT_SECRET` 提交仓库。
