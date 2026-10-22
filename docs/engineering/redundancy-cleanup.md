# 冗余清理实施记录

开始日期：2026-10-22。原始审计保留在 `CODE_AUDIT_REPORT.md`。

- 工作分支：`codex/audit-cleanup`。
- 清理前完整源码基线：`f464f12`。保存了原有未提交源码、配置、文档及运行素材；不含凭据、依赖、产物和历史截图。
- 每批单独提交；验证失败时暂停后续批次，先报告并修复当前批次，验证通过后再继续。
- 不部署、不改生产数据、不退役尚有外部消费者可能的 API/数据库兼容契约。

## 批次 1：恢复可用的检查基线（P2-07、P2-11，部分 P0-06）

文件：根 `package.json`/`package-lock.json`、`tsconfig.json`、`eslint.config.js`、`scripts/check-project.mjs`；小程序 `package.json`/`tsconfig.json`；共享 `geoUtils.ts`；Web `LightboxPanel.tsx`、`useExifAndLocation.ts`、`errorHandler.js`。

修正混合 JS/TS 推断、错误处理 JSDoc 的可选字段、重复位置类型及未使用绑定；扩展第一方 TS/MJS 检查，排除第三方产物；为 Playwright 浏览器回调声明实际运行环境。根工程直接声明 TypeScript 与 ESLint TS parser，新增 `npm run check` 作为遇错即停的统一验证入口。

初次扩展检查暴露浏览器回调环境误判和 JSDoc 不完整；均在本批内处理，未进入后续清理。`npm run check` 最终通过：根 lint/类型检查、105 项 Node 测试、小程序 lint/类型检查、23 项小程序测试及 Web 内存构建全部通过，`git diff --check` 通过。

## 批次 2：失联界面实现（P0-01、P0-02、P0-04）

恢复点：`ed3457b`。删除 `src/components/{HomeIntroSplash.jsx,admin/ToolsPanel.jsx}`、`src/pages/gallery/{index.ts,components/LightboxPanel.tsx}`；仅修改 `src/App.css` 移除旧开场专属样式。再次检索未发现运行入口，真实 AppLoading、灯箱、上传逻辑保持原样。实际删除 909 行。

`npm run check` 全通过。浏览器测试首次并发冷启动时两次加载超时，暂停后续清理；在已就绪的同一个本地服务上复测，`admin-ui-smoke.mjs` 和 `gallery-cache-smoke.mjs` 均通过。未修改测试断言来绕过失败，测试业务请求均被拦截为本地 fixture。

## 批次 3：失联基础模块（P0-03、P0-05）

恢复点：`27d514f`。删除 `src/hooks/useMapInitialize.js`、`src/hooks/useLocationPicker.js`、`src/utils/ossSignature.js`。再次检查源码、脚本、配置、共享层与小程序均无调用方；保留当前地图和受保护的后端上传实现。实际删除 447 行。`npm run check` 全通过。

## 批次 4：未使用内部符号（P0-06、P0-07、P0-08）

恢复点：`7929dcc`。修改 `src/pages/Admin.jsx`、`packages/shared/constants/locationData.ts`、`src/utils/{gaodeMapStyle.ts,errorHandler.js,envConfig.js,adminApi.js,auth.js,urlUtils.js}`、`packages/shared/mediaUrls.js`、`src/components/ErrorBoundary.jsx`、`src/hooks/useFileUpload.js`。

逐项复核后删除 FILM_STOCK_OPTIONS、explorePins、旧地图常量、8 个无人消费的导出，以及上传 Hook 的未消费操作方法；保留实际上传、ErrorBoundary、令牌清理和后端 GET 接口。`npm run check` 全通过。

## 批次 5：依赖归属（P0-09）

恢复点：`b950960`。仅修改根 `package.json`/`package-lock.json`：去掉 i18next、语言检测器、react-i18next、nanoid 的直接声明；显式声明源码实际使用的 date-fns 4.1.0 和测试使用的 esbuild 0.28.2，均沿用原已解析版本。正常更新依赖树移除了 8 个包，PostCSS 所需 nanoid 传递依赖保留。`npm run check` 全通过。

## 批次 6：共享媒体规则（P2-01）

恢复点：`c470522`。修改 `packages/shared/mediaUrls.js`、`src/utils/urlUtils.js`，新增 `scripts/media-urls.test.mjs`。原八个导出保留；通过工厂显式注入代理开关，默认适配器保持小程序直链，Web 适配器继续读取原 Vite 开关，移除无人设置的隐式 global。消除接近一份文件的重复实现。

完整检查通过（Node 测试增至 109 项，小程序 23 项）；管理页与图库缓存浏览器回归均通过，原图恢复、响应式预览和代理隔离新增合同测试通过。

## 批次 7：Web API 地址拼接（P2-03）

恢复点：`1f12690`。修改 `src/utils/{auth.js,adminApi.js,spatialDepth.js}` 与 `src/pages/gallery/hooks/usePhotoData.ts`，新增 `src/utils/apiUrl.js`、`scripts/api-url.test.mjs`。统一相对路径、空格、末尾斜线及 /api 后缀处理；保留请求方法、令牌、取消和响应解析。`npm run check` 全通过（110 项 Node 测试、23 项小程序测试）。

## 批次 8：图片回退（P2-05）

恢复点：`351a063`。修改 `src/pages/gallery/{GalleryPage.jsx,components/PhotoGrid.tsx}`，新增 `src/utils/imageFallback.js`、`scripts/image-fallback.test.mjs`。共享候选推进和 srcset 清理，保持缩略图/灯箱各自失败状态与展示；新增耗尽和重复候选回归。`npm run check` 全通过（112 项 Node 测试、23 项小程序测试）。

## 批次 9：照片字段契约（P2-02）

恢复点：`287e599`。修改 `server/server-enhanced.js`、`packages/shared/photoFields.js`，新增 `server/photoFields.js`。确认原字段序列逐字等价后，定义只保留一份，放在独立后端部署目录中的纯 JS 叶模块；共享入口转导出它，不引入任何 Express、凭据或 Node 运行代码，不改 Render/Docker 根目录。完整检查及 `miniapp` 的 `npm run build:weapp` 均通过。

## 批次 10：资产安全清理片段（P2-09）

恢复点：`7a1658f`。修改 `server/photoDeletion.js`、`server/photoUploads.js`，新增 `server/ossAssets.js`。提取资产归属、其他照片引用查询及忽略已不存在对象的删除步骤；旧 getPhotoOssAssets 出口仍转导出，锁、持久化任务、48 小时保留期、重试和日志语义保留。首次 lint 指出提取后遗留 import，在本批内删除后完整检查通过；原共享引用、进程重启、响应丢失和失败保留测试全部通过。没有执行真实删除。

## 批次 11：选点标记复用（P2-04）

恢复点：`4de82cd`。修改 `src/pages/Admin.jsx`，新增 `src/utils/locationMarker.js`、`scripts/location-marker.test.mjs`。合并上传/编辑初始标记、点击标记和搜索结果标记共五处重复创建代码，保留原尺寸、颜色、经纬顺序、弹窗开启及名称转义。地图生命周期、浏览器定位和上传/编辑表单独立状态保留，避免将不同提交流程强行合并。完整检查通过（113 项 Node 测试、23 项小程序测试），管理页浏览器回归通过。

## 批次 12：管理纯规则（P2-08）

恢复点：`accce93`。修改 `src/pages/Admin.jsx`、`miniapp/src/admin/pages/index.tsx`、`packages/shared/adminWorkflow.ts`、`src/utils/gaodeMapStyle.ts`。复用搜索字段、页大小、当前页选择与原生无关的地图预设转换；保留本地分类、Web 审核兼容字段和批量失败处理的既有差异，不强行统一控制器。完整检查、管理页浏览器回归和小程序构建均通过。

## 批次 13：重复 CSS 声明（P2-06）

恢复点：`33e4cfb`。仅修改 `src/App.css` 并新增 `scripts/css-compat-smoke.mjs`。只删除同一条件/选择器/属性/值/优先级下被后续声明覆盖的早期重复项，跳过 keyframes 和不同值的兼容回退；移除 30 条重复声明、4 个空规则，共 41 行。

完整检查通过。首次计算样式比较遇到管理页异步就绪期间的高度变化，暂停后续批次；增加明确的界面就绪等待，保留全部属性断言，再对图库/灯箱/管理页 × 390/768/1440px × paper/film/darkroom 共 27 组进行比较，元素及前后伪元素的计算属性全部一致。测试拦截业务请求，没有线上写入。其余不同值的响应式/主题覆盖作为有效层叠保留，不做全量样式重写。

## 批次 14：退役无当前入口的上传方案（P1-01）

恢复点：`968adfb`。修改 `src/utils/upload.js`、`src/pages/Admin.jsx`、`src/utils/adminUtils.js`、`scripts/oss-upload.test.mjs`。复核所有调用链，实际 Web 入口固定 OSS，小程序有自己的 OSS 适配器，没有第三方存储选择器。删除四种不可达的客户端上传实现、分派、名称映射及恒定分支；简化无 setter 的 uploadType 状态。

进一步确认客户端压缩器只由恒为 false 的非 OSS 分支引用，因此一并删除；OSS 仍传原始文件，服务器高清预览、小程序原有压缩策略、本地历史作品读取均保留。所有现有 HTTP 路由、请求字段和当前 OSS 返回值保持不变；显式传入已退役客户端模式会明确失败，避免静默退回 Base64。新增大于 6 MiB 文件原字节保留测试。完整检查通过（115 项 Node 测试、23 项小程序测试），管理页浏览器回归通过。

## 批次 15：示例与运行代码分离（P3-07）

恢复点：`4e77152`。删除 `src/utils/errorHandler.example.js`，在 `docs/development/error-handling.md` 保留现行用法，更新 `docs/README.md` 入口；修改 `src/utils/errorHandler.js` 去掉唯一由旧示例消费的 withErrorHandling、isNetworkError、isPermissionError 及无人读取的 showUserMessage 配置字段。实际错误处理、回滚/重试、错误边界均保留。完整检查通过。

## 批次 16：文档唯一正文与现状（P2-10）

恢复点：`fdd1e31`。修改地图/图库说明及其旧入口、后端部署指南及 server 旧入口、两份旧直传指南、项目文档导航、开发指南、server README、Edge 函数说明和历史报告提示；原审计只增加指向本记录的说明，保留原基准。

旧大篇幅重复正文改为短跳转；当前指南以实际受保护 OSS、真实入口、共享模块和验证命令为准。历史方案标明非当前功能清单，不删除旧服务或远程函数。新增/修改的 33 个相对链接全部有效；完整检查通过。文档中原全文可从基线提交恢复。

## 批次 17：持续检查（P2-11）

恢复点：`8b5596f`。新增 `.github/workflows/quality.yml`，修改 `eslint.config.js`、开发指南。质量任务只授予 contents:read，安装三套锁定依赖、运行统一检查及小程序构建，不使用线上凭据和部署操作。缩小 JS 规则的大写豁免，避免未用的 UPPER_CASE 常量继续漏报；保留 JSX 组件名称适配。完整检查通过，workflow YAML 验证通过。远程 CI 尚未执行，分支未推送。

## 审计结果逐项处置

全部 30 项已复核：19 项完成，3 项完成安全范围内的局部收敛，8 项因外部契约、历史数据或业务需求证据不足而保留。保留项不是已修复或已下线，后续退役需对应证据；本次没有用“全部修复”替代对实际使用者的确认。

| 审计项 | 状态 | 处置与边界 |
| --- | --- | --- |
| P0-01 | 完成 | 删除失联开场及其专属 CSS，当前 AppLoading 保留；批次 2 |
| P0-02 | 完成 | 删除失联 ToolsPanel；批次 2 |
| P0-03 | 完成 | 删除未接入的两个旧地图/选点 Hook；批次 3 |
| P0-04 | 完成 | 删除旧灯箱和无消费者的 barrel；批次 2 |
| P0-05 | 完成 | 删除未使用的浏览器签名实现；批次 3 |
| P0-06 | 完成 | 清理未用常量与 seconds 计算；批次 1、4 |
| P0-07 | 完成 | 删除未消费内部导出，保留真实 API 路由；批次 4 |
| P0-08 | 完成 | 删除上传状态 Hook 的无人消费操作方法；批次 4 |
| P0-09 | 完成 | 去掉四项闲置直接依赖，正常更新锁文件；批次 5 |
| P1-01 | 完成 | 当前入口固定 OSS 后退役非 OSS 私有实现，明确拒绝旧客户端模式；批次 14 |
| P1-02 | 保留 | Edge 是独立远程 HTTP 入口；无旧客户端清单/部署调用日志，不能保证下线不改变 API 行为。客户端拒绝和文档状态已保留/澄清 |
| P1-03 | 保留 | server.js 仍可由外部命令和 fallback 启动；无完整运维调用清单，未删除服务。当前启动文档统一增强服务 |
| P2-01 | 完成 | 一份媒体规则加显式平台代理配置；批次 6 |
| P2-02 | 完成 | 单一字段契约，兼容 server 独立部署；批次 9 |
| P2-03 | 完成 | 共享 Web API 地址规范化；批次 7 |
| P2-04 | 局部收敛 | 五处标记创建合并；上传/编辑的文件、提交、定位状态与生命周期不同，保留独立表单和控制器；批次 11 |
| P2-05 | 完成 | 共享图片候选推进，保留两种视图失败状态；批次 8 |
| P2-06 | 局部收敛 | 删除确定重复声明及旧开场；不同值的主题、响应式、浏览器回退仍有作用，不进行整表重写；批次 2、13 |
| P2-07 | 完成 | 复用位置类型并消除再导出歧义；批次 1 |
| P2-08 | 局部收敛 | 复用页大小、搜索、选择和地图预设；Web 审核兼容字段、布尔失败及批量中断语义有差异，保留控制器；批次 12 |
| P2-09 | 完成 | 共用资产归属/引用/删除步骤，保留两种任务事务；批次 10 |
| P2-10 | 完成 | 唯一维护正文、旧链接跳转、历史资料明确标识；批次 16 |
| P2-11 | 完成 | 完整可用的本地检查、明确覆盖边界与 CI；批次 1、17 |
| P3-01 | 保留 | 无 Supabase 时本地持久化分支实际可达；保留历史本地作品、同页面轮询和存储事件，尚无业务退役决定 |
| P3-02 | 保留 | 旧点赞 RPC 有明确上线兼容背景；无数据库依赖/调用数据，历史 migration 原样保留 |
| P3-03 | 保留 | metadata.storage_backend 仍区分历史 Storage/OSS；迁移、清扫及 RPC 内部依赖均存在，未执行数据迁移或删对象 |
| P3-04 | 保留 | refresh、本地文件和单作品 GET 是可被仓库外调用的 HTTP 接口；没有访问日志/消费者清单，原路由保留 |
| P3-05 | 保留 | 双部署目标、变量开关、keepalive、手工运维可能仍有效；未改变现有调度、DNS、部署或平台配置 |
| P3-06 | 保留 | public 素材可被外链访问，原设计稿/发布快照有保留价值；未移动或删除原素材、截图和 GPU 虚拟环境 |
| P3-07 | 完成 | 示例改为维护文档，删除独占辅助函数；批次 15 |

## 实际精简量与最终验证

统计相对清理前基线 `f464f12`，不包含原先未提交的迁移/主题改动：

- 删除 8 个失联源码/示例文件，保留所有运行素材与历史 migration。
- `src`、`packages`、`server`、`miniapp/src` 下 JS/JSX/TS/TSX/CSS/SCSS（不含测试）共 39 个文件发生变化：增加 453 行、删除 2,984 行，**净减少 2,531 行**。其中包含示例和专属样式；不是打包体积统计。
- 删除 4 项闲置直接依赖；另补齐 date-fns、esbuild 及 TypeScript/TS ESLint 的必要直接声明。依赖总数/安装体积不据此宣称下降。
- 完整统一检查：115 项 Node 测试、23 项小程序测试；Web 与小程序类型检查、两端 lint、Web 内存构建通过。小程序实际生产构建通过。
- 浏览器回归：管理操作/重试/批量范围/响应式，以及图库缓存/离线/跨标签；业务请求全部 fixture 化。CSS 27 组稳定状态、元素与伪元素计算属性对比通过，动画关闭后比较，不代表真机方向/定位和生产写入已测试。
- 新文档相对链接验证通过；`git diff --check` 通过。远程 CI 未运行，未推送或部署，没有生产数据库、文件或邮件写入。
- 最终复核：34 个新增文档相对链接有效；后端字面量 HTTP 路由注册与基线 AST 比对一致，PATCH/POST 兼容模块、旧服务/Edge 源码、public/小程序素材及历史 migration 与基线没有差异。管理页、图库缓存及包含伪元素的 27 组 CSS 比较在最终代码上再次通过。

恢复时可从每批“恢复点”提取指定文件；整体源码起点为 `f464f12`。不要用全局 reset/clean 覆盖后续工作或清空用户原有的 artifacts。各批提交日志可用 `git log f464f12..codex/audit-cleanup` 查看。
