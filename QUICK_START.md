# Pic4Pick 优化版 - 快速启动指南

## 🚀 启动服务器（3步完成）

```bash
# 1. 进入服务器目录
cd server

# 2. 安装依赖（仅首次需要）
npm install

# 3. 启动服务器
npm run dev
# 或使用增强版启动脚本：
# ./start-enhanced.sh
```

服务器将在 http://localhost:3001 启动

## 🔑 默认登录信息

- **用户名**: `admin`
- **密码**: `admin123`

⚠️ **生产环境请修改密码**！

## 📝 主要功能

### 1. 用户认证
```javascript
// 登录
POST /api/auth/login
{
  "username": "admin",
  "password": "admin123"
}

// 返回 token，前端保存到 localStorage
localStorage.setItem('auth_token', response.token);
```

### 2. WebDAV 上传（通过代理，无 CORS 问题）
```javascript
// 测试连接
POST /api/webdav/test
{
  "url": "https://your-webdav.com/dav",
  "username": "your-username",
  "password": "your-password"
}

// 上传文件（需要 Bearer Token）
POST /api/webdav/upload
Headers: Authorization: Bearer {token}
FormData: file, webdavUrl, username, password, remotePath
```

### 3. 本地上传
```javascript
POST /api/upload
FormData: file, filename, optimize
```

### 4. 阿里云 OSS 上传
```javascript
POST /api/upload/oss
FormData: file, filename, optimize
```

## 🔧 环境配置

编辑 `server/.env` 文件：

```bash
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-2024-change-in-production
NODE_ENV=development

# 可选：阿里云 OSS
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=your-bucket
ALIYUN_OSS_ACCESS_KEY_ID=your-key-id
ALIYUN_OSS_ACCESS_KEY_SECRET=your-secret
```

## 📁 项目结构

```
Pic4Pick/
├── server/
│   ├── server-enhanced.js    # 增强版服务器（推荐）
│   ├── server.js             # 原始服务器
│   ├── package.json          # 依赖
│   ├── .env                  # 环境变量
│   ├── start-enhanced.sh     # 启动脚本
│   └── logs/                 # 日志目录
│
├── src/
│   └── utils/
│       ├── webdav.js         # 原始 WebDAV（直接访问）
│       └── webdav-proxy.js   # 代理 WebDAV（推荐）
│
└── OPTIMIZATION_REPORT.md    # 详细优化报告
```

## 🎯 推荐使用方案

### 方案 1：WebDAV 云存储（推荐）
- 使用坚果云、OwnCloud 等 WebDAV 服务
- 通过后端代理访问，无 CORS 问题
- 步骤：
  1. 先登录获取 token
  2. 配置 WebDAV 信息
  3. 使用 proxy 工具上传

### 方案 2：阿里云 OSS
- 存储在阿里云 OSS
- 图床专用，高可用
- 步骤：
  1. 配置 OSS 密钥
  2. 使用 /api/upload/oss 上传

### 方案 3：本地存储
- 图片存在服务器本地
- 适合个人使用
- 步骤：
  1. 使用 /api/upload 上传
  2. 文件存在 server/uploads/

## 🆚 优化前后对比

| 功能 | 优化前 | 优化后 |
|------|--------|--------|
| WebDAV | ❌ CORS 跨域错误 | ✅ 代理访问 |
| 认证 | ❌ 无认证 | ✅ JWT 认证 |
| 密钥管理 | ❌ 硬编码 | ✅ 环境变量 |
| 日志 | ❌ 无 | ✅ Winston |
| 文件验证 | ⚠️ 基础 | ✅ 增强 |
| 性能 | 普通 | ✅ 代码分割 |

## 📚 更多文档

- [OPTIMIZATION_REPORT.md](OPTIMIZATION_REPORT.md) - 详细优化报告
- [DEPLOYMENT.md](DEPLOYMENT.md) - 部署指南
- [ALIYUN_OSS_SETUP.md](ALIYUN_OSS_SETUP.md) - 阿里云 OSS 配置

## 🐛 常见问题

### Q: 登录失败？
A: 检查用户名密码是否为 `admin`/`admin123`，并且服务器正在运行。

### Q: WebDAV 连接失败？
A: 确保 WebDAV 服务器地址正确，格式如 `https://domain.com/dav/`（坚果云要带 `/dav`）

### Q: 上传图片失败？
A: 检查文件大小（最大 15MB）和格式（JPG/PNG/GIF/WebP/HEIC）

### Q: 如何修改登录凭据？
A: 编辑 `server/server-enhanced.js` 中的登录验证逻辑，或集成数据库。

## 🎉 开始使用

```bash
# 启动服务器
cd server && npm run dev

# 在浏览器打开
http://localhost:5173  # 前端 Vite 开发服务器
http://localhost:3001  # 后端 API 服务器
```

---

**享受优化后的 Pic4Pick！** 🚀