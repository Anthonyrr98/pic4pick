> 本文档已归档到 `docs/engineering/project-documentation.md`  
> 请访问：`./docs/engineering/project-documentation.md`

（此文件保留为兼容旧链接的跳转页。）

## 📋 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [技术架构](#技术架构)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [环境配置](#环境配置)
- [开发指南](#开发指南)
- [API 文档](#api-文档)
- [部署指南](#部署指南)
- [数据库设计](#数据库设计)
- [常见问题](#常见问题)
- [贡献指南](#贡献指南)

---

## 项目简介

**Pic4Pick** 是一个现代化的照片管理和展示平台，专为摄影师和摄影爱好者设计。它提供了完整的照片上传、审核、分类展示和地理位置探索功能。

### 核心价值

- 📸 **专业的照片管理**：支持 EXIF 数据提取、地理位置标记、分类管理
- 🎨 **优雅的展示界面**：响应式设计，适配各种设备
- 🔍 **地理位置探索**：基于地图的照片发现功能
- ⚙️ **灵活的管理后台**：完整的审核流程和配置管理
- 🚀 **高性能架构**：代码分割、懒加载、CDN 加速

### 适用场景

- 个人摄影作品集
- 摄影团队作品管理
- 摄影比赛作品展示
- 地理位置相关的摄影项目

---

## 功能特性

### 📸 照片管理

#### 上传功能
- **多种上传方式**
  - 文件选择上传
  - 拖拽上传
  - URL 导入
- **自动处理**
  - EXIF 数据自动提取（焦距、光圈、快门、ISO、相机型号等）
  - 地理位置信息提取（GPS 坐标）
  - 图片压缩和优化
- **存储支持**
  - 本地存储（开发模式）
  - Supabase 存储
  - 阿里云 OSS
  - WebDAV（通过代理）
#### 审核流程
- **待审核**：新上传的照片默认状态
- **已审核**：通过审核的照片，可在图库中展示
- **已拒绝**：未通过审核的照片，可查看拒绝原因

### 🎨 前端展示

#### 图库视图
- **响应式网格布局**：自适应不同屏幕尺寸
- **懒加载**：优化性能，按需加载图片
- **照片详情**：点击查看完整信息
  - EXIF 参数展示
  - 地理位置信息
  - 拍摄日期
  - 评分和标签

#### 发现视图
- **地图可视化**：基于 MapLibre GL 的地图展示
- **地理位置探索**：在地图上浏览照片位置
- **城市/省份筛选**：按地理位置筛选照片
- **距离计算**：显示照片与当前位置的距离

#### 品牌定制
- **Logo 自定义**：支持上传自定义 Logo
- **标题文案**：可自定义平台标题
- **品牌设置持久化**：配置保存到 Supabase

### ⚙️ 管理后台

#### 照片审核
- **待审核列表**：查看所有待审核照片
- **审核操作**：通过/拒绝/重新提交
- **批量操作**：批量审核、导出、导入
- **拒绝原因**：记录拒绝原因，便于改进

#### 配置管理
- **环境配置**：Supabase、高德地图等 API 配置
- **存储配置**：上传方式选择（本地/OSS/WebDAV）
- **品牌设置**：Logo 和标题文案管理

#### 工具面板
- **数据导出**：导出 JSON 格式的照片数据
- **数据导入**：从 JSON 文件导入照片数据
- **图片压缩**：在线图片压缩工具
- **配置检查**：检查各项配置是否正确

### 🔧 技术特性

#### 性能优化
- **代码分割**：按需加载，减少初始包大小
  - React 相关库独立打包
  - 地图库独立打包
  - 工具库独立打包
- **懒加载**：图片和组件按需加载
- **CDN 加速**：使用阿里云 OSS CDN 加速图片访问
#### 安全特性
- **JWT 认证**：安全的身份认证机制
- **环境变量管理**：敏感信息不暴露
- **文件类型验证**：限制上传文件类型
- **文件大小限制**：防止过大文件上传
- **CORS 配置**：跨域请求安全控制

---

## 技术架构

### 整体架构

```
┌─────────────────┐
│   前端 (React)   │
│  GitHub Pages    │
└────────┬─────────┘
         │
         ├─── Supabase (数据库)
         │    └── PostgreSQL
         │
         └─── 后端服务器 (Node.js)
              └── 阿里云 OSS (图片存储)
```

### 技术栈

#### 前端技术
- **React 19**：现代化的 UI 框架
- **Vite 7**：快速的构建工具
- **React Router 7**：单页应用路由管理
- **MapLibre GL 5**：开源地图库
- **EXIFR 7**：EXIF 数据读取库
- **i18next**：国际化支持（可选）

#### 后端技术
- **Node.js**：JavaScript 运行环境
- **Express 4**：Web 应用框架
- **Multer**：文件上传处理
- **Sharp**：图片处理库
- **Winston**：日志系统
- **JWT**：身份认证
- **bcryptjs**：密码加密

#### 存储方案
- **Supabase**：后端即服务（BaaS）
  - PostgreSQL 数据库
  - 实时数据同步
  - Row Level Security (RLS)
- **阿里云 OSS**：对象存储服务
  - CDN 加速
  - 高可用性
  - 按量付费
- **LocalStorage**：本地存储（开发模式）

### 数据流程

#### 照片上传流程

```
1. 用户选择图片
   ↓
2. 前端读取 EXIF 数据（地理位置、相机参数等）
   ↓
3. 调用上传接口
   ↓
4. 后端服务器接收文件
   ↓
5. 上传到阿里云 OSS（或本地存储）
   ↓
6. 返回图片 URL
   ↓
7. 前端保存元数据到 Supabase
   ↓
8. 状态设置为 pending（待审核）
```

#### 照片展示流程

```
1. 用户访问图库页面
   ↓
2. 前端从 Supabase 查询照片数据
   ↓
3. 筛选条件（分类、状态等）
   ↓
4. 渲染照片列表（懒加载）
   ↓
5. 点击照片查看详情
   ↓
6. 显示完整 EXIF 和地理位置信息
```

---

## 快速开始

### 前置要求

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Git**（用于克隆项目）

### 安装步骤

#### 1. 克隆项目

```bash
git clone <repository-url>
cd Pic4Pick
```

#### 2. 安装前端依赖

```bash
npm install
```

#### 3. 安装后端依赖

```bash
cd server
npm install
cd ..
```

#### 4. 配置环境变量

**前端配置**（`.env.local`）：

```env
# Supabase 配置
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# 高德地图 API Key
VITE_AMAP_KEY=your-amap-key

# 管理员密码
VITE_ADMIN_PASSWORD=your-secure-password

# 后端服务器地址（开发环境）
VITE_API_URL=http://localhost:3001
```

**后端配置**（`server/.env`）：

```env
# 服务器配置
PORT=3001
NODE_ENV=development
JWT_SECRET=your-jwt-secret-key

# 阿里云 OSS（可选）
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=your-bucket
ALIYUN_OSS_ACCESS_KEY_ID=your-key-id
ALIYUN_OSS_ACCESS_KEY_SECRET=your-secret

# CORS 配置
CORS_ORIGIN=http://localhost:5173
```

#### 5. 初始化数据库

在 Supabase 中执行迁移脚本（`supabase/migrations/`）：

```sql
-- 创建 photos 表
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  location TEXT,
  country TEXT,
  category TEXT,
  tags TEXT,
  image_url TEXT,
  thumbnail_url TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  altitude DECIMAL,
  focal TEXT,
  aperture TEXT,
  shutter TEXT,
  iso TEXT,
  camera TEXT,
  lens TEXT,
  rating INTEGER,
  shot_date DATE,
  status TEXT DEFAULT 'pending',
  hidden BOOLEAN DEFAULT false,
  reject_reason TEXT,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 创建 brand_settings 表
CREATE TABLE brand_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url TEXT,
  brand_text TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

#### 6. 启动开发服务器

**终端 1：启动前端**

```bash
npm run dev
```

前端将在 http://localhost:5173 启动

**终端 2：启动后端**

```bash
cd server
npm run dev
```

后端将在 http://localhost:3001 启动

### 访问应用

- **前端应用**：http://localhost:5173
- **管理后台**：http://localhost:5173/#/admin
- **后端 API**：http://localhost:3001

### 默认登录信息

- **用户名**：`admin`
- **密码**：`admin123`（或 `.env.local` 中配置的 `VITE_ADMIN_PASSWORD`）

⚠️ **生产环境请务必修改默认密码！**

---

## 项目结构

```
Pic4Pick/
├── src/                          # 前端源代码
│   ├── components/               # React 组件
│   │   ├── admin/                # 管理后台组件
│   │   │   ├── ConfigPanel.jsx  # 配置面板
│   │   │   └── ToolsPanel.jsx   # 工具面板
│   │   ├── ErrorBoundary.jsx    # 错误边界
│   │   ├── LoginForm.jsx        # 登录表单
│   │   └── UploadProgress.jsx   # 上传进度
│   ├── pages/                    # 页面组件
│   │   ├── Admin.jsx            # 管理后台页面
│   │   └── Gallery.jsx          # 图库展示页面
│   ├── hooks/                    # 自定义 Hooks
│   │   ├── useBrandConfig.js    # 品牌配置 Hook
│   │   ├── useFileUpload.js     # 文件上传 Hook
│   │   ├── useGearOptions.js    # 相机参数选项 Hook
│   │   ├── useLocationPicker.js # 位置选择器 Hook
│   │   └── usePhotoManagement.js # 照片管理 Hook
│   ├── utils/                    # 工具函数
│   │   ├── adminUtils.js        # 管理工具函数
│   │   ├── auth.js              # 认证工具
│   │   ├── branding.js          # 品牌相关工具
│   │   ├── envConfig.js         # 环境配置工具
│   │   ├── errorHandler.js      # 错误处理工具
│   │   ├── ossSignature.js      # OSS 签名工具
│   │   ├── storage.js           # 存储工具
│   │   ├── supabaseClient.js    # Supabase 客户端
│   │   ├── upload.js            # 上传工具
│   │   └── urlUtils.js          # URL 工具
│   ├── constants/                # 常量定义
│   │   └── storageKeys.js       # 存储键常量
│   ├── i18n/                     # 国际化（可选）
│   │   └── locales/
│   ├── App.jsx                   # 应用入口
│   ├── App.css                   # 应用样式
│   ├── main.jsx                  # 主入口文件
│   └── index.css                 # 全局样式
│
├── server/                        # 后端服务器
│   ├── server-enhanced.js        # 增强版服务器（推荐）
│   ├── server.js                 # 原始服务器
│   ├── start-enhanced.sh         # 启动脚本
│   ├── package.json              # 后端依赖
│   ├── .env                      # 后端环境变量
│   ├── uploads/                  # 上传文件存储（本地模式）
│   │   └── pic4pick/
│   └── logs/                     # 日志目录
│       ├── combined.log          # 综合日志
│       └── error.log             # 错误日志
│
├── supabase/                      # Supabase 相关
│   ├── functions/                # Edge Functions
│   │   ├── upload-oss/          # OSS 上传函数
│   │   └── _shared/              # 共享代码
│   └── migrations/               # 数据库迁移
│       ├── 20251202_brand_settings.sql
│       ├── 20251202_add_gear_presets.sql
│       ├── 20251202_add_hidden_to_photos.sql
│       ├── 20251202_add_rating_to_photos.sql
│       ├── 20251202_add_shot_date_to_photos.sql
│       ├── 20251202_add_thumbnail_to_photos.sql
│       ├── 20251203_add_likes_to_photos.sql
│       └── 20251204_add_reject_reason_to_photos.sql
│
├── public/                        # 静态资源
│   ├── CNAME                     # GitHub Pages 自定义域名
│   └── vite.svg                  # 默认图标
│
├── dist/                          # 构建输出
│   ├── assets/                   # 打包后的资源
│   ├── index.html                # 入口 HTML
│   └── CNAME
│
├── docs/                          # 文档目录
│   ├── API.md                    # API 文档
│   ├── DEVELOPMENT.md            # 开发指南
│   └── DEPLOYMENT.md             # 部署指南
│
├── api/                           # API 相关
│   └── upload/
│       └── sign.js               # OSS 签名生成
│
├── index.html                     # HTML 入口
├── vite.config.js                 # Vite 配置
├── package.json                   # 前端依赖
├── tsconfig.json                  # TypeScript 配置
├── eslint.config.js               # ESLint 配置
├── README.md                      # 项目说明
├── ARCHITECTURE.md                # 架构说明
├── QUICK_START.md                 # 快速开始
└── PROJECT_DOCUMENTATION.md       # 本文档
```

---

## 环境配置

### 前端环境变量

创建 `.env.local` 文件（不会被提交到 Git）：

```env
# Supabase 配置（必需）
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# 高德地图 API Key（必需，用于地理位置搜索）
VITE_AMAP_KEY=your-amap-key

# 管理员密码（必需）
VITE_ADMIN_PASSWORD=your-secure-password

# 后端服务器地址（开发环境）
VITE_API_URL=http://localhost:3001

# 阿里云 OSS 后端地址（可选，如果使用 OSS）
VITE_ALIYUN_OSS_BACKEND_URL=http://localhost:3001/api/upload/oss
```

### 后端环境变量

创建 `server/.env` 文件：

```env
# 服务器配置
PORT=3001
NODE_ENV=development

# JWT 密钥（必需，用于身份认证）
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# CORS 配置（允许的前端域名）
CORS_ORIGIN=http://localhost:5173

# 阿里云 OSS 配置（可选）
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=your-bucket-name
ALIYUN_OSS_ACCESS_KEY_ID=your-access-key-id
ALIYUN_OSS_ACCESS_KEY_SECRET=your-access-key-secret

# 文件上传限制
MAX_FILE_SIZE=15728640  # 15MB（字节）
ALLOWED_FILE_TYPES=jpg,jpeg,png,gif,webp,heic
```

### 获取配置信息

#### Supabase 配置

1. 访问 [Supabase](https://supabase.com/)
2. 创建新项目或使用现有项目
3. 在项目设置中找到：
   - **Project URL**：`VITE_SUPABASE_URL`
   - **anon public key**：`VITE_SUPABASE_ANON_KEY`

#### 高德地图 API Key

1. 访问 [高德开放平台](https://lbs.amap.com/)
2. 注册账号并创建应用
3. 获取 Web 服务 API Key
4. 配置到 `VITE_AMAP_KEY`

#### 阿里云 OSS 配置

1. 访问 [阿里云 OSS](https://oss.console.aliyun.com/)
2. 创建 Bucket
3. 获取 AccessKey ID 和 AccessKey Secret
4. 配置到后端环境变量

详细配置步骤请参考 [ALIYUN_OSS_SETUP.md](ALIYUN_OSS_SETUP.md)

---

## 开发指南

### 开发环境设置

#### 1. 代码规范

项目使用 ESLint 进行代码检查：

```bash
npm run lint
```

#### 2. 开发模式

前端开发服务器支持热重载：

```bash
npm run dev
```

后端开发服务器支持自动重启（使用 `--watch`）：

```bash
cd server
npm run dev
```

#### 3. 代码结构

- **组件**：使用函数式组件和 Hooks
- **状态管理**：使用 React Hooks（useState, useEffect 等）
- **路由**：使用 React Router HashRouter
- **样式**：使用 CSS 模块或内联样式

### 主要开发任务

#### 添加新功能

1. 在 `src/` 目录下创建相关文件
2. 如需新页面，在 `src/pages/` 添加
3. 如需新组件，在 `src/components/` 添加
4. 如需新工具函数，在 `src/utils/` 添加
5. 在 `src/App.jsx` 中添加路由（如需要）

#### 修改数据库结构

1. 在 `supabase/migrations/` 创建新的迁移文件
2. 文件名格式：`YYYYMMDD_description.sql`
3. 在 Supabase 控制台执行迁移

#### 添加新的存储方式

1. 在 `src/utils/upload.js` 添加上传逻辑
2. 在 `server/server-enhanced.js` 添加后端支持
3. 在管理后台添加配置选项

### 调试技巧

#### 前端调试

- 使用 React DevTools
- 浏览器控制台查看日志
- 检查 LocalStorage 中的数据

#### 后端调试

- 查看 `server/logs/` 目录下的日志文件
- 使用 `console.log` 输出调试信息
- 使用 Postman 测试 API

### 性能优化

#### 已实现的优化

- ✅ 代码分割（Code Splitting）
- ✅ 图片懒加载
- ✅ 组件懒加载
- ✅ 构建优化（Terser 压缩）

#### 进一步优化建议

- 使用 Service Worker 实现离线支持
- 实现图片 CDN 缓存策略
- 使用 React.memo 优化组件渲染
- 实现虚拟滚动（如果照片数量很大）

---

## API 文档

### 认证 API

#### 登录

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

#### 验证 Token

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

### 上传 API

#### 本地上传

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

#### 阿里云 OSS 上传

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

#### WebDAV 上传

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

### 照片管理 API

#### 获取照片列表

```http
GET /api/photos?status=approved&category=featured&limit=20&offset=0
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

#### 更新照片

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

#### 删除照片

```http
DELETE /api/photos/:id
Authorization: Bearer {token}
```

### 错误处理

所有 API 错误响应格式：

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

**常见错误代码：**
- `UNAUTHORIZED` (401) - 未授权
- `FORBIDDEN` (403) - 禁止访问
- `NOT_FOUND` (404) - 资源不存在
- `VALIDATION_ERROR` (400) - 验证错误
- `UPLOAD_FAILED` (500) - 上传失败
- `FILE_TOO_LARGE` (413) - 文件过大
- `INVALID_FILE_TYPE` (400) - 无效文件类型

详细 API 文档请参考 [docs/API.md](docs/API.md)

---

## 部署指南

### 前端部署

#### GitHub Pages 部署

1. **构建项目**

```bash
npm run build
```

2. **配置 GitHub Pages**

- 在 GitHub 仓库设置中启用 Pages
- 选择 `gh-pages` 分支或 `dist` 目录
- 如果使用自定义域名，在 `public/CNAME` 配置域名

3. **自动部署（可选）**

使用 GitHub Actions 自动部署：

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

#### Vercel 部署

1. 连接 GitHub 仓库到 Vercel
2. 配置构建命令：`npm run build`
3. 配置输出目录：`dist`
4. 配置环境变量

#### Netlify 部署

1. 连接 GitHub 仓库到 Netlify
2. 配置构建命令：`npm run build`
3. 配置发布目录：`dist`
4. 配置环境变量

#### Cloudflare Pages 部署

适合前端静态站点（Vite 构建产物）：

1. 在 Cloudflare Pages 创建新项目，绑定 GitHub 仓库
2. 构建设置
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version: `18+`
3. 环境变量（生产环境）
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_AMAP_KEY`
   - `VITE_ADMIN_PASSWORD`
   - `VITE_API_URL`（后端公网地址或 Cloudflare Tunnel 地址）
4. 自定义域名（可选）
   - 在 Pages 中添加自定义域名
   - 确认 DNS 解析生效（CNAME 到 `*.pages.dev`）
5. 缓存与优化（可选）
   - 在 Pages > Functions 关闭/开启缓存视需求
   - 如需边缘缓存，可在 Cloudflare Rules 配置 Cache Rules 针对静态资源

#### Cloudflare Workers / Tunnel （后端访问）

如果后端未暴露公网，可用 Cloudflare Tunnel 将本地/私网的后端 3001/3002 端口暴露到公网：

1. 安装 cloudflared 并登录：`cloudflared tunnel login`
2. 创建隧道：`cloudflared tunnel create pic4pick-api`
3. 绑定本地服务端口：
   ```bash
   cloudflared tunnel route dns pic4pick-api api.example.com
   cloudflared tunnel run pic4pick-api --url http://localhost:3001
   ```
4. 在前端 `.env` 配置 `VITE_API_URL=https://api.example.com`
5. 若需保护接口，可在 Cloudflare Zero Trust 添加 WAF / Access 规则


### 后端部署

#### Railway 部署

1. 在 Railway 创建新项目
2. 连接 GitHub 仓库
3. 设置根目录为 `server/`
4. 配置环境变量
5. 设置启动命令：`npm start`

#### Fly.io 部署

1. 安装 Fly CLI
2. 初始化项目：`fly launch`
3. 配置 `fly.toml`
4. 部署：`fly deploy`

详细步骤请参考 [server/FLYIO_DEPLOY.md](server/FLYIO_DEPLOY.md)

#### Render 部署

1. 在 Render 创建 Web Service
2. 连接 GitHub 仓库
3. 设置根目录为 `server/`
4. 配置环境变量
5. 设置启动命令：`npm start`

### 数据库部署

#### Supabase 迁移

1. 在 Supabase 控制台打开 SQL Editor
2. 执行 `supabase/migrations/` 目录下的所有迁移文件
3. 按时间顺序执行

### 环境变量配置

#### 生产环境前端变量

在部署平台配置以下环境变量：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AMAP_KEY`
- `VITE_ADMIN_PASSWORD`
- `VITE_API_URL`（后端服务器地址）

#### 生产环境后端变量

在部署平台配置以下环境变量：

- `PORT`（通常由平台自动设置）
- `NODE_ENV=production`
- `JWT_SECRET`
- `CORS_ORIGIN`（前端域名）
- `ALIYUN_OSS_REGION`
- `ALIYUN_OSS_BUCKET`
- `ALIYUN_OSS_ACCESS_KEY_ID`
- `ALIYUN_OSS_ACCESS_KEY_SECRET`

### 部署检查清单

- [ ] 前端构建成功
- [ ] 后端服务器运行正常
- [ ] 数据库迁移完成
- [ ] 环境变量配置正确
- [ ] CORS 配置正确
- [ ] 文件上传功能测试通过
- [ ] 数据库连接测试通过
- [ ] 管理员登录功能正常
- [ ] 图片显示正常
- [ ] 地图功能正常

详细部署指南请参考：
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [DEPLOY_PRODUCTION.md](DEPLOY_PRODUCTION.md)
- [PRODUCTION_DEPLOY_CHECKLIST.md](PRODUCTION_DEPLOY_CHECKLIST.md)

---

## 数据库设计

### photos 表

存储照片的元数据信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键，自动生成 |
| title | TEXT | 照片标题 |
| location | TEXT | 地理位置描述 |
| country | TEXT | 国家 |
| category | TEXT | 分类（featured/latest/random/nearby/far） |
| tags | TEXT | 标签（JSON 字符串） |
| image_url | TEXT | 图片 URL |
| thumbnail_url | TEXT | 缩略图 URL |
| latitude | DECIMAL | 纬度 |
| longitude | DECIMAL | 经度 |
| altitude | DECIMAL | 海拔 |
| focal | TEXT | 焦距 |
| aperture | TEXT | 光圈 |
| shutter | TEXT | 快门速度 |
| iso | TEXT | ISO 感光度 |
| camera | TEXT | 相机型号 |
| lens | TEXT | 镜头型号 |
| rating | INTEGER | 评分（1-5） |
| shot_date | DATE | 拍摄日期 |
| status | TEXT | 状态（pending/approved/rejected） |
| hidden | BOOLEAN | 是否隐藏 |
| reject_reason | TEXT | 拒绝原因 |
| likes | INTEGER | 点赞数 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### brand_settings 表

存储品牌配置信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键，自动生成 |
| logo_url | TEXT | Logo URL |
| brand_text | TEXT | 品牌文案 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 索引建议

```sql
-- 照片状态索引（用于快速查询待审核照片）
CREATE INDEX idx_photos_status ON photos(status);

-- 照片分类索引
CREATE INDEX idx_photos_category ON photos(category);

-- 照片创建时间索引（用于排序）
CREATE INDEX idx_photos_created_at ON photos(created_at DESC);

-- 地理位置索引（用于附近照片查询）
CREATE INDEX idx_photos_location ON photos(latitude, longitude);
```

### Row Level Security (RLS)

如果使用 Supabase，建议配置 RLS 策略：

```sql
-- 允许所有人读取已审核的照片
CREATE POLICY "Public photos are viewable by everyone"
ON photos FOR SELECT
USING (status = 'approved' AND hidden = false);

-- 允许认证用户插入照片
CREATE POLICY "Users can insert photos"
ON photos FOR INSERT
WITH CHECK (true);

-- 允许认证用户更新自己的照片
CREATE POLICY "Users can update photos"
ON photos FOR UPDATE
USING (true);
```

---

## 常见问题

### 安装和启动

#### Q: npm install 失败？

**A:** 可能的原因：
1. Node.js 版本过低，需要 >= 18.0.0
2. 网络问题，尝试使用国内镜像：
   ```bash
   npm config set registry https://registry.npmmirror.com
   ```
3. 清除缓存后重试：
   ```bash
   npm cache clean --force
   ```

#### Q: 前端启动后页面空白？

**A:** 检查：
1. 浏览器控制台是否有错误
2. 环境变量是否配置正确
3. Supabase 配置是否正确
4. 网络连接是否正常

#### Q: 后端启动失败？

**A:** 检查：
1. 端口是否被占用（默认 3001）
2. `.env` 文件是否存在且配置正确
3. 依赖是否安装完整

### 功能问题

#### Q: 图片上传失败？

**A:** 可能的原因：
1. 文件大小超过限制（默认 15MB）
2. 文件类型不支持（仅支持 JPG/PNG/GIF/WebP/HEIC）
3. 后端服务器未启动
4. OSS 配置错误（如果使用 OSS）
5. 网络连接问题

#### Q: EXIF 数据读取失败？

**A:** 检查：
1. 图片是否包含 EXIF 数据
2. 浏览器是否支持 FileReader API
3. 图片格式是否支持（HEIC 需要特殊处理）

#### Q: 地图不显示？

**A:** 检查：
1. 高德地图 API Key 是否配置
2. API Key 是否有效
3. 网络连接是否正常
4. 浏览器控制台是否有错误

#### Q: 登录失败？

**A:** 检查：
1. 用户名和密码是否正确
2. 后端服务器是否运行
3. JWT_SECRET 是否配置
4. 浏览器控制台是否有错误

### 部署问题

#### Q: GitHub Pages 部署后页面 404？

**A:** 检查：
1. `vite.config.js` 中的 `base` 配置是否正确
2. 如果使用子路径，需要配置为 `/repository-name/`
3. 路由是否使用 HashRouter

#### Q: 后端部署后无法访问？

**A:** 检查：
1. 端口配置是否正确
2. 防火墙规则是否允许
3. CORS 配置是否正确
4. 环境变量是否配置

#### Q: 图片无法显示？

**A:** 检查：
1. OSS Bucket 是否设置为公共读
2. CORS 配置是否正确
3. 图片 URL 是否正确
4. CDN 是否生效

### 数据问题

#### Q: 数据库连接失败？

**A:** 检查：
1. Supabase URL 和 Key 是否正确
2. 网络连接是否正常
3. Supabase 项目是否正常运行
4. RLS 策略是否配置正确

#### Q: 数据丢失？

**A:** 
1. 检查 Supabase 数据库中的数据
2. 检查 LocalStorage（如果使用本地存储）
3. 检查是否有备份
4. 查看日志文件

### 性能问题

#### Q: 页面加载慢？

**A:** 优化建议：
1. 启用图片懒加载
2. 使用 CDN 加速
3. 压缩图片大小
4. 检查网络连接

#### Q: 上传速度慢？

**A:** 可能的原因：
1. 图片文件过大，建议压缩
2. 网络带宽限制
3. OSS 区域选择不当
4. 服务器性能限制

---

## 贡献指南

### 如何贡献

1. **Fork 项目**
2. **创建功能分支**：`git checkout -b feature/AmazingFeature`
3. **提交更改**：`git commit -m 'Add some AmazingFeature'`
4. **推送到分支**：`git push origin feature/AmazingFeature`
5. **提交 Pull Request**

### 代码规范

- 使用 ESLint 进行代码检查
- 遵循 React 最佳实践
- 编写清晰的注释
- 保持代码简洁

### 提交信息规范

使用清晰的提交信息：

```
feat: 添加新功能
fix: 修复 bug
docs: 更新文档
style: 代码格式调整
refactor: 代码重构
test: 添加测试
chore: 构建过程或辅助工具的变动
```

### 问题反馈

如果发现问题，请：
1. 检查是否已有相关 Issue
2. 创建新 Issue，描述问题
3. 提供复现步骤
4. 提供错误日志（如有）

---

## 更新日志

### v1.0.0 (当前版本)

#### 功能
- ✅ 照片上传（文件/URL）
- ✅ EXIF 数据提取
- ✅ 地理位置标记
- ✅ 照片审核流程
- ✅ 图库展示
- ✅ 地图探索
- ✅ 管理后台
- ✅ 品牌定制
- ✅ 多种存储支持（本地/OSS/WebDAV）

#### 技术
- ✅ React 19 + Vite 7
- ✅ Supabase 集成
- ✅ 阿里云 OSS 支持
- ✅ JWT 认证
- ✅ 代码分割优化
- ✅ 错误处理机制

---

## 许可证

MIT License

---

## 致谢

感谢以下开源项目：

- [React](https://react.dev/) - UI 框架
- [Vite](https://vite.dev/) - 构建工具
- [Supabase](https://supabase.com/) - 后端即服务
- [MapLibre GL](https://maplibre.org/) - 地图库
- [EXIFR](https://mutiny.cz/exifr/) - EXIF 读取库
- [Express](https://expressjs.com/) - Web 框架

---

## 联系方式

- **项目地址**：GitHub Repository
- **问题反馈**：GitHub Issues
- **文档**：项目 Wiki

---

**最后更新**：2025年12月

**文档版本**：1.0.0

