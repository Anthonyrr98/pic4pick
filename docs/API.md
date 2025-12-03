# Pic4Pick API 文档

本文档描述 Pic4Pick 项目的所有 API 接口。

## 目录

- [认证 API](#认证-api)
- [上传 API](#上传-api)
- [照片管理 API](#照片管理-api)
- [配置 API](#配置-api)
- [错误处理](#错误处理)

## 认证 API

### 登录

```http
POST /api/auth/login
Content-Type: application/json
```

**请求体：**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**响应：**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400
}
```

**错误响应：**
```json
{
  "success": false,
  "error": "用户名或密码错误"
}
```

### 验证 Token

```http
GET /api/auth/verify
Authorization: Bearer {token}
```

**响应：**
```json
{
  "valid": true,
  "user": {
    "username": "admin"
  }
}
```

## 上传 API

### 本地上传

```http
POST /api/upload
Content-Type: multipart/form-data
```

**请求参数：**
- `file` (File, 必需) - 图片文件
- `filename` (String, 可选) - 自定义文件名
- `optimize` (String, 可选) - 是否优化，'true' 或 'false'

**响应：**
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

### 阿里云 OSS 上传

```http
POST /api/upload/oss
Content-Type: multipart/form-data
Authorization: Bearer {token}
```

**请求参数：**
- `file` (File, 必需) - 图片文件
- `filename` (String, 可选) - 自定义文件名
- `optimize` (String, 可选) - 是否优化

**响应：**
```json
{
  "success": true,
  "url": "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/pic4pick/1234567890-abc.jpg",
  "filename": "1234567890-abc.jpg",
  "size": 1024000
}
```

### WebDAV 上传（通过代理）

```http
POST /api/webdav/upload
Content-Type: multipart/form-data
Authorization: Bearer {token}
```

**请求参数：**
- `file` (File, 必需) - 图片文件
- `webdavUrl` (String, 必需) - WebDAV 服务器地址
- `username` (String, 必需) - WebDAV 用户名
- `password` (String, 必需) - WebDAV 密码
- `remotePath` (String, 可选) - 远程路径

**响应：**
```json
{
  "success": true,
  "url": "https://your-webdav.com/dav/pic4pick/1234567890-abc.jpg"
}
```

### WebDAV 连接测试

```http
POST /api/webdav/test
Content-Type: application/json
Authorization: Bearer {token}
```

**请求体：**
```json
{
  "url": "https://your-webdav.com/dav",
  "username": "your-username",
  "password": "your-password"
}
```

**响应：**
```json
{
  "success": true,
  "message": "连接成功"
}
```

## 照片管理 API

### 获取照片列表

```http
GET /api/photos
```

**查询参数：**
- `status` (String, 可选) - 状态筛选：'pending', 'approved', 'rejected'
- `category` (String, 可选) - 分类筛选
- `limit` (Number, 可选) - 返回数量限制
- `offset` (Number, 可选) - 偏移量

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "照片标题",
      "image_url": "https://...",
      "thumbnail_url": "https://...",
      "status": "approved",
      "category": "featured",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 100
}
```

### 获取单张照片

```http
GET /api/photos/:id
```

**响应：**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "照片标题",
    "image_url": "https://...",
    "status": "approved",
    "exif": {
      "camera": "Canon EOS 6D",
      "lens": "EF 24-105mm",
      "focal": "50mm",
      "aperture": "f/2.8",
      "shutter": "1/125s",
      "iso": "200"
    },
    "location": {
      "latitude": 39.9042,
      "longitude": 116.4074,
      "country": "中国",
      "location": "北京市"
    }
  }
}
```

### 更新照片

```http
PATCH /api/photos/:id
Content-Type: application/json
Authorization: Bearer {token}
```

**请求体：**
```json
{
  "title": "新标题",
  "category": "featured",
  "status": "approved"
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "新标题",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

### 删除照片

```http
DELETE /api/photos/:id
Authorization: Bearer {token}
```

**响应：**
```json
{
  "success": true,
  "message": "删除成功"
}
```

## 配置 API

### 获取环境配置

```http
GET /api/config
```

**响应：**
```json
{
  "supabase": {
    "url": "https://...",
    "enabled": true
  },
  "oss": {
    "enabled": false
  }
}
```

### 更新环境配置

```http
POST /api/config
Content-Type: application/json
Authorization: Bearer {token}
```

**请求体：**
```json
{
  "supabaseUrl": "https://...",
  "supabaseAnonKey": "...",
  "amapKey": "..."
}
```

## 错误处理

### 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": {}
  }
}
```

### 错误代码

| 代码 | HTTP 状态 | 描述 |
|------|-----------|------|
| `UNAUTHORIZED` | 401 | 未授权 |
| `FORBIDDEN` | 403 | 禁止访问 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_ERROR` | 400 | 验证错误 |
| `UPLOAD_FAILED` | 500 | 上传失败 |
| `FILE_TOO_LARGE` | 413 | 文件过大 |
| `INVALID_FILE_TYPE` | 400 | 无效文件类型 |

## 速率限制

- **上传接口**：15 分钟内最多 10 次
- **认证接口**：15 分钟内最多 5 次
- **其他接口**：无限制

## 认证

大部分 API 需要 JWT Token 认证。在请求头中添加：

```
Authorization: Bearer {token}
```

Token 通过登录接口获取，默认有效期为 24 小时。

## 文件限制

- **支持格式**：JPG, PNG, GIF, WebP, HEIC
- **最大大小**：15MB
- **推荐大小**：< 5MB（自动优化）

## 示例代码

### JavaScript/TypeScript

```javascript
// 登录
const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'admin123'
  })
});
const { token } = await loginResponse.json();

// 上传文件
const formData = new FormData();
formData.append('file', file);
formData.append('optimize', 'true');

const uploadResponse = await fetch('http://localhost:3001/api/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
const result = await uploadResponse.json();
```

### cURL

```bash
# 登录
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 上传文件
curl -X POST http://localhost:3001/api/upload \
  -H "Authorization: Bearer {token}" \
  -F "file=@photo.jpg" \
  -F "optimize=true"
```

## 更多信息

- [开发指南](DEVELOPMENT.md)
- [部署指南](DEPLOYMENT.md)
- [快速开始](../QUICK_START.md)

