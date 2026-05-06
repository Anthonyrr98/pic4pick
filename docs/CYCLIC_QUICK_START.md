# Cyclic 快速部署指南

## 🚀 5 分钟快速部署

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
部署完成后，记录您的 URL：
`https://your-app-name.cyclic.app`

### 步骤 7：配置前端
在管理面板 → 配置 → 阿里云 OSS 后端配置：
`https://your-app-name.cyclic.app/api/upload/oss`

---

## ✅ 完成！

详细步骤请查看：[server/CYCLIC_DEPLOY.md](./server/CYCLIC_DEPLOY.md)

