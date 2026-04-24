# Cyclic 部署完整指南

> 原始文档来源：`server/CYCLIC_DEPLOY.md`（详版）与 `CYCLIC_QUICK_START.md`（快版）

## 🚀 5 分钟快速部署（快版）

### 步骤 1：访问 Cyclic
打开 https://cyclic.sh，使用 GitHub 登录

### 步骤 2：创建应用
1. 点击 "New App"
2. 选择 "Deploy from GitHub"
3. 选择您的仓库

### 步骤 3：配置应用
- **Root Directory**: `server`
- **Start Command**: `npm start`

### 步骤 4：添加环境变量

在 Environment Variables 中添加：

```
PORT=3002
NODE_ENV=production
CORS_ORIGIN=https://pic.rlzhao.com
ALIYUN_OSS_REGION=cn-beijing
ALIYUN_OSS_BUCKET=pic4pick
ALIYUN_OSS_ACCESS_KEY_ID=你的AccessKey ID
ALIYUN_OSS_ACCESS_KEY_SECRET=你的AccessKey Secret
```

### 步骤 5：等待部署
Cyclic 会自动部署，等待 2-5 分钟

### 步骤 6：获取 URL
部署完成后，记录您的 URL：`https://your-app-name.cyclic.app`

### 步骤 7：配置前端
在管理面板 → 配置 → 阿里云 OSS 后端配置：
`https://your-app-name.cyclic.app/api/upload/oss`

---

## Cyclic 简介

Cyclic 是一个完全免费的后端部署平台，无需信用卡，无休眠，非常适合个人项目。

**优点**：
- ✅ 完全免费，无限制
- ✅ 无休眠，持续运行
- ✅ 自动 HTTPS
- ✅ 自动部署（GitHub 集成）
- ✅ 简单易用

---

## 部署步骤（详版）

### 第一步：准备代码

确保代码已推送到 GitHub：

```bash
git add .
git commit -m "准备部署到 Cyclic"
git push
```

### 第二步：注册 Cyclic

1. 打开 https://cyclic.sh
2. 使用 GitHub 登录并授权访问仓库

### 第三步：创建应用

1. 点击 "New App" → "Deploy from GitHub"
2. 选择仓库并连接
3. App Name / Branch 按需设置（通常 `main`）

### 第四步：配置部署设置

1. Root Directory：`server`
2. Start Command：`npm start`
3. Build Command：可留空或 `npm install`

### 第五步：配置环境变量

```env
PORT=3002
NODE_ENV=production
CORS_ORIGIN=https://pic.rlzhao.com

ALIYUN_OSS_REGION=cn-beijing
ALIYUN_OSS_BUCKET=pic4pick
ALIYUN_OSS_ACCESS_KEY_ID=你的AccessKey ID
ALIYUN_OSS_ACCESS_KEY_SECRET=你的AccessKey Secret
```

⚠️ **重要提示**：
- `CORS_ORIGIN` 改成你的前端域名
- OSS 配置替换为真实值

### 第六步：部署

- Cyclic 会自动检测到代码推送并开始部署
- 在 Dashboard → Deployments 查看日志
- 成功日志通常包含：
  - `✅ 阿里云 OSS 客户端已初始化`
  - `🚀 服务器运行在 http://0.0.0.0:3002`

### 第七步：获取后端 URL

- 应用 URL：`https://your-app-name.cyclic.app`
- OSS 上传：`https://your-app-name.cyclic.app/api/upload/oss`
- 健康检查：`https://your-app-name.cyclic.app/api/health`

### 第八步：测试后端

访问：`https://your-app-name.cyclic.app/api/health`  
应返回：`{"status":"ok"}`

---

## 配置前端连接后端

### 方式 1：管理面板

管理面板 → 配置 → 阿里云 OSS 后端配置：填入

`https://your-app-name.cyclic.app/api/upload/oss`

### 方式 2：浏览器控制台

```javascript
localStorage.setItem('aliyun_oss_backend_url', 'https://your-app-name.cyclic.app/api/upload/oss');
location.reload();
```

---

## 常见问题

### Q: 部署失败？

- 看 Deployments 日志
- 检查 `server/package.json`、`server/server-enhanced.js` 是否存在
- 检查环境变量是否填全且无空格

### Q: CORS 错误？

- 确认 `CORS_ORIGIN` 包含完整前端域名（含 `https://`）


