# Pic4Pick

一个现代化的照片管理和展示平台，支持照片上传、审核、分类展示和地理位置探索。

## ✨ 功能特性

### 📸 照片管理
- **照片上传**：支持文件上传和 URL 导入
- **EXIF 读取**：自动提取相机参数（焦距、光圈、快门、ISO 等）
- **地理位置**：支持 GPS 坐标和地图选择
- **分类管理**：精选、最新、随览、附近、远方等多种分类
- **审核流程**：待审核、已审核、已拒绝三种状态

### 🎨 前端展示
- **响应式设计**：适配桌面和移动设备
- **图库视图**：网格布局，支持懒加载
- **发现视图**：基于地图的地理位置探索
- **品牌定制**：可自定义 Logo 和标题文案
- **照片详情**：查看完整的 EXIF 信息和地理位置

### ⚙️ 管理后台
- **照片审核**：通过/拒绝/重新提交
- **批量操作**：导出/导入 JSON 数据
- **环境配置**：Supabase、高德地图等 API 配置
- **品牌设置**：Logo 和标题文案管理
- **工具面板**：图片压缩等实用工具

### 🔧 技术特性
- **多种存储**：支持本地存储、Supabase、阿里云 OSS
- **代码分割**：优化加载性能
- **错误处理**：完善的错误边界和日志系统
- **类型安全**：TypeScript 支持（可选）

## 🚀 快速开始

### 前置要求

- Node.js >= 18.0.0
- npm >= 9.0.0

### 安装和启动

```bash
# 1. 克隆项目
git clone <repository-url>
cd Pic4Pick

# 2. 安装前端依赖
npm install

# 3. 安装后端依赖
cd server
npm install

# 4. 配置环境变量（可选）
cp .env.example .env
# 编辑 .env 文件，配置 Supabase、OSS 等

# 5. 启动开发服务器
# 终端 1：启动前端
npm run dev

# 终端 2：启动后端
cd server
npm run dev
```

### 访问应用

- **前端**：http://localhost:5173
- **后端 API**：http://localhost:3001
- **管理后台**：http://localhost:5173/#/admin

### 默认登录信息

- **管理员密码**：`pic4pick-admin`（可在 `.env.local` 中配置）

⚠️ **生产环境请务必修改默认密码！**

## 📁 项目结构

```
Pic4Pick/
├── src/                    # 前端源代码
│   ├── components/        # React 组件
│   │   ├── admin/         # 管理后台组件
│   │   └── ...            # 其他组件
│   ├── pages/             # 页面组件
│   │   ├── Admin.jsx     # 管理后台
│   │   └── Gallery.jsx    # 图库展示
│   ├── hooks/             # 自定义 Hooks
│   ├── utils/             # 工具函数
│   ├── constants/         # 常量定义
│   └── App.jsx            # 应用入口
│
├── server/                 # 后端服务器
│   ├── server-enhanced.js # 增强版服务器（推荐）
│   ├── server.js          # 原始服务器
│   ├── package.json       # 后端依赖
│   └── uploads/           # 上传文件存储
│
├── supabase/               # Supabase 迁移文件
│   └── migrations/        # 数据库迁移脚本
│
├── public/                 # 静态资源
├── dist/                   # 构建输出
└── docs/                   # 文档目录
    ├── API.md              # API 文档
    ├── DEVELOPMENT.md      # 开发指南
    └── DEPLOYMENT.md       # 部署指南
```

## 🔑 环境变量配置

### 前端环境变量（`.env.local`）

```env
# Supabase 配置
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# 高德地图 API Key
VITE_AMAP_KEY=your-amap-key

# 管理员密码
VITE_ADMIN_PASSWORD=your-secure-password
```

### 后端环境变量（`server/.env`）

```env
# 服务器配置
PORT=3001
NODE_ENV=development
JWT_SECRET=your-jwt-secret

# 阿里云 OSS（可选）
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=your-bucket
ALIYUN_OSS_ACCESS_KEY_ID=your-key-id
ALIYUN_OSS_ACCESS_KEY_SECRET=your-secret
```

## 📚 文档

- **[API 文档](docs/API.md)** - 完整的 API 接口说明
- **[开发指南](docs/DEVELOPMENT.md)** - 开发环境搭建和代码规范
- **[部署指南](docs/DEPLOYMENT.md)** - 生产环境部署说明
- **[快速开始](QUICK_START.md)** - 快速启动指南
- **[阿里云 OSS 配置](ALIYUN_OSS_SETUP.md)** - OSS 存储配置

## 🛠️ 技术栈

### 前端
- **React 19** - UI 框架
- **Vite** - 构建工具
- **React Router** - 路由管理
- **MapLibre GL** - 地图组件
- **EXIFR** - EXIF 数据读取

### 后端
- **Node.js** - 运行环境
- **Express** - Web 框架
- **Winston** - 日志系统
- **JWT** - 身份认证

### 存储
- **Supabase** - 后端即服务（BaaS）
- **阿里云 OSS** - 对象存储
- **LocalStorage** - 本地存储（开发模式）

## 🎯 主要功能模块

### 1. 照片上传
- 支持文件选择和拖拽上传
- 自动读取 EXIF 信息
- 支持 URL 导入
- 图片压缩和优化

### 2. 照片审核
- 待审核列表
- 通过/拒绝操作
- 重新提交功能
- 批量操作

### 3. 图库展示
- 多种分类视图
- 响应式网格布局
- 照片详情查看
- 地理位置展示

### 4. 发现模式
- 地图可视化
- 地理位置探索
- 城市/省份筛选
- 距离计算

## 🔒 安全特性

- JWT 身份认证
- 环境变量管理
- 文件类型验证
- 文件大小限制
- CORS 配置
- 错误处理和安全日志

## 📦 构建和部署

### 开发构建

```bash
npm run dev
```

### 生产构建

```bash
npm run build
```

构建输出在 `dist/` 目录。

### 预览构建

```bash
npm run preview
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- [React](https://react.dev/)
- [Vite](https://vite.dev/)
- [Supabase](https://supabase.com/)
- [MapLibre GL](https://maplibre.org/)
- [EXIFR](https://mutiny.cz/exifr/)

---

**Pic4Pick** - 用照片记录生活，用技术展示美好 📸
