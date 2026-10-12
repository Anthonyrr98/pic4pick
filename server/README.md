# Pic4Pick 后端服务器

这是一个用于 Pic4Pick 项目的后端服务器，提供图片上传、存储和管理功能。

## 管理端作品删除与图片清理

`DELETE /api/admin/photos/:id` 统一处理单张和批量删除。后端先把图片清理任务写入现有的 `app_settings` 表（`oss_cleanup:<作品 id>`），再删除作品记录，确认记录不存在后才删除对应 OSS 原图和高清预览。其他作品仍引用的图片会保留，不会猜测并删除其他目录中的同名文件。

数据库或任务持久化失败时，不删除图片。图片清理失败时，接口返回 `cleanup.pending: true`，前台明确显示清理待重试；任务会保留在数据库，后端启动时及之后每 5 分钟自动重试，每轮最多 20 项。需要现有的 `app_settings` 表、后端 service role 配置以及 OSS 配置，不需要新增迁移。该表应保持管理端专用访问权限。

上传提交使用稳定的作品 UUID：`/api/upload/oss` 接受 `uploadId`，在写 OSS 前将原图、预览的精确路径登记到 `app_settings`（`photo_upload:<UUID>`）。成功上传可保留 48 小时供作品信息保存失败后重试；浏览器以文件内容 SHA-256 缓存同一次提交的 ID 和公共图片 URL，重新选择相同文件或刷新页面后重试不会生成另一条作品。重复保存仅返回已有记录，不覆盖后续编辑或审核状态。

部分上传失败时立即清理；清理失败或用户放弃提交时由启动及每 5 分钟的后台任务重试。未提交的成功上传在 48 小时后清理，重试上传或保存会延长保留时间。清理前检查作品 ID 和其他作品的图片引用，数据库查询失败时保留文件。已过期并被清理的上传会返回 410，前端清除 URL 缓存，下一次提交重新上传。前后端需一起发布；使用独立 OSS 上传后端时，该后端也需配置同一 Supabase 管理端数据库。

前端与后端需一起更新，确保前端删除请求使用上述流程。可在仓库根目录运行 `npm run test:admin` 验证数据库失败、OSS 失败和重启恢复等情况。

## 功能特性

### 点赞邮件通知（163 邮箱）

成功调用 `PATCH /api/photos/:id/likes` 新增点赞（`delta: 1`）后，后端异步发送邮件，包含照片标题、当前点赞数、北京时间、点赞 IP 和照片原图链接。配置 `PUBLIC_SITE_URL` 时也会提供图库链接。取消点赞、无效请求、数据库更新失败及不可公开的作品不发通知。邮件发送无需前端修改；IP 记录需应用下方数据库迁移。

在 163 邮箱网页版的“设置 → POP3/SMTP/IMAP”中开启 SMTP 服务并获取客户端授权码，参见 [163 邮箱授权码操作说明](https://consumer.huawei.com/cn/support/content/zh-cn15872099/)。把以下配置放入 `server/.env`；线上部署则设置在**实际处理点赞接口的后端**环境变量中：

```dotenv
LIKE_EMAIL_ENABLED=true
SMTP_HOST=smtp.163.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的邮箱@163.com
SMTP_PASS=你的SMTP授权码
# 可留空，默认发给 SMTP_USER，也可填写另一个接收邮箱
LIKE_NOTIFICATION_TO=
# 可选：实际图库网址
PUBLIC_SITE_URL=
```

后端需 Node.js 20 或以上，仓库 Dockerfile 已使用 Node.js 22。在 `server` 目录安装新依赖（`npm ci`）并重启后端。授权码只放后端环境变量，不放 `VITE_*` 或提交到 Git。SMTP 使用 TLS 加密连接。缺少配置时关闭邮件通知，已启用但配置无效时记录告警，点赞仍可用。

在 `server` 目录运行 `npm run mail:test` 检查 SMTP 连接和认证；运行 `npm run mail:test -- --send` 向配置的接收邮箱发送一封测试通知。仓库根目录运行 `npm run test:likes` 验证点赞通知行为。

Render 免费实例限制出站 SMTP 端口 25、465、587（[官方说明](https://render.com/docs/free)）。163 的加密 SMTP 994 端口已在本地通过连接和认证测试，`render.yaml` 使用 `SMTP_PORT=994`、`SMTP_SECURE=true`；实际从 Render 发信仍需上线验证。发件地址、收件地址和授权码需配置到 Render 环境变量，不能仅保存在本地 `.env`。

线上可用管理员 Bearer token 调用 `POST /api/admin/notifications/likes/test`，从实际后端验证 SMTP 并发送测试通知，不修改照片或点赞数。此接口只向后端配置的收件邮箱发信，不接受自定义收件地址，每个 IP 每小时最多 5 次。

### 点赞 IP 记录

部署前先应用 `20261012072633_record_photo_like_ips.sql`。每次成功新增点赞时，新的 `update_public_photo_likes_with_ip` RPC 在同一事务内更新计数并写入 `photo_like_events`，保存照片 ID、点赞时间和 IP。记录保存失败则整个点赞回滚；取消点赞不会增加记录，也不会删除此前的点赞事件。部署前已有的点赞无法补录 IP。

IP 来自 Express 的 `req.ip`，支持 IPv4 / IPv6；IPv4 映射地址会去掉 `::ffff:` 前缀，不读取请求正文中的 IP。线上沿用 Render 单层代理的 `trust proxy=1`，通过代理追加的地址判断来源；本地直接部署或改变代理层数时必须相应配置可信代理（[Express 官方说明](https://expressjs.com/en/guide/behind-proxies/)）。IP 标识的是网络出口，共用网络、代理或 VPN 下不能据此唯一识别个人。这版只记录，不增加按 IP 去重点赞限制。

邮件通知会包含点赞 IP。数据表启用 RLS，匿名及普通登录数据库角色无权限；只有后端 service role 能读写，公开点赞响应不包含 IP。管理员可通过 Bearer token 调用 `GET /api/admin/like-events?photoId=<可选照片UUID>&limit=50&offset=0`，按时间倒序查询；`limit` 上限 100。删除照片时关联记录随之删除，目前没有自动过期清理。

这版按每次成功新增点赞发送一封通知，访客身份沿用现有匿名点赞机制，不提供跨设备去重。发信失败只记后端日志（`点赞邮件发送失败`），没有持久化队列或自动补发，进程重启可能丢失尚未发送的通知。部署服务器需允许出站 SMTP 连接，测试通知收到后再验证一次真实点赞。

- ✅ 图片上传（支持 JPG、PNG、GIF、WebP）
- ✅ 文件大小限制（默认 10MB）
- ✅ 图片优化和压缩（使用 Sharp）
- ✅ 静态文件服务
- ✅ 图片删除
- ✅ 图片列表查询
- ✅ CORS 支持
- ✅ 错误处理

## 快速开始

### 1. 安装依赖

```bash
cd server
npm install
```

### 2. 启动服务器

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

服务器将在 `http://localhost:3001` 启动。

## API 接口

### 1. 健康检查

```
GET /api/health
```

### 2. 上传图片

```
POST /api/upload
Content-Type: multipart/form-data

参数:
- file: 图片文件（必需）
- filename: 自定义文件名（可选）
- optimize: 是否优化图片，'true' 或 'false'（可选）
```

响应示例：
```json
{
  "success": true,
  "url": "http://localhost:3001/uploads/pic4pick/1234567890-abc.jpg",
  "filename": "1234567890-abc.jpg",
  "originalName": "photo.jpg",
  "size": 1024000,
  "message": "上传成功"
}
```

### 3. 删除图片

```
DELETE /api/upload/:filename
```

### 4. 获取图片列表

```
GET /api/images
```

## 部署指南

**📖 详细的部署指南请查看：[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)**

该指南包含：
- 如何获取后端服务器地址
- Railway、Render、Fly.io 等平台的部署步骤
- VPS 服务器部署方法
- 环境变量配置说明

---

## 部署选项

### 选项 1: 本地文件系统（当前实现）

图片存储在服务器的 `uploads/pic4pick/` 目录中。

**优点：**
- 简单易用
- 无需额外配置

**缺点：**
- 需要服务器有足够的存储空间
- 备份和扩展性较差

### 选项 2: 云存储服务

可以修改代码以支持云存储：

#### AWS S3
```javascript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
```

#### 阿里云 OSS
```javascript
import OSS from 'ali-oss';

const client = new OSS({
  region: process.env.ALIYUN_OSS_REGION,
  accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
});
```

#### 腾讯云 COS
```javascript
import COS from 'cos-nodejs-sdk-v5';

const cos = new COS({
  SecretId: process.env.TENCENT_SECRET_ID,
  SecretKey: process.env.TENCENT_SECRET_KEY,
});
```

### 选项 3: 数据库存储

可以将图片元数据存储在数据库中：

- **PostgreSQL** + **PostGIS**（支持地理位置查询）
- **MongoDB**（灵活的文档存储）
- **MySQL**（传统关系型数据库）

## 前端配置

在前端管理面板中：

1. 选择"存储设置"
2. 选择"后端 API"
3. 配置 API 地址：`http://localhost:3001/api/upload`

## 生产环境部署

### 使用 PM2

```bash
npm install -g pm2
pm2 start server.js --name pic4pick-server
pm2 save
pm2 startup
```

### 使用 Docker

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

构建和运行：

```bash
docker build -t pic4pick-server .
docker run -p 3001:3001 -v $(pwd)/uploads:/app/uploads pic4pick-server
```

### 使用 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /var/www/pic4pick/dist;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 上传的文件
    location /uploads {
        proxy_pass http://localhost:3001;
    }
}
```

## 安全建议

1. **添加身份验证**：使用 JWT 或 Session
2. **文件类型验证**：只允许图片文件
3. **文件大小限制**：防止大文件攻击
4. **速率限制**：防止恶意上传
5. **HTTPS**：生产环境使用 HTTPS
6. **CORS 配置**：限制允许的域名

## 扩展功能

- [ ] 图片裁剪和缩放
- [ ] 水印添加
- [ ] 图片格式转换
- [ ] CDN 集成
- [ ] 图片元数据提取（EXIF）
- [ ] 批量上传
- [ ] 图片搜索和标签

