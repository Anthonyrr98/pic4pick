# Pic4Pick 后端服务器

这是一个用于 Pic4Pick 项目的后端服务器，提供图片上传、存储和管理功能。

## 管理端作品删除与图片清理

`DELETE /api/admin/photos/:id` 统一处理单张和批量删除。后端先把图片清理任务写入现有的 `app_settings` 表（`oss_cleanup:<作品 id>`），再删除作品记录，确认记录不存在后才删除对应 OSS 原图和高清预览。其他作品仍引用的图片会保留，不会猜测并删除其他目录中的同名文件。

数据库或任务持久化失败时，不删除图片。图片清理失败时，接口返回 `cleanup.pending: true`，前台明确显示清理待重试；任务会保留在数据库，后端启动时及之后每 5 分钟自动重试，每轮最多 20 项。需要现有的 `app_settings` 表、后端 service role 配置以及 OSS 配置，不需要新增迁移。该表应保持管理端专用访问权限。

上传提交使用稳定的作品 UUID：`/api/upload/oss` 接受 `uploadId`，在写 OSS 前将原图、预览的精确路径登记到 `app_settings`（`photo_upload:<UUID>`）。成功上传可保留 48 小时供作品信息保存失败后重试；浏览器以文件内容 SHA-256 缓存同一次提交的 ID 和公共图片 URL，重新选择相同文件或刷新页面后重试不会生成另一条作品。重复保存仅返回已有记录，不覆盖后续编辑或审核状态。

部分上传失败时立即清理；清理失败或用户放弃提交时由启动及每 5 分钟的后台任务重试。未提交的成功上传在 48 小时后清理，重试上传或保存会延长保留时间。清理前检查作品 ID 和其他作品的图片引用，数据库查询失败时保留文件。已过期并被清理的上传会返回 410，前端清除 URL 缓存，下一次提交重新上传。前后端需一起发布；使用独立 OSS 上传后端时，该后端也需配置同一 Supabase 管理端数据库。

前端与后端需一起更新，确保前端删除请求使用上述流程。可在仓库根目录运行 `npm run test:admin` 验证数据库失败、OSS 失败和重启恢复等情况。

## 功能特性

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

