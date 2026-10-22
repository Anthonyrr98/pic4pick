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
