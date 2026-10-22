# Pic4Pick 源码识别与微信小程序迁移分析报告

评估日期：2026-10-13。工作目录：F:/Github/pic4pick。基准分支：main；基准提交：2c69c670c751e934a16e4af190e4ca49ab6c4172。

本轮完成源码识别、依赖图检查、接口与数据库结构梳理、网页构建及本地单元测试。尚未创建小程序工程、改写应用源码、调用生产管理接口或修改数据库。以下迁移路线是实施方案，不是已经完成的小程序能力。

## 1. 结论

项目是 React 摄影作品集及内容管理系统，源码足以开展迁移。采用 Taro + React 最符合保留现有页面、状态逻辑、接口和数据库的要求；不建议将 React 界面改写为 Vue 或原生 WXML。

迁移应在独立工程中逐文件复制适配现有页面，保留品牌、色彩、排版、照片比例、主题、业务规则和后台流程，抽取平台无关代码复用。浏览器运行环境不等同于小程序；路由、DOM、文件、网络、地图和 Canvas 必须有平台实现。

两个已经确认的关键问题：

1. 原网页 React 19.2.8 不能直接套入当前已核实的官方 Taro 4.3.0 React 运行时。npm 官方元数据中，@tarojs/react 与 @tarojs/plugin-framework-react 的 React peerDependencies 均为 ^18。小程序应采用独立的 React 18 依赖，网页保留 React 19。扫描未发现项目使用 React 19 专有的新 Hooks；但仍需构建和真机验证。
2. 原点赞、作品编辑接口是 PATCH。微信官方 wx.request 方法合法值不包含 PATCH。单纯将 fetch 改为 Taro.request 会丢失这些能力；必须增加兼容入口或独立转发层，同时保留原有 PATCH 接口及数据库业务。

## 2. 技术栈识别

| 层级 | 源码识别结果 |
| --- | --- |
| 前端框架 | React / React DOM 19.2.8，函数组件与 Hooks |
| 构建 | Vite，声明范围 ^7.2.4，本机与锁文件实际为 7.3.6；@vitejs/plugin-react 5.2.0 |
| 语言 | JS、JSX、TS、TSX 混合；不是完整 TypeScript 项目 |
| 路由 | react-router-dom 7.18.3，HashRouter，两个顶层路由 |
| 动画 | GSAP 3.15.0、@gsap/react 2.1.2，主题切换及浏览器效果 |
| 样式 | 手写 CSS；App.css、index.css、themes.css、组件 CSS；未使用 Tailwind/Ant Design 主界面 |
| 字体 | Playfair Display、Noto Sans SC Variable |
| 地图 | MapLibre GL 6.9.0、高德地图 Web JS API 2.0；环境参数决定提供者 |
| 图片元数据 | exifr 7.1.3 |
| 日期控件 | react-datepicker 9.1.0；直接使用 date-fns/locale |
| 数据访问 | @supabase/supabase-js 2.116.0、PostgREST REST 数据服务 |
| 后端 | Node.js ESM、Express 5.2.1；实际启动入口 server/server-enhanced.js |
| 管理登录 | 自有账号密码接口 + jsonwebtoken 9.0.3；不是 Supabase Auth / 微信登录 |
| 图片上传 | Multer 2.3.0、Sharp 0.35.4、ali-oss 6.23.0 |
| 数据库 | Supabase PostgreSQL，RLS、服务端 service_role、RPC、触发器 |
| 图片存储 | 阿里云 OSS 原图与高清预览；私有深度图也已支持 OSS |
| 后台附属能力 | Winston 日志、Nodemailer 点赞邮件、上传/删除持久化清理 |
| 空间推理 | 本机 GPU worker + Python SharpDepth / UniDepth；不是浏览器或手机推理 |
| 部署 | Render 后端配置；OSS/CDN 网页部署；GitHub Pages 备用配置 |
| 现有验证 | ESLint、Node 原生单元测试、Playwright 网页 smoke 脚本 |

i18next、react-i18next、nanoid 等虽然列于依赖表，但本次入口依赖图未显示其在当前页面直接使用。不能仅凭安装依赖推断存在多语言切换功能。

本机 Node 24.11.1、npm 11.6.2；网页 CI 使用 Node 22。后续小程序工程会单独锁定兼容的 Node、Taro、React 和构建插件版本，不直接复制网页的构建依赖集合。

## 3. 页面、路由和组件

### 实际入口

- src/main.jsx：加载全局样式与主题，初始化品牌 favicon，React DOM createRoot。
- src/App.jsx：启动动效、ErrorBoundary、HashRouter、lazy 页面加载。
- / → src/pages/Gallery.jsx → src/pages/gallery/GalleryPage.jsx。
- /admin → src/pages/Admin.jsx。

### 两个路由之下的实际视图

公开页：
- 图库视图。
- “发现”地图视图，省份/城市分组、地点卡片及地图联动。
- 图片灯箱与拍摄参数、地点/海拔面板。
- 地点照片面板。
- 空间场景模式、主题弹层。

管理页：
- 登录视图与 token 校验。
- 上传。
- 待审核。
- 已发布。
- 已拒绝。
- 配置：环境参数、地图样式、Logo、品牌标题。
- 编辑作品、上传/编辑地图选点、单个/批量删除确认等弹窗。

实际管理页约 5014 行，图库主实现约 1068 行。页面数少不代表工作量小；管理流程与复杂组件集中在两个页面中。

### 活跃组件关系

- GalleryPage：PhotoGrid、TabStrip、LocationPanel、PhotoLocationMap、ExploreView、ThemeSwitcher、SpatialSceneControls。
- ExploreView：CurationPanel、地图 hooks、地点分组工具。
- AdminPage：ConfigPanel、UploadProgress、ThemeSwitcher，品牌/器材/文件/照片管理 hooks。
- ConfigPanel：MapStylePicker。
- ThemeProvider：ThemeContext、GSAP、themeConfig。
- 实际灯箱主要在 GalleryPage 内部，不能把未接入的 LightboxPanel.tsx 当作当前全部灯箱逻辑。

### 保留但未接入的文件

入口导入图未触达：ToolsPanel.jsx、HomeIntroSplash.jsx、useLocationPicker.js、useMapInitialize.js、LightboxPanel.tsx、gallery/index.ts、errorHandler.example.js、ossSignature.js、spatialPixels.js。

“未触达”只说明它们未由 src/main.jsx 的可解析静态/字符串动态导入加载；部分文件可能由测试使用。迁移时保留这些原文件，不将其全部当作当前线上功能，也不擅自删除。

## 4. 功能清单与迁移验收

| 功能组 | 已识别的真实业务 | 小程序交付要求 |
| --- | --- | --- |
| 品牌与启动 | Logo、Light of Anthony 字标、启动装片效果、远程品牌文字 | 复用原素材和文字，适配小程序顶部安全区域 |
| 两种主题 | 纸白画廊、暖调胶片；主题记忆、过渡效果 | 保留色彩、字形、卡片圆角及切换逻辑 |
| 图库 | 原比例图片卡片、加载状态、计数、分段展示、高清预览来源和失败回退 | 真接口、真实图片、保持手机端排列与图片比例 |
| 筛选 | 最新、随览、附近、远方、胶片；无定位时的回退规则 | 复用分类、排序、距离计算及历史分类兼容 |
| 详情 | 高清灯箱、切换照片、触摸交互、器材、焦距、光圈、快门、ISO、胶卷、拍摄日期 | 迁移当前 GalleryPage 中的完整详情逻辑 |
| 地理信息 | EXIF GPS、经纬度、地点、海拔、当前定位 | 保留数据优先级和缺失信息处理 |
| 地图发现 | 省份/城市分组、地点标记、聚焦城市、地点照片、抽屉展开/折叠和拖动 | 同等操作流程；地图提供者实现需要替换 |
| 点赞 | 本地点赞记忆、增加/取消、服务端原子计数 | 继续调用原服务端行为，不能直接匿名写数据库 |
| 点赞附属能力 | 私有 IP 事件、邮件通知、服务端限流和管理读取接口 | 保持服务端处理；不能在手机上重新实现邮件发送 |
| 原图下载 | 读取真实原图，浏览器保存/打开链接 | 下载原始文件，提供适用的保存/分享入口，验证格式与保真 |
| 空间场景 | 深度图缓存、拖动、倾斜、预加载、签名、任务等待/失败恢复 | 重用深度结果和 shader，适配 WebGL 与生命周期 |
| 管理认证 | 账号密码登录、token 存储与校验、退出 | 原账号继续可用，不强行改成微信身份 |
| 上传 | JPG/PNG/WebP，前端 100 MB 校验、按阈值压缩、进度、原图和预览 | 微信文件接口适配；大图、EXIF、方向需真机验证 |
| 上传事务 | 稳定作品 ID、文件摘要、重试复用上传结果、upload_id 绑定、过期清理 | 继续遵守当前提交契约，避免重复作品和孤立文件 |
| 表单 | 标题、国家/地点、分类、日期、器材、拍摄参数、胶卷、坐标、海拔、评分等 | 所有现有字段保留，原日期控件需平台替换 |
| 地图选点 | 上传/编辑地图、搜索地点、定位和选择坐标 | 保留搜索、选点、回填信息 |
| 审核 | 通过、拒绝、拒绝理由、重新提交、不同状态列表 | 使用原状态机和字段 |
| 编辑与删除 | 修改资料、隐藏/公开、单删、批删、确认输入、OSS 清理 | 继续由服务端协调删除，手机不能猜测对象路径 |
| 列表管理 | 查询、分类筛选、分页、当前页选择、批量审核等 | 保留操作范围与部分失败反馈 |
| 统计与配置 | 作品/状态统计、器材预设、品牌、网页环境和地图样式 | 同一数据来源；网页专属配置仍保存其网页用途 |

不把用户注册、评论、付费、跨设备收藏账户等不存在的产品功能混入本次迁移。小程序分享指定作品属于平台适配，可用图库页 query 打开当前灯箱，避免为分享重新设计详情流程。

## 5. 接口、认证和数据库

### 5.1 当前数据链路

网页公开读：
- Supabase Data API → photos 的公开审核通过记录。
- brand_settings → 指定品牌记录。
- gear_presets → 器材预设。
- photo_spatial → 已公开照片的空间状态。
- 历史 Supabase 深度存储支持签名 URL；当前 OSS 深度图使用后端签名接口。

网页管理写：
- JWT → Express 管理 API → Supabase service_role → PostgreSQL。
- JWT → /api/upload/oss → 原图及 Sharp 预览 → OSS。
- 点赞 → Express 限流 → 数据库 RPC + IP 事件 → 可选邮件通知。

现有 Express 入口有 25 个 /api 路由声明，另外有静态 /uploads 和网页回退路由。注意：没有公开 GET /api/photos 列表接口；公开图库目前直接从 Supabase 读取，不能凭空假设已有这个接口。

| 方法 | 现有接口 | 认证/用途说明 |
| --- | --- | --- |
| GET | /api/health | 健康检查 |
| POST | /api/upload | 管理员 JWT，本地文件上传 |
| DELETE | /api/upload/:filename | 管理员 JWT，本地文件删除 |
| GET | /api/images | 管理员 JWT，本地图片列表 |
| GET | /api/photos/:id/spatial-depth | 仅签发公开作品的有效深度图链接 |
| GET | /api/media/proxy | 受限图片源代理 |
| GET | /api/admin/like-events | 管理员 JWT，私有 IP 点赞事件 |
| POST | /api/admin/notifications/likes/test | 管理员 JWT，测试邮件及限流 |
| PATCH | /api/photos/:id/likes | 公开，原子增减、限流、IP 事件和通知 |
| POST | /api/upload/oss | 管理员 JWT，file/filename/uploadId，原图及预览 |
| DELETE | /api/upload/oss/*filename | 管理员 JWT，OSS 对象删除 |
| POST | /api/auth/login | 账号密码校验、登录限流、签发 JWT |
| POST | /api/auth/verify | JWT 校验 |
| POST | /api/auth/refresh | JWT 校验与续签 |
| GET | /api/admin/photos | 管理员 JWT，照片列表 |
| GET | /api/admin/photos/:id | 管理员 JWT，单照片及可选字段 |
| POST | /api/admin/photos | 管理员 JWT，保存作品与 upload_id 绑定 |
| POST | /api/admin/photos/upsert | 管理员 JWT，按 ID upsert |
| PATCH | /api/admin/photos/:id | 管理员 JWT，更新作品 |
| DELETE | /api/admin/photos/:id | 管理员 JWT，删除记录及持久化图片清理 |
| GET | /api/admin/app-settings/:id | 管理员 JWT，读取配置 |
| PUT | /api/admin/app-settings/:id | 管理员 JWT，保存配置 |
| PUT | /api/admin/brand-settings/:id | 管理员 JWT，保存品牌 |
| DELETE | /api/admin/brand-settings/:id | 管理员 JWT，删除品牌设置 |
| POST | /api/admin/gear-presets | 管理员 JWT，新增或更新器材预设 |

### 5.2 登录与身份

- 管理账号来自服务端 ADMIN_USERNAME / ADMIN_PASSWORD。
- POST /api/auth/login 返回 24 小时 JWT。
- 后续请求使用 Authorization: Bearer token。
- POST /api/auth/verify 用于校验；refresh 接口已存在。
- 客户端没有微信用户 ID / Supabase 用户账户登录流程。
- 公开访问不需要登录；点赞记录在本地设备，不是账号级跨设备记录。
- bcryptjs 虽然已安装，当前登录入口实际是对配置凭据进行安全比较，不能据依赖表说这是用户密码表登录系统。

小程序保留原认证契约，将浏览器存储替换为微信存储即可。无需增加 wx.login、AppSecret、openid 用户表或改变原管理账户。

### 5.3 数据结构

识别到基础 schema 与 19 个 SQL 迁移，业务表共 7 个：

| 表 | 用途 |
| --- | --- |
| photos | 照片、原图/预览、器材/胶卷/地理字段、评分、审核、隐藏、点赞 |
| gear_presets | 相机与镜头预设 |
| brand_settings | Logo、图库/管理标题和副标题 |
| app_settings | 配置及上传、删除、通知等持久化状态 |
| photo_like_events | 私有点赞事件、IP 与时间 |
| photo_spatial | 深度模型、版本、生成状态、路径、尺寸、存储提供者 |
| spatial_jobs | 本机 GPU 持久化任务、租约、重试 |

还使用 Supabase Storage 的 spatial-depth bucket 以兼容旧空间结果；新结果可存入私有 OSS。

迁移无需新数据库、重建表或搬照片。基础 schema 中的旧宽松策略随后由迁移收紧；必须以全部迁移与真实数据库现状为准，不能单独执行旧基础 SQL 并认为权限已与现网一致。本轮未查询线上 schema、RLS、迁移历史或数据量，文件存在不证明所有迁移已在线上执行。

### 5.4 PATCH 的兼容方案

必须保持：
- 原 PATCH /api/photos/:id/likes 的 delta 校验、原子计数、限流、IP 和通知。
- 原 PATCH /api/admin/photos/:id 的 JWT / 管理员检查、字段和响应。

推荐最小的向后兼容改动：
- 在现有 Express 增加两个 POST 兼容入口，与原 PATCH 共享处理函数。
- 原 PATCH URL、方法、响应继续保留；网页不改调用方式。
- 小程序只针对这两个操作调用 POST 兼容入口。
- 不改变数据库和登录系统，不用匿名 RPC 绕过后端限制。

若要求 server 目录一个字都不改：
- 部署独立 HTTPS 兼容网关，以 POST 接收这两个允许的操作，再向原接口发 PATCH。
- 只允许固定 upstream 和固定路径，禁止任意 URL 转发；保留 bearer、状态码、业务响应。
- 在可信代理链中正确保留客户端 IP，重新核实 trust proxy / 限流；不能让所有点赞都被记成网关 IP。
- 该方式保持原后端源码不动，但增加一个必须部署和维护的服务，不能仅交付客户端代码就称完整可运行。

不能把已有 /api/admin/photos/upsert 无条件当 PATCH 替代：全记录覆盖、必填字段、并发写语义可能不同；点赞也没有现成 POST 同义接口。

### 5.5 Supabase 接入和域名条件

客户端可以用 Taro.request 访问原 PostgREST 路径，保持现有只读条件、字段和 anon/publishable key，而不是直接假定浏览器 SDK 可在小程序运行。

微信官方要求 request / uploadFile / downloadFile 配置服务器域名，使用 HTTPS，并要求域名满足 ICP 备案等条件。因此当前 Render、supabase.co、OSS 访问链路不能仅凭浏览器能访问就视为可用于发布版小程序。

实施时应核实：
- API 的自有 HTTPS 域名与证书、配置权限和备案条件。
- 原 Supabase 读服务是否能通过合规自有域名反向代理访问，继续保持同一 Data API、数据库与 RLS。
- OSS/CDN 原图、预览、深度文件的实际下载域名。
- 高德 HTTP 地理服务、海拔服务若需继续使用，是否能由现有服务或受控网关代理。
- 代理读取仍保持 anon/RLS，不因为增加代理就改为 unrestricted service_role 公开读取。

是否需要网关或新增公开只读入口取决于这些域名的验证结果，不预先删除现有 Supabase 链路。

原图保真的边界：网页现有逻辑会尝试压缩大于 6 MB 的文件，只有压缩收益达到阈值才替换上传内容。因此当前 origin 目录名不必然代表原相册文件逐字节未处理；小程序需保留并明确原有上传策略。微信选择 original 也不能被当作所有来源都保留 EXIF/字节的证明，需真机验证。

公开列表与管理员列表当前均有最多 1000 条读取限制；图库“加载更多”主要是已读取结果中的分段展示。迁移先保留既有语义，不把新服务端分页当作已经存在，也不在局部分页上做全量附近/远方排序。

## 6. 复用边界和第三方兼容性

| 原实现 | 复用判断 | 小程序适配 |
| --- | --- | --- |
| 分类、时间、距离、分组、字段映射 | 高复用 | 直接复用纯函数，保留边界和历史数据规则 |
| React 状态、useMemo、useCallback 等 | 可复用控制逻辑 | 复制适配页面；含浏览器副作用的 Hooks 替换平台调用 |
| React DOM createRoot / Router | 必须替换入口 | Taro App / page 配置、navigateTo / 返回；保留两页结构 |
| HTML / JSX、inline SVG | 需编译及组件适配 | 采用 View/Text/Image 等；图标由原 path 派生资源，不改造型 |
| 手写 CSS、主题 tokens | 设计内容复用 | 根主题改为页面 class，处理选择器、尺寸单位、安全区和字体 |
| createPortal（ThemeSwitcher） | 必须改造 | 同页定位弹层，保持原主题菜单布局 |
| react-datepicker | 不能直接沿用 DOM 控件 | 小程序日期控件或自定义日期面板，保留原表单视觉/字段 |
| GSAP DOM 动画、hover | 不能直接照搬 | 复用时间/缓动/状态；CSS 与节点动画实现对应手机动作 |
| MapLibre、高德 JS SDK | 浏览器地图不能直接使用 | 微信地图组件/地图适配器；业务数据和地点分组保留 |
| exifr | 参数/元数据规则可复用 | 从临时文件读取 ArrayBuffer 后解析，验证格式与方向；必要时可加后端解析而非换数据库 |
| localStorage / sessionStorage / storage event | 替换平台 API | 微信存储、内存启动状态、页面生命周期和事件同步 |
| fetch / Response / XHR | 替换平台 API | Taro.request；手动判断 statusCode，POST/PATCH 分支处理 |
| FormData / File / Blob / FileReader | 替换文件实现 | chooseMedia、临时路径、uploadFile、FileSystemManager |
| crypto.randomUUID / crypto.subtle | 替换平台能力 | 注入 UUID 和 SHA-256 计算，保持提交 ID/摘要语义 |
| 图片 srcSet、Image.decode、object URL | 替换图片适配 | 按显示尺寸选同一 OSS 预览 URL，真实原图下载与临时文件缓存 |
| IntersectionObserver / ResizeObserver / 同步 DOM 尺寸 | 改造测量与生命周期 | selector query、列表触底、节点/页面尺寸事件 |
| navigator.geolocation | 替换定位入口 | wx.getLocation；明确坐标系、授权拒绝和距离回退 |
| navigator.connection / matchMedia / deviceorientation | 改造能力检测 | 显式偏好、设备/网络接口、微信设备方向监听与触摸输入 |
| WebGL shader / 深度重投影数学 | 高复用数学，需平台渲染器 | 微信 Canvas WebGL、节点图片、纹理、帧调度和后台释放 |
| DOMException / AbortController.any / timeout | 不假设平台齐备 | 请求 task.abort、统一取消错误和超时适配 |
| favicon / meta / SEO / 桌面键盘 | 平台表达不同 | 对应小程序名称、分享标题/图、页面返回和触摸；网页原实现保留 |

Taro 提供部分 HTML/DOM 映射，但官方明确存在同步尺寸、组件 Context、React DOM 等兼容边界。自动标签替换可以辅助迁移，不能作为完整兼容证明。

## 7. 原设计保留策略

原设计明确的基线：
- 品牌：Light of Anthony，现有 Logo、字标、启动图片。
- 纸白：背景 #f5f5f2、面板 #ffffff、文字 #1e2729、强调 #48645e。
- 胶片：背景 #f2eadd、面板 #faf4e9、文字 #3b3028、强调 #a85532。
- Playfair Display 标题、Noto Sans SC Variable 正文。
- 照片比例、卡片、页头图库/发现切换、灯箱、地点底部面板、主题菜单和管理布局。

迁移方式：
1. 先对原网页目标手机尺寸建立截图基线，再对照小程序截图，而不是换成新的模板或 UI 套件。
2. 同一页面的状态、字段、按钮顺序、业务文案从原源码迁移。
3. 必须改动的标签、选择器、rem/vw/dvh 和节点测量放在平台适配中。
4. 日期控件、地图、保存文件及顶部微信胶囊区域使用平台实现，明确视觉差异和对应功能。
5. 地图底图、浏览器字体渲染、悬停与键盘不能保证像素一致。若原生地图不能满足必要的视觉效果，先给出具体差异及实现成本，不静默删去功能。
6. 小程序地图设置不能直接使用原 amap://styles/... 或高德 Web JS key；已有网页配置仍保留其用途，独立设置小程序平台地图参数。

本次网页构建输出约 11.05 MB，其中字体约 4.56 MB、100 个字体文件。这个数是网页输出统计，不是预测的小程序包大小。需要对原字体做分包/CDN/字形资源验证；不能把全部网页产物原封不动当作小程序代码包。

## 8. 文件级迁移清单

以下“改造”默认发生在独立 miniapp 工程对应副本中，不直接覆盖原 src。平台无关文件优先抽到 packages/shared；共享含 React 的 Hooks 必须避免网页 React 19 与小程序 React 18 混装导致双 React 实例。

| 原文件或完整文件组 | 迁移处理 |
| --- | --- |
| src/main.jsx、src/App.jsx | 新 miniapp/src/app.tsx、app.config.ts；替换 DOM 入口和路由，保留启动状态与错误处理 |
| src/pages/Gallery.jsx、src/pages/gallery/GalleryPage.jsx | 图库页副本；保留图库/发现、灯箱、详情及事件，替换浏览器副作用 |
| src/pages/Admin.jsx | 管理页副本；按原五个区域与弹窗拆出组件，保留字段和操作流程 |
| src/pages/gallery/components/PhotoGrid.tsx | 替换 HTML/Image/srcSet、点击/滑动、列表加载和测量 |
| src/pages/gallery/components/TabStrip.tsx | 原筛选条与选中背景保留，改异步测量与触摸事件 |
| src/pages/gallery/components/ExploreView.jsx | 地图提供者改造，保留数据聚合、城市选择和列表联动 |
| src/pages/gallery/components/CurationPanel.tsx、CurationPanel.css | 原城市卡片和抽屉，适配拖动/尺寸、视图类和样式 |
| src/pages/gallery/components/LocationPanel.tsx | 原地点照片面板副本 |
| src/pages/gallery/components/PhotoLocationMap.jsx | 单照片地图组件适配 |
| src/pages/gallery/hooks/useMapInit.ts | 小程序地图 provider / MapContext，保留中心、缩放、选点接口 |
| src/pages/gallery/hooks/usePhotoData.ts | 保留映射与点赞状态；数据 transport、缓存和生命周期替换 |
| src/pages/gallery/hooks/useExifAndLocation.ts | 保留 EXIF/海拔优先级，微信定位、文件及网络实现 |
| src/pages/gallery/utils/geoUtils.ts、timeUtils.ts、photoDataUtils.ts、photoFilterUtils.ts | 提取纯业务函数/类型共享 |
| src/pages/gallery/utils/cityFlight.js | 飞行策略中的数据与数学复用；浏览器地图调用使用平台适配 |
| src/pages/gallery/constants/locationData.ts | 复用省市/地点常量，不能当成假照片数据 |
| src/themes/themeConfig.js、ThemeContext.js | 复用主题参数和 context 接口，拆出浏览器 applyTheme |
| src/themes/ThemeProvider.jsx、ThemeSwitcher.jsx、themes.css | 保留过渡/菜单设计，替换 GSAP DOM、Portal、全局主题选择器 |
| src/components/ErrorBoundary.jsx | 复用异常边界，改小程序呈现 |
| src/components/UploadProgress.jsx、UploadProgress.css | 保留进度阶段、文案与视觉，微信上传回调驱动 |
| src/components/SpatialSceneControls.jsx、SpatialScene.css | 保留按钮、状态和说明；小程序组件及样式 |
| src/components/admin/ConfigPanel.jsx、MapStylePicker.jsx | 保留配置字段、品牌操作，区分网页/小程序地图配置 |
| src/hooks/usePhotoManagement.js | 审核/重新提交/删除/批量流程复用，替换 transport、存储 |
| src/hooks/useGearOptions.js、useBrandConfig.js | 器材和品牌逻辑复用，替换读取和事件通知 |
| src/hooks/useFileUpload.js | 微信临时路径文件模型、预览、进度 |
| src/hooks/useSpatialScene.js | 保留状态机，微信生命周期、拖动和方向监听 |
| src/utils/auth.js、adminApi.js | 认证和 API 契约复用，请求/缓存适配，PATCH 兼容路由 |
| src/utils/supabaseClient.js | 小程序只读数据适配，不直接默认打包浏览器 Auth/Realtime 模块 |
| src/utils/storage.js、src/constants/storageKeys.js | 复用 key / 序列化契约，替换底层微信存储 |
| src/utils/envConfig.js、branding.js | 编译配置映射、运行覆盖/品牌读取，替换 window 事件及 favicon |
| src/utils/urlUtils.js | OSS 路径及质量策略复用，绝对 URL、尺寸选择和媒体下载适配 |
| src/utils/upload.js | 保留 /api/upload/oss 及文件参数，替换 XHR/FormData、压缩与 file 模型 |
| src/utils/photoSubmission.js | 复用稳定提交流程；注入 UUID、SHA-256 与文件适配器 |
| src/utils/photoCategories.js、photoFields.js | 直接复用分类兼容及字段契约 |
| src/utils/adminUtils.js、security.js、errorHandler.js | 业务映射和错误分级复用，替换环境、URL 和网络依赖 |
| src/utils/spatialDepth.js、precomputedSpatialDepth.js | 复用缓存/状态规则，平台签名、图片/像素读取及取消 |
| src/utils/spatialRenderer.js | shader / 输入数学保留；独立小程序 Canvas 渲染实现 |
| src/utils/amapLoader.ts、maplibreLoader.js、gaodeMapStyle.ts | 网页文件原样保留；小程序用 provider adapter，不打包 DOM SDK |
| src/App.css、src/index.css、public/ 原素材 | 迁移样式与素材，处理字体、图标、根路径和包体 |
| package.json、package-lock.json、vite.config.js、tsconfig*.json、eslint.config.js | 网页保留；miniapp 增加独立锁文件、Taro config、TS/ESLint 与构建脚本 |
| server/server-enhanced.js | 仅在采用最小兼容入口时新增 POST 路由并抽共享 handler；原接口保留 |
| server/photoLikes.js、photoUploads.js、photoDeletion.js、spatialDepthStorage.js、likeNotifications.js | 业务保持；兼容层必须透传语义和代理 IP，必要变动独立标记 |
| docs/schema_domestic_postgres.sql、supabase/migrations/*.sql | 不因迁移重建或更改数据库；核对既有实际 schema |
| scripts/spatial-gpu/* | 继续作为已有后台 worker；不迁入手机包 |

### 预计新增工程文件

- miniapp/package.json、package-lock.json、config/index.ts、dev.ts、prod.ts。
- 在 miniapp/package.json 配置 dev:weapp、build:weapp、typecheck、lint 与必要的测试命令；对应 Taro watch/build 和 tsc，无需替换原网页 npm run dev/build。
- miniapp/tsconfig.json、eslint.config.js、project.config.json、.env.example、README.md。
- miniapp/src/app.tsx、app.config.ts、app.scss、types/env.d.ts。
- miniapp/src/pages/gallery/index.tsx、index.config.ts、index.scss。
- miniapp/src/admin/pages/index.tsx、index.config.ts、index.scss；管理员页面可放独立分包。
- miniapp/src/components/ 下的原图库、地点、主题、详情、空间控件和管理组件迁移副本。
- miniapp/src/platform/ 下的 request、storage、files、location、map、canvas、lifecycle 适配。
- packages/shared/ 下的照片类型、字段、筛选、分组、地理/时间和提交契约。
- 兼容网关部署文件：仅当选择不修改原后端或原域名无法满足小程序发布条件时增加。
- docs/ 下的迁移功能对照、导入、环境配置、调试、真机验收和发布文档。

具体组件拆分名应在迁移时按原职责确定，不能把目录清单当成已经存在的工程。

## 9. 源码完整性与现有验证

自动扫描：
- 97 个 JS/JSX/TS/TSX/MJS 源码文件（src、server、scripts、Supabase functions）。
- src 下 64 个代码文件，入口依赖图可达 55 个。
- 未发现语法解析错误或缺失的可解析本地 import。
- 37 个 src 文件命中浏览器相关符号关键词；包含注释命中，需以逐文件审查判断实际依赖，不能把计数当成兼容错误数量。
- index.html、前后端 package-lock、Vite/TS 配置、页面组件、图片素材、schema/迁移、后端模块和测试都存在。

已执行：

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| npm ls 前后端直接依赖 | 无缺失直接依赖；有 extraneous 安装包 | 不等同于干净机器 npm ci 复现 |
| npm run build | 通过；MapLibre chunk 约 1.06 MB，有体积告警 | 只证明网页构建；不是小程序编译 |
| npm run lint | 通过 | 当前配置主要检查 JS/JSX，不覆盖所有 TS/TSX/MJS |
| 11 个测试文件 | 78 项通过、0 失败 | 本地受控单元测试；不证明生产 DB、OSS、邮件连接或小程序真机 |
| 导入图检查 | 0 缺失本地 import | 不覆盖任意计算动态导入、远程 SDK 与线上 URL 可用性 |

测试包含：点赞、通知、上传/删除、公开图片源、私有深度图签名、提交/重新提交、城市飞行数学、空间输入与深度缓存。

发现的工程补充项：
1. Admin.jsx 直接 import date-fns/locale，但 package.json 未声明 date-fns。当前靠 react-datepicker 传递依赖安装后可构建；小程序应直接锁定该依赖，不依赖碰巧提升。
2. 存在 TS 配置和 TSX 源码，但未声明/安装 TypeScript 编译器，build 只调用 vite build。未发现 vite-env.d.ts。属于类型检查基础设施待补齐，不是网页无法编译。
3. node_modules 存在少量 extraneous 包，不能据当前安装目录替代锁文件复现。
4. 多个旧文档/旧组件不是当前实际入口；实际行为以源码和启动脚本为准。
5. Python 环境、模型权重和 vendor 目录在本机 .artifacts 中存在，但被 Git 忽略；迁移小程序不需要复制模型，新机器恢复 GPU worker 需要单独准备依赖和模型。
6. project.config.json、Taro app/config、小程序 AppID 尚未在仓库发现。这些是待创建的迁移文件，不是原网页源码丢失。
7. .env.local 与 server/.env 存在，本轮只核对变量名称，不输出凭据；其存在不能证明线上连接正确。

验证日志和完整导入/接口清单位于 .artifacts/wechat-migration-audit/。应用源码未改变。

## 10. 迁移路线与实施顺序

### 阶段 A：保留基线，建立独立工程

- 为实际工作树生成原源码快照，包含未提交代码；不是只记 HEAD。
- 保留网页工程、server、数据库迁移和所有原素材。
- 备份不把凭据混进交付 ZIP；不重复下载生产照片。
- 新增 miniapp 独立工程与锁文件，官方 Taro/React 版本先验证兼容。
- 默认沿用两页结构：图库页和管理员分包页；详情/地点/主题继续按原弹层呈现。
- 以原手机网页截图为 UI 基线。

### 阶段 B：先打通真实链路

- 真 Supabase read / 原后台 JWT / OSS 上传下载。
- 解决服务器域名、HTTPS、代理和 PATCH 兼容。
- 先验证原图选择、EXIF、上传 ID/摘要、深度签名。
- 无配置或无数据时呈现错误/空态，不使用假照片或假接口。

### 阶段 C：按原页面迁移

- 图库、筛选、主题、灯箱和拍摄详情。
- 发现地图、地点卡片、底部面板及地图联动。
- 登录、上传、列表、审核、重新提交、编辑、隐藏、批量操作和配置。
- 空间场景 shader 与微信 Canvas，保留后台推理和结果缓存。
- 对不能像素等价的地图/字体/保存入口列实际差异，给出对应实现，不静默降级。

### 阶段 D：两端验收与交付

- 小程序 build、TS、必要的业务测试。
- 微信开发者工具导入及编译，结合 console/network/模拟器截图。
- iOS/Android 真机：正常/弱网、冷启动、授权拒绝、大图、签名过期、切后台、重复操作。
- 保持原网页和管理后台回归。
- 交付完整源码、可导入的构建目录、真实配置模板和明确发布步骤。
- 未获得有效 AppID、合法域名或真机结果时，区分“编译成功”和“可发布/已验证”，不混称完成。

原计划中的 52–83 人日仍只能作为完整迁移的预算范围；本次确认 PATCH、React 版本和域名接入问题后，需在真实链路验证阶段再次估算。安装 skill 本身不会消除这些代码和平台工作量。

## 11. 后续需要的配置

| 配置 | 用途 |
| --- | --- |
| 真实小程序 AppID | 工具导入、预览和发布；不能使用占位 AppID 声称真机通过 |
| HTTPS API 及兼容入口域名 | 原认证、管理、上传、点赞、签名接口 |
| Supabase 公开读服务地址 | 同一数据库与 RLS；必要时经自有域名代理 |
| Supabase anon/publishable key | 公开只读；沿用现有权限 |
| OSS/CDN 实际媒体域名 | 图片下载、原图保存、深度纹理和字体等资源 |
| request/uploadFile/downloadFile 域名列表 | 分别按实际网络操作配置与测试 |
| 定位说明与相关权限 | 附近/远方、地图当前定位和选点 |
| 相册相关权限与隐私说明 | 选择图片、保存原图 |
| 设备方向能力与兼容基础库 | 倾斜空间效果 |
| 小程序专用地图参数 | 不把高德 Web key 或样式 URL 当成小程序地图配置 |

JWT_SECRET、管理员密码、service_role、OSS Secret、SMTP 密码和任何 AppSecret 均只保留在后台，不能带进小程序环境变量或工程 ZIP。

微信开发者工具 skill 与配套 Nightly 已安装；上一轮连接授权超时，本轮没有调用 DevTools 业务工具，因此没有新的模拟器、授权或登录验证结论。源码分析不依赖当前工具连接状态。

## 12. 官方依据与审查产物

- [Taro 多端差异实现](https://docs.taro.zone/docs/envs/)
- [Taro HTML/DOM 兼容边界](https://docs.taro.zone/docs/use-h5/)
- [Taro request](https://docs.taro.zone/docs/apis/network/request/)
- [微信 wx.request 合法 HTTP 方法](https://developers.weixin.qq.com/miniprogram/dev/api/network/request/wx.request.html)
- [微信网络域名与 HTTPS 要求](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)
- [微信官方开发者工具 Skill](https://developers.weixin.qq.com/miniprogram/dev/devtools/Skills.html)
- [Taro React 4.3.0 npm 元数据](https://registry.npmjs.org/@tarojs%2freact/4.3.0)
- [Taro React 插件 4.3.0 npm 元数据](https://registry.npmjs.org/@tarojs%2fplugin-framework-react/4.3.0)

原有计划：docs/engineering/wechat-miniapp-migration-plan.md。
本次证据：.artifacts/wechat-migration-audit/inventory.json、build.log、lint.log、tests.log。

