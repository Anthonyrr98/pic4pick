# 生产环境部署完整指南

> 原文件位置：`DEPLOY_PRODUCTION.md`  
> 本文件为整理后的文档副本，旧文件将保留为跳转页。

## 部署架构

```
GitHub Pages (前端)
    ↓
后端服务器 (Railway/Render/Fly.io)
    ↓
阿里云 OSS (图片存储)
    ↓
Supabase (数据库)
```

---

## 第一步：部署后端服务器

### 推荐平台选择

#### 🥇 首选：Railway（最简单，推荐）
- 免费额度：每月 $5（通常足够使用）
- 难度：⭐ 最简单
- 休眠：无休眠，持续运行

#### 🥈 备选：Cyclic（完全免费）
- 免费额度：无限制
- 难度：⭐ 简单
- 休眠：无休眠

#### 🥉 备选：Render（稳定）
- 免费额度：免费计划
- 难度：⭐⭐ 中等
- 休眠：15分钟无请求会休眠

**详细对比请查看**：`platforms/free-platforms.md`

---

### 选项 1：Railway（推荐）

#### 1. 准备部署

1. **确保代码已推送到 GitHub**
   ```bash
   git add .
   git commit -m "准备生产部署"
   git push
   ```

2. **访问 Railway**
   - 打开 https://railway.app
   - 使用 GitHub 账号登录

#### 2. 创建项目

1. 点击 **"New Project"**
2. 选择 **"Deploy from GitHub repo"**
3. 选择您的仓库（Pic4Pick）

#### 3. 配置部署

1. **设置根目录**
   - 点击项目 → Settings → Source
   - Root Directory: `server`

2. **设置启动命令**
   - 在 Settings → Deploy → Start Command
   - 输入：`npm start`

#### 4. 配置环境变量

在项目 Settings → Variables 中添加：

```env
PORT=3002
NODE_ENV=production
CORS_ORIGIN=https://pic.rlzhao.com

ALIYUN_OSS_REGION=cn-beijing
ALIYUN_OSS_BUCKET=pic4pick
ALIYUN_OSS_ACCESS_KEY_ID=你的AccessKey ID
ALIYUN_OSS_ACCESS_KEY_SECRET=你的AccessKey Secret
```

⚠️ **重要**：
- 将 `CORS_ORIGIN` 替换为您的 GitHub Pages 域名
- 将 OSS 配置替换为您的实际值

#### 5. 获取后端 URL

部署完成后，Railway 会提供一个 URL，例如：
```
https://pic4pick-backend.up.railway.app
```

您的后端 API 地址就是：
```
https://pic4pick-backend.up.railway.app/api/upload/oss
```

#### 6. 测试后端

在浏览器访问：
```
https://pic4pick-backend.up.railway.app/api/health
```

应该返回：`{"status":"ok"}`

---

## 第二步：配置前端

### 方式 1：通过管理面板配置（推荐）

1. **部署前端到 GitHub Pages**
   ```bash
   npm run build
   # 将 dist 目录的内容推送到 gh-pages 分支
   ```

2. **访问管理面板**
   - 打开您的 GitHub Pages 网站
   - 进入管理面板（Admin Panel）

3. **配置后端 URL**
   - 切换到"配置"标签页
   - 找到"阿里云 OSS 后端配置"
   - 输入后端地址：`https://pic4pick-backend.up.railway.app/api/upload/oss`
   - 点击"保存配置"
   - 刷新页面

### 方式 2：通过浏览器控制台配置

在浏览器控制台执行：

```javascript
// 配置后端 URL
localStorage.setItem('aliyun_oss_backend_url', 'https://pic4pick-backend.up.railway.app/api/upload/oss');

// 刷新页面
location.reload();
```

---

## 第三步：验证部署

### 1. 测试上传功能

1. 打开管理面板
2. 选择一张图片上传
3. 检查：
   - ✅ 上传进度条正常显示
   - ✅ 上传成功后显示 OSS URL
   - ✅ 图片在 Supabase 数据库中有记录

### 2. 检查后端日志

在 Railway Dashboard：
- 查看 Deployments → Logs
- 确认看到：`✅ 阿里云 OSS 客户端已初始化`
- 确认上传请求正常处理

### 3. 检查 OSS

访问阿里云 OSS 控制台：
- 确认文件已上传到 `origin/` 目录
- 确认缩略图已上传到 `ore/` 目录

### 4. 检查数据库

访问 Supabase 控制台：
- 查看 `photos` 表
- 确认记录已创建，`image_url` 字段包含 OSS URL

---

## 其他平台

为避免重复，这里不再完整复制原文。请直接查看：

- `platforms/cyclic.md`
- `platforms/flyio.md`
- `platforms/backend-deployment-guide.md`

