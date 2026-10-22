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
