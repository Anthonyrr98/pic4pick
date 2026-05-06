# Fly.io 快速部署指南

## 🚀 快速步骤

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
- App Name: `pic4pick-backend`（或您喜欢的名称）
- Region: 选择区域（建议 `hkg` 香港）
- Postgres: `n`
- Redis: `n`
- Deploy now: `n`（先配置环境变量）

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

### 6. 获取 URL

部署完成后，记录您的 URL：
`https://your-app-name.fly.dev`

### 7. 测试

访问：`https://your-app-name.fly.dev/api/health`
应该返回：`{"status":"ok"}`

### 8. 配置前端

在管理面板 → 配置 → 阿里云 OSS 后端配置：
`https://your-app-name.fly.dev/api/upload/oss`

---

## ✅ 完成！

详细步骤请查看：[server/FLYIO_DEPLOY.md](./server/FLYIO_DEPLOY.md)

## 📝 常用命令

```bash
# 查看状态
fly status

# 查看日志
fly logs

# 查看环境变量
fly secrets list

# 重启应用
fly apps restart your-app-name
```

