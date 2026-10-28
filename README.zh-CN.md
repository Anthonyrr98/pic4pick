# Pic4Pick · Light of Anthony

[English](./README.md) | **简体中文**

[![Deploy to GitHub Pages](https://github.com/Anthonyrr98/pic4pick/actions/workflows/deploy.yml/badge.svg)](https://github.com/Anthonyrr98/pic4pick/actions/workflows/deploy.yml)
[![Supabase Keepalive](https://github.com/Anthonyrr98/pic4pick/actions/workflows/supabase-keepalive.yml/badge.svg)](https://github.com/Anthonyrr98/pic4pick/actions/workflows/supabase-keepalive.yml)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)

Pic4Pick 是 **Light of Anthony** 的摄影作品集与内容管理系统。项目提供响应式图库、高清灯箱、地理位置探索、EXIF 信息展示和受保护的管理后台，并将公开数据、管理操作和图片存储分离部署。

**在线访问：** [https://pic.rlzhao.com](https://pic.rlzhao.com)

![Light of Anthony 摄影档案](./public/og-image.png)

## 功能特性

- 响应式摄影图库，适配桌面、iPad 和手机
- 最新、随览、附近、远方、胶片五种作品浏览方式
- 页头与图库共用当前浏览列表第一张照片的模糊背景，随筛选切换
- 纸白画廊与暖调胶片两套全局主题，保存访客的外观偏好（[说明](./docs/global-themes.md)）
- 保留原始宽高比的高清灯箱预览
- 可开关的空间场景：SharpDepth + UniDepth 在 GPU 后台预计算景深，支持鼠标、手机倾斜与拖动视差（[说明](./docs/spatial-scenes.md)）
- 支持键盘、触摸滑动和无障碍对话框操作
- 地图发现视图，支持城市作品集、地点标记与可配置地图样式
- EXIF、拍摄日期、器材和胶片信息展示
- 胶片图库卡片与灯箱按胶卷类型自动匹配边框
- 管理员登录、作品上传、审核、重新提交、编辑、隐藏和删除
- 品牌文案与 Logo 定制、相机和镜头预设、JSON 导入导出
- 支持最大 100 MB 的原图上传
- 上传时生成最长边 2000 px、JPEG 质量 90 的高清预览
- 原图与预览图分别存储在阿里云 OSS
- Supabase Row Level Security（RLS）与服务端管理 API
- 点赞原子更新、可选 SMTP 邮件通知、接口限流和基础安全响应头
- 阿里云 OSS + CDN 发布、GitHub Pages 备用站点与 Render 后端部署

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 19、Vite 7、JavaScript / TypeScript、React Router、i18next、GSAP |
| 地图 | MapLibre GL、高德地图 Web API |
| 图片元数据 | exifr |
| 数据库 | Supabase Postgres、PostgREST、RLS |
| 后端 | Node.js、Express 5、Sharp、Multer、JWT、Nodemailer |
| 空间场景 | SharpDepth + UniDepth GPU worker、WebGL 景深重投影 |
| 图片存储 | 阿里云 OSS |
| 前端托管 | 阿里云北京 OSS + CDN；GitHub Pages 备用 |
| 后端托管 | Render |
| 自动化 | GitHub Actions、Playwright、ESLint |

## 系统架构

```text
Browser
  ├─ Aliyun CDN → Beijing OSS ─ React / Vite frontend
  ├─ Supabase Data API ──────── public approved photos (read only)
  ├─ Render API ─────────────── admin auth, writes, likes, uploads
  │    ├─ Supabase service role ─ protected database operations
  │    └─ Signed depth URLs ── approved, visible photos only
  └─ Aliyun OSS
       ├─ origin/YYYY/MM/DD/ ── original files
       ├─ ore/hd/YYYY/MM/DD/ ── 2000 px lightbox previews
       └─ spatial-depth/ ───── private precomputed depth maps

Owner's GPU worker → Supabase job queue → SharpDepth + UniDepth → private OSS
```

公开页面使用 Supabase publishable/anon key 读取已审核且未隐藏的作品。
所有管理写操作均通过 Render 后端完成，`SUPABASE_SERVICE_ROLE_KEY`
和阿里云 OSS AccessKey 不会发送到浏览器。

## 目录结构

```text
.
├─ .github/workflows/       # Pages / OSS 部署与 Supabase 定时访问
├─ docs/                    # 架构、主题、空间场景与部署说明
├─ public/                  # 静态资源、站点图标与社交分享图片
├─ scripts/                 # 回归检查、OSS 发布脚本与 GPU worker
├─ server/                  # Express API、图片处理与 OSS 上传
├─ src/
│  ├─ components/           # 通用界面组件
│  ├─ hooks/                # 上传、地图、品牌等业务 hooks
│  ├─ pages/                # 图库与管理后台
│  ├─ themes/               # 主题变量、切换与动效
│  └─ utils/                # 认证、Supabase、存储与安全工具
├─ supabase/
│  ├─ functions/            # 可选 Edge Functions
│  └─ migrations/           # 数据库迁移与 RLS 策略
├─ render.yaml              # Render Blueprint
└─ vite.config.js           # Vite 构建与本地代理
```

## 环境要求

- 建议使用 Node.js 22.12 或更高版本，覆盖前端、OSS 发布与 GPU worker
- npm 10 或更高版本
- 一个 Supabase 项目
- 一个阿里云 OSS Bucket
- 可选：Supabase CLI，用于数据库迁移和 Advisors
- 可选：兼容的 GPU，以及单独配置的 Python 与模型运行环境，用于预计算景深（[配置说明](./docs/spatial-scenes.md)）

网页前端也支持 Vite 要求的 Node.js 20.19+。访客浏览图库和查看已有空间结果，无需运行 GPU worker 或下载模型。

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
npm --prefix server ci
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

可选的点赞邮件 SMTP 配置见 [`server/README.md`](./server/README.md)。复制示例文件时使用当前终端的复制命令；PowerShell 可运行 `Copy-Item server/.env.example server/.env`。

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

以上两条启动命令均在仓库根目录运行。生产构建需在 `.env.production` 中将 `VITE_API_BASE_URL` 设置为已部署后端的完整 HTTPS 地址；构建会拒绝缺失、本地或非 HTTPS 地址。生产配置会覆盖本地开发地址。

## 数据库配置

完整基础结构位于
[`docs/schema_domestic_postgres.sql`](./docs/schema_domestic_postgres.sql)，后续变更位于
[`supabase/migrations`](./supabase/migrations)。首次部署时先执行基础结构，
再按文件名顺序执行迁移，并确认所有公开 schema 表都启用了 RLS。已有数据库只应用尚未执行的变更。

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
7. 客户端通过受保护的管理 API 提交元数据，后端使用 Supabase `service_role` 保存作品记录。

后端单独保留收到的文件字节，生成预览不会重新编码这份文件。上传表单可以在发送前优化大文件；需要未压缩的源文件时，应选择保留原图。“下载原图”指向实际存储的上传文件。

上传使用稳定的提交 ID 与 SHA-256 指纹支持失败重试。删除作品时清理图片资源并删除关联景深记录；未被引用的景深文件由在线 GPU worker 后续清理。

## 图库背景与胶片边框

在最新、随览、附近和远方模式下，页头与图库共用当前列表第一张照片的模糊背景，切换浏览方式时同步更新。普通灯箱面板以当前打开的照片作为背景色调来源；胶片模式使用独立的桌面背景。

胶片图库卡片与灯箱使用相同的胶卷类型映射：

| 胶卷类型 | 边框素材 |
| --- | --- |
| `Fuji C200` | [`public/film-frames/fuji-c200.png`](./public/film-frames/fuji-c200.png) |
| `Kodak Gold 200` | [`public/film-frames/kodak-gold-200.png`](./public/film-frames/kodak-gold-200.png) |
| `富士一次性相机` / `FUJIFILM SIMPLE ACE 400` | [`public/film-frames/fuji-simple-ace.png`](./public/film-frames/fuji-simple-ace.png) |

上传或编辑胶片照片时，选择胶片分类并保留正确的胶卷类型：前端字段为 `filmStock`，存储字段为 `film_stock`，同时兼容已有的 `film_stock:` 标签。新照片会自动使用对应边框，无需按照片 ID 单独设置；其他胶卷暂用默认边框。

边框只使用素材的胶片边缘，中间的不透明区域不会覆盖照片。横竖照片均保留完整画面与原始宽高比，竖图将边框旋转，使齿孔位于左右两侧。胶片灯箱将分类与胶卷信息放在相机、镜头卡片下方，并隐藏喜欢次数卡片。

新增胶卷素材时，在 [`FilmFrame.tsx`](./src/pages/gallery/components/FilmFrame.tsx) 的 `getFilmFrameStock` 和素材配置中扩展映射，并在 [`darkroom.css`](./src/themes/darkroom.css) 中适配横竖方向的图库与灯箱尺寸。上传及边框维护约定见 [`AGENTS.md`](./AGENTS.md)。

## 空间场景

作品保存后，数据库触发器创建景深任务。拥有者电脑上的 GPU worker 主动领取任务，运行 SharpDepth + UniDepth，并将私有景深图保存到 OSS。后端确认作品已审核且未隐藏后，签发有效期五分钟的链接。

浏览器读取照片和预计算景深，使用 WebGL 渲染。当前灯箱照片会预加载景深，最多缓存三份结果。电脑离线时，新任务保留在队列，已完成结果仍可访问；景深未就绪或 WebGL 不可用时，仍可正常查看照片。

这是一张照片的 2.5D 效果，无法还原被遮挡的背景。worker 需要单独准备 Python 环境和模型权重，单独执行 `npm ci` 不会安装它们。数据库迁移、运行环境、模型许可及启动方式见[空间场景说明](./docs/spatial-scenes.md)。

## 微信小程序：开发中

正在本地工作区开发独立的 Taro 4.3 + React 18 + TypeScript 客户端，工程位于 `miniapp/`，共享业务逻辑位于 `packages/shared/`。这两个目录尚未提交到公开仓库，克隆当前版本得到的是网页与后端工程。

当前实现涵盖图库、主题、详情、原生地图发现、管理流程与空间 Canvas。已开展公开图库、详情、地图切换和空间渲染的模拟器验证；完整真机测试、管理员认证后的读写及上传、正式域名配置与完整功能和视觉验收仍在进行。

后端已提供兼容微信的 `POST /api/photos/:id/likes` 和 `POST /api/admin/photos/:id/update`，保留网页使用的 PATCH 接口。小程序目前尚未正式发布。

## 可用命令

### 前端

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 生成生产构建 |
| `npm run preview` | 本地预览生产构建 |
| `npm run lint` | 运行 ESLint |
| `npm run test:ui` | 运行 Playwright UI 回归 |
| `npm run test:themes` | 验证主题切换、偏好保存与布局 |
| `npm run test:maps` | 验证城市飞行与地图交互 |
| `npm run test:spatial` | 验证空间输入、缓存逻辑与 WebGL 界面 |
| `npm run test:admin` | 验证提交、重试、重新提交与删除 |
| `npm run test:admin:ui` | 验证管理后台交互 |
| `npm run test:likes` | 验证点赞与通知行为 |
| `npm run spatial:worker` | 启动已配置的 GPU 景深 worker |
| `npm run deploy:oss -- --dry-run` | 校验前端 OSS 发布配置与文件 |
| `npm run deploy:oss` | 将构建产物发布至独立的前端 OSS Bucket |
| `npm run server` | 从根目录启动后端开发服务 |

### 后端

| 命令 | 说明 |
| --- | --- |
| `npm start` | 启动生产服务器 |
| `npm run dev` | 使用 watch 模式启动服务器 |
| `npm run previews:rebuild` | 为历史 OSS 原图重建高清预览 |
| `npm run mail:test` | 检查 SMTP 连接与认证配置 |

后端命令在 `server/` 中运行，也可以在根目录使用 `npm --prefix server run <script>`。

## 测试与质量检查

首次使用 Playwright 时运行 `npx playwright install chromium` 安装 Chromium。浏览器回归前，先在另一个终端启动 `npm run dev`；默认访问 `http://127.0.0.1:5173`，可用 `UI_BASE_URL` 覆盖。基础 UI 回归需要图库中有可见照片。空间 UI 测试使用受控预计算结果，不验证真实 GPU 推理。

根据改动范围运行相应检查：

```bash
npm run lint
npm run build
npm run test:ui
npm run test:themes
npm run test:maps
npm run test:spatial
npm run test:admin
npm run test:admin:ui
npm run test:likes
npm audit --omit=dev
npm --prefix server audit --omit=dev
```

UI 回归覆盖图库加载、键盘灯箱、横竖图比例、iPad 布局、手机双列布局、地图切换和后台登录页。

## 部署

### 前端：北京 OSS + 阿里云 CDN

主要站点使用独立的北京 OSS Bucket 与阿里云 CDN，字体随应用发布。发布命令和 CDN 配置见[阿里云部署说明](./docs/aliyun-frontend-deployment.md)。[OSS 工作流](./.github/workflows/deploy-oss.yml) 仅在仓库变量 `OSS_FRONTEND_ENABLED=true` 时执行，支持推送到 `main` 和手动触发。照片存储使用另一个 Bucket。

### 前端：GitHub Pages

推送到 `main` 后，
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
会自动安装依赖、构建并发布 `dist`。在 GitHub Actions Secrets 中配置以下变量：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`
- 地图功能所需的 `VITE_AMAP_*`
- 可选的 `VITE_USE_OSS_MEDIA_PROXY`

地图外观通过仓库变量 `VITE_MAP_STYLE_PRESET` 和 `VITE_AMAP_MAP_STYLE` 配置；当前工作流启用高德 JS SDK。

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
可选点赞邮件功能还需要后端 SMTP 凭据，见 [`server/.env.example`](./server/.env.example)。

## 相关文档

| 文档 | 内容 |
| --- | --- |
| [全局主题](./docs/global-themes.md) | 纸白画廊、暖调胶片、偏好保存与动效 |
| [空间场景](./docs/spatial-scenes.md) | GPU 队列、私有景深存储、签名链接与模型环境 |
| [阿里云前端部署](./docs/aliyun-frontend-deployment.md) | OSS + CDN 配置、发布与回退 |
| [后端说明](./server/README.md) | API 配置与点赞邮件通知 |
| [Supabase CLI 官方参考](https://supabase.com/docs/reference/cli/introduction) | CLI 使用说明 |

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
