# Pic4Pick 部署指南（总览）

本文档详细说明如何将 Pic4Pick 部署到生产环境。

> 如果你要“一步步上线”，优先看：`production.md`  
> 如果你要“按平台部署后端”，看：`platforms/backend-deployment-guide.md`

## 📋 目录

- [部署方案](#部署方案)
- [前端部署](#前端部署)
- [后端部署](#后端部署)
- [数据库配置](#数据库配置)
- [存储配置](#存储配置)
- [域名和 SSL](#域名和-ssl)
- [监控和维护](#监控和维护)

## 部署方案

### 方案对比

| 方案 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| **静态托管 + API 服务** | 小型项目 | 简单、成本低 | 需要单独管理后端 |
| **全栈部署** | 中型项目 | 统一管理 | 需要服务器 |
| **容器化部署** | 大型项目 | 易于扩展 | 配置复杂 |
| **Serverless** | 无服务器 | 自动扩展 | 冷启动问题 |

### 推荐方案

- **小型项目**：Vercel/Netlify（前端）+ Railway/Render（后端）
- **中型项目**：VPS（如 DigitalOcean、Linode）
- **大型项目**：Kubernetes 集群

## 前端部署

### 1. 构建生产版本

```bash
# 安装依赖
npm install

# 构建
npm run build
```

构建输出在 `dist/` 目录。

### 2. 部署到静态托管

#### Vercel

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
vercel
```

或通过 GitHub 集成自动部署。

#### Netlify

```bash
# 安装 Netlify CLI
npm i -g netlify-cli

# 部署
netlify deploy --prod --dir=dist
```

#### GitHub Pages

```bash
# 构建
npm run build

# 推送到 gh-pages 分支
git subtree push --prefix dist origin gh-pages
```

### 3. 配置环境变量

在部署平台配置以下环境变量：

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_AMAP_KEY=your-amap-key
VITE_ADMIN_PASSWORD=your-secure-password
```

### 4. 配置路由

对于单页应用（SPA），需要配置重定向规则：

**Vercel** (`vercel.json`):
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Netlify** (`netlify.toml`):
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

## 后端部署

### 1. 使用 PM2（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 进入服务器目录
cd server

# 启动应用
pm2 start server-enhanced.js --name pic4pick-api

# 保存配置
pm2 save

# 设置开机自启
pm2 startup
```

### 2. 使用 Docker

创建 `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# 复制 package 文件
COPY server/package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制应用文件
COPY server/ ./

# 暴露端口
EXPOSE 3001

# 启动应用
CMD ["node", "server-enhanced.js"]
```

构建和运行：

```bash
docker build -t pic4pick-api .
docker run -d -p 3001:3001 --env-file server/.env pic4pick-api
```

### 3. 使用 systemd（Linux）

创建 `/etc/systemd/system/pic4pick-api.service`:

```ini
[Unit]
Description=Pic4Pick API Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/pic4pick/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server-enhanced.js
Restart=always

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl enable pic4pick-api
sudo systemctl start pic4pick-api
sudo systemctl status pic4pick-api
```

## 数据库配置

### Supabase 配置

1. **创建 Supabase 项目**
   - 访问 [Supabase](https://supabase.com/)
   - 创建新项目
   - 获取项目 URL 和 anon key

2. **运行迁移脚本**
   ```bash
   # 使用 Supabase CLI
   supabase db push
   
   # 或手动执行 SQL
   # 见 supabase/migrations/ 目录
   ```

3. **配置环境变量**
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

## 存储配置

### 阿里云 OSS

详见 `../storage/aliyun-oss.md`。

### 本地存储

确保上传目录有写权限：

```bash
mkdir -p server/uploads/pic4pick
chmod 755 server/uploads/pic4pick
```

## 域名和 SSL

### 使用 Nginx 反向代理

（略。可参考原始文档或根据你的部署平台配置。）

## 监控和维护

### 日志管理

- PM2：`pm2 logs pic4pick-api`
- Winston：`server/logs/`

