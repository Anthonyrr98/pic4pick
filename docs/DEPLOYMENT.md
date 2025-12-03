# Pic4Pick 部署指南

本文档详细说明如何将 Pic4Pick 部署到生产环境。

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

### 本地数据库（可选）

如果需要使用 PostgreSQL：

```bash
# 安装 PostgreSQL
sudo apt-get install postgresql

# 创建数据库
createdb pic4pick

# 运行迁移
psql pic4pick < migrations/init.sql
```

## 存储配置

### 阿里云 OSS

详见 [ALIYUN_OSS_SETUP.md](../ALIYUN_OSS_SETUP.md)

### 本地存储

确保上传目录有写权限：

```bash
mkdir -p server/uploads/pic4pick
chmod 755 server/uploads/pic4pick
```

### WebDAV

配置 WebDAV 服务器地址和凭据，通过后端代理访问。

## 域名和 SSL

### 使用 Nginx 反向代理

安装 Nginx：

```bash
sudo apt-get install nginx
```

配置 `/etc/nginx/sites-available/pic4pick`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL 证书
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # 前端
    location / {
        root /var/www/pic4pick/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # 后端 API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # 上传文件
    location /uploads {
        proxy_pass http://localhost:3001;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/pic4pick /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 使用 Let's Encrypt SSL

```bash
# 安装 Certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

## 监控和维护

### 日志管理

#### PM2 日志

```bash
# 查看日志
pm2 logs pic4pick-api

# 查看错误日志
pm2 logs pic4pick-api --err

# 清空日志
pm2 flush
```

#### Winston 日志

日志文件位置：`server/logs/`

- `combined.log` - 所有日志
- `error.log` - 错误日志

### 性能监控

#### PM2 监控

```bash
pm2 monit
```

#### 系统监控

```bash
# CPU 和内存
htop

# 磁盘使用
df -h

# 网络
iftop
```

### 备份策略

#### 数据库备份

```bash
# Supabase 自动备份
# 或手动导出
pg_dump pic4pick > backup_$(date +%Y%m%d).sql
```

#### 文件备份

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/pic4pick"
SOURCE_DIR="/var/www/pic4pick/server/uploads"

mkdir -p $BACKUP_DIR
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" $SOURCE_DIR

# 保留最近 7 天
find $BACKUP_DIR -name "uploads_*.tar.gz" -mtime +7 -delete
```

设置定时任务：

```bash
# 每天凌晨 2 点备份
0 2 * * * /path/to/backup.sh
```

### 更新部署

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 安装依赖
npm install
cd server && npm install && cd ..

# 3. 构建前端
npm run build

# 4. 重启后端
pm2 restart pic4pick-api

# 或使用 Docker
docker-compose up -d --build
```

## 安全配置

### 1. 防火墙

```bash
# 只开放必要端口
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

### 2. 环境变量安全

- 不要将 `.env` 文件提交到 Git
- 使用环境变量管理服务（如 Vercel、Railway）
- 定期轮换密钥

### 3. 密码安全

- 使用强密码
- 定期更换密码
- 使用密码管理器

### 4. HTTPS

- 强制使用 HTTPS
- 配置 HSTS
- 使用安全的 SSL/TLS 配置

## 故障排查

### 常见问题

1. **502 Bad Gateway**
   - 检查后端服务是否运行
   - 检查 Nginx 配置
   - 查看后端日志

2. **CORS 错误**
   - 检查后端 CORS 配置
   - 确认前端域名在白名单

3. **上传失败**
   - 检查文件权限
   - 检查磁盘空间
   - 查看错误日志

4. **数据库连接失败**
   - 检查 Supabase 配置
   - 检查网络连接
   - 查看数据库日志

## 性能优化

### 1. CDN 配置

- 将静态资源放在 CDN
- 配置缓存策略
- 使用图片 CDN

### 2. 缓存策略

```nginx
# 静态资源缓存
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 3. 压缩

```nginx
# 启用 Gzip
gzip on;
gzip_types text/plain text/css application/json application/javascript;
```

## 成本估算

### 小型项目（< 1000 张照片）

- **Vercel/Netlify**：免费
- **Supabase**：免费（开发版）
- **阿里云 OSS**：约 ¥0.25/月
- **总计**：约 ¥0.25/月

### 中型项目（1000-10000 张照片）

- **VPS**：$5-20/月
- **Supabase**：$25/月
- **OSS + CDN**：¥10-50/月
- **总计**：约 $40-70/月

### 大型项目（> 10000 张照片）

- **VPS/云服务器**：$50-200/月
- **Supabase**：$100+/月
- **OSS + CDN**：¥100-500/月
- **总计**：约 $150-800/月

## 更多资源

- [Vercel 部署指南](https://vercel.com/docs)
- [Netlify 部署指南](https://docs.netlify.com/)
- [PM2 文档](https://pm2.keymetrics.io/)
- [Nginx 文档](https://nginx.org/en/docs/)

---

**部署愉快！** 🚀

