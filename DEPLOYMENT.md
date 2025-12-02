# Pic4Pick 网络项目部署指南

本文档说明如何将 Pic4Pick 部署为网络项目，实现照片的服务器端存储。

## 架构概述

```
前端 (React) → 后端 API (Express) → 存储 (文件系统/云存储)
```

## 方案对比

### 方案 1: 本地文件系统存储（适合小型项目）

**优点：**
- 实现简单
- 无需额外服务
- 成本低

**缺点：**
- 存储空间有限
- 备份需要手动处理
- 扩展性差

**适用场景：**
- 个人项目
- 小型团队
- 测试环境

### 方案 2: 云存储服务（推荐生产环境）

**支持的云存储：**
- AWS S3
- 阿里云 OSS
- 腾讯云 COS
- 七牛云
- 又拍云

**优点：**
- 高可用性
- 自动备份
- 易于扩展
- CDN 加速

**缺点：**
- 需要配置云服务
- 可能有费用

**适用场景：**
- 生产环境
- 需要高可用性
- 大量图片存储

### 方案 3: 对象存储 + CDN（最佳实践）

**架构：**
```
前端 → 后端 API → 对象存储 → CDN → 用户
```

**优点：**
- 全球加速
- 高并发支持
- 成本优化

## 部署步骤

### 步骤 1: 设置后端服务器

```bash
# 进入服务器目录
cd server

# 安装依赖
npm install

# 启动服务器
npm start
```

### 步骤 2: 配置前端

1. 打开管理面板 (`/admin`)
2. 点击"存储设置"
3. 选择"后端 API"
4. 输入 API 地址：`http://your-server.com/api/upload`

### 步骤 3: 配置环境变量

创建 `server/.env` 文件：

```env
PORT=3001
NODE_ENV=production
```

### 步骤 4: 配置反向代理（可选）

使用 Nginx 作为反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

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
    }

    # 上传的文件
    location /uploads {
        proxy_pass http://localhost:3001;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

## 云存储集成示例

### AWS S3 集成

1. 安装依赖：
```bash
npm install @aws-sdk/client-s3
```

2. 修改 `server/server.js`，添加 S3 上传功能

3. 配置环境变量：
```env
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=your_bucket
AWS_REGION=us-east-1
```

### 阿里云 OSS 集成

1. 安装依赖：
```bash
npm install ali-oss
```

2. 配置环境变量：
```env
ALIYUN_OSS_ACCESS_KEY_ID=your_key
ALIYUN_OSS_ACCESS_KEY_SECRET=your_secret
ALIYUN_OSS_BUCKET=your_bucket
ALIYUN_OSS_REGION=oss-cn-hangzhou
```

## 数据库集成（可选）

如果需要存储图片元数据，可以集成数据库：

### PostgreSQL 示例

```javascript
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 保存图片元数据
app.post('/api/upload', upload.single('file'), async (req, res) => {
  // ... 上传文件逻辑 ...
  
  // 保存到数据库
  const result = await pool.query(
    'INSERT INTO photos (filename, url, size, created_at) VALUES ($1, $2, $3, $4) RETURNING *',
    [filename, fileUrl, file.size, new Date()]
  );
  
  res.json({ success: true, photo: result.rows[0] });
});
```

## 安全配置

### 1. 添加身份验证

```javascript
import jwt from 'jsonwebtoken';

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: '需要身份验证' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: '无效的令牌' });
    req.user = user;
    next();
  });
};

app.post('/api/upload', authenticateToken, upload.single('file'), ...);
```

### 2. 添加速率限制

```bash
npm install express-rate-limit
```

```javascript
import rateLimit from 'express-rate-limit';

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 10 // 最多 10 次上传
});

app.post('/api/upload', uploadLimiter, upload.single('file'), ...);
```

### 3. 文件类型和大小验证

已在代码中实现，确保：
- 只允许图片文件
- 文件大小限制为 10MB

## 监控和日志

### 使用 PM2

```bash
npm install -g pm2
pm2 start server.js --name pic4pick-server
pm2 logs pic4pick-server
pm2 monit
```

### 日志记录

```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// 使用
logger.info('图片上传成功', { filename, url });
```

## 备份策略

### 自动备份脚本

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/pic4pick"
SOURCE_DIR="/app/server/uploads"

mkdir -p $BACKUP_DIR
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" $SOURCE_DIR

# 保留最近 7 天的备份
find $BACKUP_DIR -name "uploads_*.tar.gz" -mtime +7 -delete
```

### 定时任务

```bash
# 添加到 crontab
0 2 * * * /path/to/backup.sh
```

## 性能优化

1. **图片压缩**：使用 Sharp 自动压缩
2. **CDN 加速**：将图片放在 CDN 上
3. **缓存策略**：设置适当的缓存头
4. **异步处理**：大文件使用队列处理

## 故障排查

### 常见问题

1. **CORS 错误**
   - 检查后端 CORS 配置
   - 确认前端请求的域名在白名单中

2. **文件上传失败**
   - 检查文件大小限制
   - 检查磁盘空间
   - 查看服务器日志

3. **图片无法访问**
   - 检查静态文件服务配置
   - 检查文件权限
   - 检查 Nginx 配置

## 成本估算

### 小型项目（< 1000 张图片）
- 服务器：$5-10/月
- 存储：免费或 $1-2/月
- **总计：$6-12/月**

### 中型项目（1000-10000 张图片）
- 服务器：$20-50/月
- 存储：$5-10/月
- CDN：$5-15/月
- **总计：$30-75/月**

### 大型项目（> 10000 张图片）
- 服务器：$50-200/月
- 存储：$20-100/月
- CDN：$50-200/月
- **总计：$120-500/月**

## 总结

选择存储方案时，考虑：
- **项目规模**：小型项目用文件系统，大型项目用云存储
- **预算**：文件系统最便宜，云存储需要费用
- **可用性要求**：高可用性需要云存储 + CDN
- **扩展性**：云存储更容易扩展

建议：
- **开发/测试**：使用本地文件系统
- **生产环境**：使用云存储（阿里云 OSS 或 AWS S3）
- **高流量**：云存储 + CDN

