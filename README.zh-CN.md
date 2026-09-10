# Pic4Pick · Light of Anthony

[English](./README.md) | **简体中文**

[![Deploy to GitHub Pages](https://github.com/Anthonyrr98/pic4pick/actions/workflows/deploy.yml/badge.svg)](https://github.com/Anthonyrr98/pic4pick/actions/workflows/deploy.yml)
[![Supabase Keepalive](https://github.com/Anthonyrr98/pic4pick/actions/workflows/supabase-keepalive.yml/badge.svg)](https://github.com/Anthonyrr98/pic4pick/actions/workflows/supabase-keepalive.yml)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)

Pic4Pick 是 **Light of Anthony** 的开源摄影作品集与内容管理系统。项目提供响应式图库、高清灯箱、地理位置探索、EXIF 信息展示和受保护的管理后台，并将公开数据、管理操作和图片存储分离部署。

**在线访问：** [https://pic.rlzhao.com](https://pic.rlzhao.com)

![Light of Anthony 摄影档案](./public/og-image.png)

## 功能特性

- 响应式摄影图库，适配桌面、iPad 和手机
- 按精选、时间、距离、胶片等维度筛选作品
- 保留原始宽高比的高清灯箱预览
- 支持键盘、触摸滑动和无障碍对话框操作
- 地图与地理位置探索视图
- EXIF、拍摄日期、器材和胶片信息展示
- 管理员登录、作品上传、审核、编辑和删除
- 支持最大 100 MB 的原图上传
- 上传时生成最长边 2000 px、JPEG 质量 90 的高清预览
- 原图与预览图分别存储在阿里云 OSS
- Supabase Row Level Security（RLS）与服务端管理 API
- 点赞原子更新、接口限流和基础安全响应头
- GitHub Pages 与 Render 自动部署

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 19、Vite 7、React Router、i18next |
| 地图 | MapLibre GL、高德地图 Web API |
| 图片元数据 | exifr |
| 数据库 | Supabase Postgres、PostgREST、RLS |
| 后端 | Node.js、Express 5、Sharp、Multer、JWT |
| 图片存储 | 阿里云 OSS |
| 前端托管 | GitHub Pages |
| 后端托管 | Render |
| 自动化 | GitHub Actions、Playwright、ESLint |

## 系统架构

```text
Browser
  ├─ GitHub Pages ───────────── React / Vite frontend
  ├─ Supabase Data API ──────── public approved photos (read only)
  ├─ Render API ─────────────── admin auth, writes, likes, uploads
  │    └─ Supabase service role ─ protected database operations
  └─ Aliyun OSS
       ├─ origin/YYYY/MM/DD/ ── original files
       └─ ore/hd/YYYY/MM/DD/ ── 2000 px lightbox previews
```

公开页面使用 Supabase publishable/anon key 读取已审核且未隐藏的作品。
所有管理写操作均通过 Render 后端完成，`SUPABASE_SERVICE_ROLE_KEY`
和阿里云 OSS AccessKey 不会发送到浏览器。

## 目录结构

```text
.
├─ .github/workflows/       # GitHub Pages 部署与 Supabase 定时访问
├─ public/                  # 静态资源、站点图标与社交分享图片
├─ scripts/                 # UI 与兼容性回归测试
├─ server/                  # Express API、图片处理与 OSS 上传
├─ src/
│  ├─ components/           # 通用界面组件
│  ├─ hooks/                # 上传、地图、品牌等业务 hooks
│  ├─ pages/                # 图库与管理后台
│  └─ utils/                # 认证、Supabase、存储与安全工具
├─ supabase/
│  ├─ functions/            # 可选 Edge Functions
│  └─ migrations/           # 数据库迁移与 RLS 策略
├─ render.yaml              # Render Blueprint
└─ vite.config.js           # Vite 构建与本地代理
```

## 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- 一个 Supabase 项目
- 一个阿里云 OSS Bucket
- 可选：Supabase CLI，用于数据库迁移和 Advisors

## 本地开发

### 1. 克隆仓库

```bash
git clone https://github.com/Anthonyrr98/pic4pick.git
cd pic4pick
```

### 2. 安装前端依赖

```bash
npm ci
```

### 3. 配置前端环境变量

在项目根目录创建 `.env.local`：

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
VITE_API_BASE_URL=http://localhost:3002

# 地图功能需要时配置
VITE_AMAP_KEY=
VITE_AMAP_WEB_KEY=
VITE_AMAP_SECURITY_JS_CODE=
VITE_AMAP_WEB_SERVICE_KEY=

# OSS 图片无法直接访问时可启用后端媒体代理
VITE_USE_OSS_MEDIA_PROXY=false
```

> `VITE_*` 变量会被编译进浏览器代码。不要在其中放置 Supabase `service_role`、数据库密码或 OSS AccessKey Secret。

### 4. 配置后端

```bash
cd server
npm ci
```

复制 `server/.env.example` 为 `server/.env`，然后填写真实配置：

```dotenv
PORT=3002
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

JWT_SECRET=replace-with-at-least-32-random-characters
ADMIN_USERNAME=your-admin-username
ADMIN_PASSWORD=replace-with-a-strong-password

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

ALIYUN_OSS_REGION=oss-cn-beijing
ALIYUN_OSS_BUCKET=your-bucket
ALIYUN_OSS_ACCESS_KEY_ID=your-access-key-id
ALIYUN_OSS_ACCESS_KEY_SECRET=your-access-key-secret
```

生产环境会拒绝默认管理员凭据、少于 32 位的 JWT Secret、少于 12 位的管理员密码以及通配符 CORS。

### 5. 启动开发服务

在两个终端中分别运行：

```bash
# Terminal 1: frontend
npm run dev
```

```bash
# Terminal 2: backend
npm run server
```

打开 [http://localhost:5173](http://localhost:5173)。管理后台位于 [http://localhost:5173/#/admin](http://localhost:5173/#/admin)。

## 数据库配置

完整基础结构位于
[`docs/schema_domestic_postgres.sql`](./docs/schema_domestic_postgres.sql)，后续变更位于
[`supabase/migrations`](./supabase/migrations)。首次部署时先执行基础结构，
再按文件名顺序执行迁移，并确认所有公开 schema 表都启用了 RLS。

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db query --linked --file docs/schema_domestic_postgres.sql
npx supabase db query --linked --file supabase/migrations/<migration-file>.sql
```

对每个迁移文件重复最后一条命令。当前仓库的早期迁移沿用了日期前缀，
尚未形成完整的 Supabase migration history；在整理历史版本之前，
不建议直接对新数据库运行 `supabase db push`。

应用迁移后运行安全和性能检查：

```bash
npx supabase db advisors --linked --type security
npx supabase db advisors --linked --type performance
```

当前权限模型：

- `anon`：只读公开、已审核且未隐藏的照片及公开品牌配置
- `authenticated`：不获得管理写权限
- `service_role`：仅在后端使用，执行管理写操作与原子点赞函数

## 图片上传流程

1. 管理员通过后端 API 登录并获取短期 JWT。
2. 浏览器以 `multipart/form-data` 将原图发送到 `/api/upload/oss`。
3. 后端验证 JWT、文件类型和 100 MB 大小限制。
4. 原始字节上传到 `origin/YYYY/MM/DD/`。
5. Sharp 根据 EXIF 方向旋转，并生成最长边 2000 px 的 JPEG 高清预览。
6. 预览图上传到 `ore/hd/YYYY/MM/DD/`。
7. 后端使用 Supabase `service_role` 保存作品记录。

原图不会因生成预览而被重新编码。“下载原图”始终指向保留的原始文件。

## 可用命令

### 前端

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 生成生产构建 |
| `npm run preview` | 本地预览生产构建 |
| `npm run lint` | 运行 ESLint |
| `npm run test:ui` | 运行 Playwright UI 回归 |
| `npm run server` | 从根目录启动后端开发服务 |

### 后端

| 命令 | 说明 |
| --- | --- |
| `npm start` | 启动生产服务器 |
| `npm run dev` | 使用 watch 模式启动服务器 |
| `npm run previews:rebuild` | 为历史 OSS 原图重建高清预览 |

## 测试与质量检查

提交前建议运行：

```bash
npm run lint
npm run build
npm run test:ui
npm audit --omit=dev
npm --prefix server audit --omit=dev
```

UI 回归覆盖图库加载、键盘灯箱、横竖图比例、iPad 布局、手机双列布局、地图切换和后台登录页。

## 部署

### 前端：GitHub Pages

推送到 `main` 后，
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
会自动安装依赖、构建并发布 `dist`。在 GitHub Actions Secrets 中配置以下变量：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`
- 地图功能所需的 `VITE_AMAP_*`
- 可选的 `VITE_USE_OSS_MEDIA_PROXY`

自定义域名由 [`public/CNAME`](./public/CNAME) 管理。

### 后端：Render

[`render.yaml`](./render.yaml) 定义了后端服务、健康检查和非敏感配置。以下敏感变量必须在 Render Dashboard 中设置：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALIYUN_OSS_REGION`
- `ALIYUN_OSS_BUCKET`
- `ALIYUN_OSS_ACCESS_KEY_ID`
- `ALIYUN_OSS_ACCESS_KEY_SECRET`

Render 使用 `/api/health` 进行健康检查，并在 `main` 更新后自动部署。

## Supabase 免费项目定时访问

[`supabase-keepalive.yml`](./.github/workflows/supabase-keepalive.yml)
每天三次读取公开表，用于维持正常的应用访问并尽早发现 Supabase 连接故障。
该工作流也支持在 GitHub Actions 中手动运行。

这项任务不能替代监控或付费可用性保证；对于需要稳定在线、备份或生产 SLA 的站点，应使用合适的付费方案。

## 安全设计

- 所有 Supabase 公开表均使用 RLS 和最小权限授权
- 管理写操作只允许通过受 JWT 保护的后端 API
- `service_role` 与 OSS Secret 只保存在后端环境变量中
- 登录和点赞接口具有请求限流
- 数据库使用原子函数更新点赞，避免并发覆盖
- 上传文件验证扩展名、MIME 类型和大小
- OSS 删除路径和管理查询字段均经过白名单校验
- 后端启用 HSTS、CSP、防 MIME 嗅探、防 iframe 嵌入等响应头
- 前端配置基础 CSP 与严格 Referrer Policy
- 生产环境 CORS 只允许明确配置的站点来源

发现安全问题时，请不要创建包含利用细节、密钥或用户数据的公开 Issue。请通过仓库所有者的 GitHub 主页私下联系，并在确认修复后再公开讨论。

## 运维建议

- 定期检查 GitHub Actions 和 Render 部署状态
- 定期运行 Supabase Security Advisor 与 Performance Advisor
- 定期轮换管理员密码、JWT Secret、Supabase service role 和 OSS AccessKey
- 保留数据库导出和 OSS 对象清单；Supabase 数据库备份不包含外部 OSS 文件
- 更新依赖后运行完整 UI 回归和 `npm audit`
- 修改图片预览规格后，为历史文件运行 `npm run previews:rebuild`

## 贡献

1. Fork 本仓库并创建功能分支。
2. 保持改动范围清晰，避免提交 `.env`、密钥、构建产物或个人数据。
3. 运行 lint、build 和 UI 回归。
4. 提交 Pull Request，并说明改动目的、验证方式和界面截图（如适用）。

## 许可证

本仓库当前未声明开源许可证。除非仓库所有者另行授权，否则保留所有权利。公开可见不等同于允许复制、修改或再分发。

## 维护者

Maintained by [Anthonyrr98](https://github.com/Anthonyrr98).
