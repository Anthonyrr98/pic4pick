# Fly.io 部署完整指南

> 原始文档来源：`server/FLYIO_DEPLOY.md`（详版）与 `FLYIO_QUICK_START.md`（快版）

## 🚀 快速部署（快版）

### 1. 安装 Fly CLI

**Windows (PowerShell)**:
```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

**macOS/Linux**:
```bash
curl -L https://fly.io/install.sh | sh
```

### 2. 登录

```bash
fly auth login
```

### 3. 初始化项目

```bash
cd server
fly launch
```

按提示输入：
- App Name: `pic4pick-backend`（或自定义）
- Region: 建议 `hkg`（香港）
- Postgres/Redis: 选择 `n`
- Deploy now: 选择 `n`（先配环境变量）

### 4. 设置环境变量

```bash
fly secrets set PORT=3002
fly secrets set NODE_ENV=production
fly secrets set CORS_ORIGIN=https://pic.rlzhao.com
fly secrets set ALIYUN_OSS_REGION=cn-beijing
fly secrets set ALIYUN_OSS_BUCKET=pic4pick
fly secrets set ALIYUN_OSS_ACCESS_KEY_ID=你的AccessKey ID
fly secrets set ALIYUN_OSS_ACCESS_KEY_SECRET=你的AccessKey Secret
```

### 5. 部署

```bash
fly deploy
```

### 6. 测试

访问：`https://your-app-name.fly.dev/api/health`  
应该返回：`{"status":"ok"}`

---

## Fly.io 简介

Fly.io 是一个全球边缘部署平台，将应用部署到全球多个数据中心，访问速度快。

**优点**：
- ✅ 免费额度充足（3个共享CPU，160GB流量/月）
- ✅ 全球边缘部署（速度快）
- ✅ 无休眠，持续运行
- ✅ 自动 HTTPS
- ✅ 功能强大

**缺点**：
- ⚠️ 需要 CLI 工具（相对复杂）
- ⚠️ 配置步骤较多

---

## 部署步骤（详版）

### 第一步：安装 Fly CLI

（同上略）

### 第二步：登录 Fly.io

```bash
fly auth login
```

### 第三步：初始化项目

```bash
cd server
fly launch
```

建议：
- Region 选 `hkg`
- Postgres/Redis 选 `n`
- Deploy now 选 `n`

### 第四步：配置环境变量

Fly.io 使用 `fly secrets set`：

```bash
fly secrets set PORT=3002
fly secrets set NODE_ENV=production
fly secrets set CORS_ORIGIN=https://pic.rlzhao.com
fly secrets set ALIYUN_OSS_REGION=cn-beijing
fly secrets set ALIYUN_OSS_BUCKET=pic4pick
fly secrets set ALIYUN_OSS_ACCESS_KEY_ID=你的AccessKey ID
fly secrets set ALIYUN_OSS_ACCESS_KEY_SECRET=你的AccessKey Secret
```

⚠️ **重要提示**：
- `CORS_ORIGIN` 替换为你的前端域名
- OSS 配置替换为真实值

### 第五步：检查 `fly.toml`

Fly.io 会生成 `server/fly.toml`。重点检查：

- `internal_port = 3002`
- `auto_stop_machines = false`（避免休眠）
- `min_machines_running = 1`

### 第六步：部署应用

```bash
fly deploy
```

### 第七步：获取后端 URL

- 应用 URL：`https://your-app-name.fly.dev`
- OSS 上传：`https://your-app-name.fly.dev/api/upload/oss`
- 健康检查：`https://your-app-name.fly.dev/api/health`

### 第八步：测试与日志

```bash
fly logs
```

---

## 配置前端连接后端

### 方式 1：管理面板

管理面板 → 配置 → 阿里云 OSS 后端配置：
`https://your-app-name.fly.dev/api/upload/oss`

### 方式 2：浏览器控制台

```javascript
localStorage.setItem('aliyun_oss_backend_url', 'https://your-app-name.fly.dev/api/upload/oss');
location.reload();
```

---

## 常用命令

```bash
fly status
fly logs
fly secrets list
fly apps restart your-app-name
```


