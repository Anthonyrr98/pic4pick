# Code & Feature Audit — Pic4Pick

审计日期：2026-10-22（Asia/Shanghai）  
审计目录：`F:\Github\pic4pick`  
HEAD：`8ef3cd2663f293461aecbf199989b5141eba22be`  
审计基准：**当前磁盘工作区，包括原有未提交修改和未跟踪的 miniapp、packages 等文件，不仅是 HEAD。**

本轮只进行读取、静态分析、非破坏性检查，并新增本报告。未删除或重构业务代码，未安装或卸载依赖，未执行部署、数据库 SQL、上传、邮件发送、GPU 推理或线上业务写入。构建采用 `write:false`，未改写已有 `dist`。

## 1. 结论与精简空间

项目存在明确冗余，主要来自**未接入或被替代的 Web 实现、已收敛为 OSS 后仍保留的多上传方案，以及 Web/小程序迁移中的重复业务规则**。核心图库、管理、地图、点赞和空间照片功能均有实际调用链，不能据文件体积或复杂度认定多余。

本报告列出 **30 组发现：P0 9 组、P1 3 组、P2 11 组、P3 7 组**。等级表示冗余证据强度及处置方式，不表示故障严重性。

| 分类 | 可评估的精简范围 | 预期收益与限制 |
| --- | --- | --- |
| P0：确定无用 | 7 个完整源码文件，共 1,285 行；另有旧开场专属 CSS、未消费函数、常量、局部变量和上传 Hook 方法；4 项直接依赖声明 | 以减少维护负担为主。7 个文件及这 4 项依赖均未出现在本次 Web 构建模块列表，不能将删除行数等同于 JS 下载量下降 |
| P1：高度疑似冗余 | 非 OSS 上传路径、旧 Express 服务、Edge 签名直传 | 需核对旧部署及外部调用方；本轮不能确认线上零使用 |
| P2：重复或过度设计 | 媒体 URL、字段列表、API 地址规则、表单/地图、图片回退、CSS、类型、管理规则、清理服务中的公共片段、文档和检查配置 | 应逐项提取共同规则，保留平台和业务差异；不建议大规模一次性重写 |
| P3：潜在冗余 | 本地模式、旧数据库 RPC、历史空间存储、外部 API、部署组合、设计资产及示例 | 需要人工确认需求、运行数据或归档策略 |

优先级最高的区域是 `src/components` 和 `src/hooks` 中的失联实现、`src/utils/upload.js`、媒体 URL 工具，以及 `src/pages/Admin.jsx` 与 `src/App.css`。Admin 约 5,014 行、App.css 约 6,766 行（按换行切分计），体积本身不是删除依据，但确实聚集了多套职责和历史覆盖。

## 2. 架构、业务入口与引用分析方法

### 2.1 当前架构

| 层次 | 实际入口和主要流程 |
| --- | --- |
| Web | `index.html` → `src/main.jsx` → `src/App.jsx`。HashRouter 注册 `/` 和 `/admin`，通过 `lazy(import())` 加载页面 |
| 图库 | `src/pages/Gallery.jsx` 转导出 `gallery/GalleryPage.jsx`；公开数据源预取/缓存 → 数据映射 → 分类排序 → PhotoGrid；ExploreView 动态加载；实际灯箱写在 GalleryPage 内 |
| Web 管理 | `src/pages/Admin.jsx` → JWT 登录 → `adminApi.js` 写后端；OSS 文件上传与照片提交通过 `createPhotoSubmission` 维持重试和提交状态；审核、隐藏、批量操作和配置均有界面入口 |
| 后端 | `server/package.json` 的 start/dev、Dockerfile 和 Render 配置均启动 `server/server-enhanced.js`；后端处理认证、管理写入、点赞/IP/通知、媒体代理、上传及图片清理 |
| 小程序 | `miniapp/src/app.tsx`、`app.config.ts` 注册图库和 admin 分包。Taro 页面配置、声明文件、构建插件和素材复制是框架入口，不能依赖普通 import 图判断用途 |
| 共享层 | `packages/shared` 提供分类、字段、存储键、排序、分组、映射、提交事务、空间 shader/方向运算等。Web 原路径的多数文件已变为转导出层 |
| 数据库 | Supabase 公开读与服务端 REST/RPC 写入；19 个 migration 包括 RLS、点赞事件、空间任务和租约恢复。触发器也会间接调用 SQL 函数 |
| 后台任务 | `scripts/spatial-gpu/worker.mjs` 是独立入口；领取任务 → Python 推理 → OSS 发布 → RPC 完成。服务器另以定时器重试上传遗留物和删除清理任务 |
| 部署/运维 | GitHub Pages、条件启用的 OSS 部署、Supabase keepalive、Render、手动运维脚本；不能要求它们被前端 import |

`api/` 当前没有可审计的业务文件；实际 HTTP API 位于 Express 和 Supabase Edge Function。

### 2.2 扫描与验证边界

- 文件盘点覆盖 339 个第一方候选文件，其中 178 个 JS/JSX/TS/TSX/MJS/CSS/SCSS 文件。排除依赖、Git 元数据、已有构建产物、日志、实验虚拟环境和历史截图/发布产物；这些目录的用途另行核查，没有把第三方代码计入冗余。
- 使用本地已有 Babel parser 构建静态 import、字面量动态 import、require 和再导出关系，扩展解析 `.js/.jsx/.ts/.tsx`、index 文件与样式导入；入口遍历初步触达 120 个文件。该数是源码图口径，不是最终打包模块数。
- 进一步检查 React 懒加载、路由、Taro 配置/插件/素材模板路径、事件订阅、定时器、独立 CLI、HTTP 注册、SQL 触发器和 RPC 调用。没有发现足以使下列 P0 文件重新成为入口的运行时 glob、反射或依赖注入注册。
- 对未使用符号结合 AST 绑定引用、所有调用方的参数/返回值使用情况和现有工具诊断判断；TS 类型引用单独处理，没有把 Babel 未识别为值引用的类型 import 当作死代码。
- 使用实际 Vite 配置执行完整**内存构建**，将候选模块与最终模块列表交叉核对。模块不在产物里只是一项证据，P0 同时要求没有其他框架/脚本/外部入口。
- 使用 PostCSS 检查 App.css 的规则、选择器与相同 media 上下文；不会仅凭选择器重复就宣称可以删除。
- 不读取生产数据库内容或远程调用日志。因此外部 API、线上旧 RPC、素材 URL、部署开关和历史数据比例均保留人工确认项。

报告位置采用仓库相对路径和当前工作区一基行号。二进制素材没有源码行号，给出相应引用或复制配置的位置。置信度指“对所列冗余性质的把握”，不代表在未经回归验证下可以跨业务边界删除。

## 3. 已执行检查与检查盲区

环境：本机 Node.js `v24.11.1`；全部使用现有 `node_modules`，无依赖安装。

| 检查 | 结果 | 可支持的结论 |
| --- | --- | --- |
| `node --test`：server 下 8 个、scripts 下 8 个 `*.test.js/*.test.mjs` | **105 项通过，0 失败/跳过** | 覆盖点赞/通知、兼容路由、OSS、删除/上传事务、提交、空间输入/深度、图库缓存等现有契约；网络型测试使用 mock 或本机临时服务 |
| 小程序现有 `tsx --test tests/*.test.ts` | **23 项通过** | 7 个测试文件；覆盖共享/管理/地图/环境/详情/空间资产契约 |
| 小程序 `tsc --noEmit --incremental false` | **通过** | 覆盖 src、config、tests、共享层 |
| 小程序额外启用 `--noUnusedLocals --noUnusedParameters` | 仅报共享 `geoUtils.ts:11` 的 `seconds` 未使用 | 提供一项确定可删的局部变量；不等于已证明所有导出都被使用 |
| 小程序现有 lint：`src config` | **25 个文件，0 错误/警告** | 当前 lint 命令不覆盖共享层和 tests |
| 根目录 `eslint . -f json` | **558 个文件，6 错误、6 警告** | 诊断全部来自 `.artifacts/.../.venv/...` 第三方 JS；不是业务代码的 6 项缺陷 |
| 缩小范围的根 ESLint：`src server scripts vite.config.js eslint.config.js --no-warn-ignored` | **通过** | 受现有规则匹配范围限制，不能当作 TS/TSX/MJS 全覆盖 |
| 用已有小程序 TypeScript 检查根 `tsconfig.json`：`--noEmit --incremental false -p tsconfig.json` | **31 个既有错误**：TS7016 ×19、TS6133 ×9、TS7006 ×2、TS2308 ×1 | JS 声明缺失、旧灯箱无用绑定、共享 seconds、TabStrip 隐式 any 和 BrowserLocation 重复再导出；本轮未修复 |
| 按 Vite 配置 `build({...config, configFile:false, build:{...config.build, write:false, emptyOutDir:false}})` | **通过：8 个 JS chunk、305 个模块** | 验证打包链与字面量懒加载，未写构建产物。上述 7 个 P0 文件、示例文件、i18next 系列和 nanoid 均不在模块列表 |

内存构建最初使用 Node 的 `--input-type=module` stdin 运行时，Terser worker 出现 `require` 作用域错误；改用普通 Node stdin、通过动态 import 加载 Vite 后，同一构建配置通过。这属于本轮检查载体的限制，不列为项目构建缺陷。

未执行浏览器/真机 UI smoke、SQL 合同测试、真实文件上传、生产写入、邮件和 GPU worker；当前测试通过不能证明这些端到端行为已验证。本报告对后续清理的回归要求包含这些边界，不会用现有单测替代界面与真实数据验证。

## 4. P0：确定无用

### P0-01 — 未接入的旧全屏开场与专属样式

- **位置/对象**：`src/components/HomeIntroSplash.jsx:139`（整文件 400 行）；`src/App.css:5651` 起至 `:5725` 的 `.home-intro-*` 专属规则。
- **依据与引用**：没有 import、动态加载或组件注册；Vite 模块列表没有该文件。所有 `home-intro-*` DOM 类只由该组件生成。实际开场是 `src/App.jsx:26` 的 `AppLoading` 及 `:59` 起的状态/定时器，使用另一组类名与会话键。
- **影响**：删除候选不会移除当前加载开场；能移除不再渲染的粒子采样/消散实现和仍进入全局 CSS 的专属规则。
- **建议/置信度**：整文件与专属 CSS 同批删除；保留 AppLoading 及其资源。**99%**。

### P0-02 — 已撤下的图片压缩工具面板

- **位置/对象**：`src/components/admin/ToolsPanel.jsx:11`，整文件 274 行。
- **依据与引用**：无调用方或路由入口；构建不含该文件。`src/pages/Admin.jsx:322` 明确留有“工具：图片压缩模块（已移除）”注释。真实上传仍由 Admin、`upload.js` 和提交事务负责。
- **影响**：删除只移除失联的独立工具实现；**不能连带删除**仍用于上传的 `compressImage` 或 `exifr`。
- **建议/置信度**：删除面板，更新声称该工具仍在使用的文档。**99%**。

### P0-03 — 两个从未接入当前页面的 Hook

- **位置/对象**：`src/hooks/useMapInitialize.js:18`（200 行）；`src/hooks/useLocationPicker.js:11`（108 行）。
- **依据与引用**：均无源码调用方，构建不含二者。前者仅在重构文档示例中出现；真实地图使用 `src/pages/gallery/hooks/useMapInit.ts`、PhotoLocationMap 和 ExploreView。后者的编辑分支多处仅剩注释；真实上传/编辑选点位于 `src/pages/Admin.jsx:571`、`:694`、`:941`。
- **影响**：不影响现有地图或选点；会使旧文档示例失效，因此需同步修正文档。
- **建议/置信度**：删除两个文件，不为复用它们而倒改成熟页面。**99%**。

### P0-04 — 未接入的旧灯箱与孤立 barrel

- **位置/对象**：`src/pages/gallery/components/LightboxPanel.tsx:34`（144 行）；`src/pages/gallery/index.ts:6`（22 行）。
- **依据与引用**：LightboxPanel 唯一入边是该 index 的再导出；index 没有调用方，两者均不在构建里。页面入口 `src/pages/Gallery.jsx:2` 直接转导出 GalleryPage，实际灯箱在 `src/pages/gallery/GalleryPage.jsx:850` 一带。类型检查还发现旧灯箱的 4 个 import、2 个参数和 2 个局部变量未使用。
- **影响**：可以整组删除；index 导出的其他 Hook、组件仍被页面直接引用，**不能顺着 barrel 把它们删掉**。
- **建议/置信度**：删除旧灯箱和孤立 index；保留真实灯箱的键盘、焦点、导航和空间效果。**99%**。

### P0-05 — 浏览器端长期密钥签名旧实现

- **位置/对象**：`src/utils/ossSignature.js:40` 的 `generateOSSSignature`、`:81` 的 `generateOSSPutSignature`，整文件 137 行。
- **依据与引用**：无调用方，构建不含该文件；当前 OSS 上传 `src/utils/upload.js:463` 通过受管理员 JWT 保护的后端，签名不使用此模块。仓库没有把此文件作为浏览器独立脚本或公开模块入口。
- **影响**：不影响当前 OSS 上传；与 `server/ossPhotoUpload.js` 和 Edge Function 是不同实现，不能混删。
- **建议/置信度**：删除整个旧浏览器签名模块。**99%**。

### P0-06 — 确定没有消费者的常量与局部计算

| 位置 | 对象 | 证据、影响与建议 | 置信度 |
| --- | --- | --- | --- |
| `src/pages/Admin.jsx:36` | `FILM_STOCK_OPTIONS` | AST 无任何绑定引用，亦无 JSX datalist 消费；不影响用户输入/存储 filmStock，可删数组 | 99% |
| `packages/shared/constants/locationData.ts:168` | `explorePins` | 只在自身定义和历史模块说明中出现；真实标记由照片地点分组产生，小程序动态构造 markers；可删示例数组，保留 cityMeta/provinceCityData | 99% |
| `src/utils/gaodeMapStyle.ts:83` | `AMAP_MAP_STYLE_WHITESMOKE` | 已标 deprecated，无消费者；默认样式来自预设对象及 getActiveMapStylePreset；可删常量 | 99% |
| `packages/shared/geoUtils.ts:11` | `seconds` | TS6133 和绑定分析均确认未读，当前返回值不使用秒值；仅删该无副作用计算，不改坐标显示格式 | 100% |

### P0-07 — 没有使用者的内部导出与包装

| 位置/对象 | 引用分析与影响 | 清理建议/置信度 |
| --- | --- | --- |
| `src/utils/errorHandler.js:99` `configureErrorHandler` | 无消费者；只提供修改 errorConfig 的能力。handleError/safeAsync 等实际使用的错误处理逻辑仍需保留 | 删未使用配置入口；暂不扩大到重写错误系统。99% |
| `src/utils/envConfig.js:49` `getEnvOverrides` | 无调用方；实际设置读取/更新通过 getEnvValue、updateEnvOverrides、resetEnvOverrides | 删这个快照导出。99% |
| `src/utils/adminApi.js:56` `fetchAdminPhoto` | 所有客户端均未调用此 Web 封装；管理界面用列表加载。后端对应 GET 接口仍可能外部使用 | 只删客户端封装，不删后端路由。99% |
| `src/utils/auth.js:137`、`:141` `logout` / `isAuthenticated` | 无调用方；clearAuthToken、getAuthToken、verifyToken 则有真实内部调用 | 删两个闲置包装；保留实际令牌清理与校验。99% |
| `src/utils/urlUtils.js:278`、`packages/shared/mediaUrls.js:278` `ensureHttpsForFields` | 两份函数都无消费者，无 namespace/反射访问；实际代码调用单 URL/媒体函数 | 删除两份未用函数；不要因此删除内部仍使用的 ensureHttps。99% |
| `src/components/ErrorBoundary.jsx:149` `withErrorBoundary` | HOC 无调用方；`src/App.jsx:6` 使用 ErrorBoundary 组件本身 | 删 HOC，保留 ErrorBoundary。99% |

### P0-08 — 上传 Hook 只被当作状态容器使用，操作方法无人消费

- **位置/对象**：`src/hooks/useFileUpload.js:19` `uploadFile`、`:73` `resetUploadState`；唯一调用点 `src/pages/Admin.jsx:288`。
- **依据与引用**：唯一消费者只解构状态和 setter，没有读取、传递或调用两个方法。实际上传在 `Admin.jsx:1502` 的 `handleUpload`，调用带 uploadId 的提交事务，并自行控制进度。不是把两个同名局部变量误认为同一函数。
- **影响**：删未消费的方法不会移除实际上传；不能直接把 Admin 改用旧 uploadFile，因为旧包装缺少当前提交事务和重试上下文。
- **建议/置信度**：删除两段方法、返回对象成员及随之不用的 import；是否保留独立状态 Hook 放到后续可读性评估。**99%**。

### P0-09 — 四项没有第一方使用的直接依赖

- **位置/对象**：`package.json:30` `i18next`、`:31` `i18next-browser-languagedetector`、`:37` `react-i18next`、`:33` `nanoid`。
- **依据与引用**：检查源码、配置、脚本、测试、构建/插件字符串及依赖树后，没有国际化初始化、Provider、翻译资源入口、语言切换或 nanoid 调用；构建模块列表也无它们。当前 ID 生成使用其他路径。nanoid 另为 PostCSS 的传递依赖，这与根直接声明的用途不同。
- **影响**：可删根直接声明；需在获准后的正常依赖维护中更新锁文件。不能承诺 nanoid 完全从 node_modules 消失，也不能宣称此次删除会降低当前首屏 JS 体积。
- **建议/置信度**：清理四项直接依赖，保留 PostCSS 需要的传递依赖；未来新增多语言时重新引入所需方案。**99%**。

## 5. P1：高度疑似冗余

### P1-01 — OSS 单路径产品仍维护五种上传方案

- **位置/对象**：`src/utils/upload.js:11`、`:128` 的多方案分派；`:214` Base64、`:246` 通用 API、`:306` Cloudinary、`:360` Supabase Storage；`src/utils/adminUtils.js:111` 的名称映射。
- **依据与引用**：`src/pages/Admin.jsx:301` 将 uploadType 固定为 OSS，`:304` 还会把旧存储值重置为 OSS；没有上传方式选择器。小程序 `miniapp/src/platform/admin.ts:74` 同样只上传 OSS。几个分支共享大量 XHR 进度/错误处理，却无当前产品入口。
- **影响**：删旧分支可减少约 190 行上传实现及分派/配置负担；但 uploadImage 的 override 参数、持久化旧值和历史独立集成尚需确认。Base64 曾服务本地模式，也不能与全项目本地模式简单等同。
- **建议/人工确认/置信度**：确认不再支持四种旧上传方式后，收敛为 OSS；同步清理类型、名称映射、旧配置文档和确定恒定的 Admin 分支，保留进度与失败重试。**95%**。

### P1-02 — 当前客户端禁止使用的 Edge 签名直传仍作为可部署功能存在

- **位置/对象**：`supabase/functions/upload-oss/index.ts:128` 的 Deno HTTP 入口、`supabase/functions/_shared/cors.ts:3`；相关部署说明 `supabase/functions/README.md:5`。
- **依据与引用**：`src/utils/upload.js:476` 起在发送文件前识别并拒绝 Edge 签名 URL；`scripts/oss-upload.test.mjs:112` 起专门覆盖禁用行为。当前小程序没有该调用链。文档仍介绍它，说明新旧方案在仓库并存。
- **影响**：本项目现行客户端不依赖此函数，但已部署的函数可能被外部客户端或旧版本直接访问；普通 import 图不能证明服务端入口无用。
- **建议/人工确认/置信度**：核对 Edge 部署和调用日志，再决定撤下函数、CORS 辅助和旧部署指南；保留客户端拒绝旧地址的防护，直到配置迁移完成。**95%（对当前客户端无使用）；线上可下线需确认**。

### P1-03 — 旧 Express 服务与增强服务重复维护

- **位置/对象**：`server/server.js:32`、`:85`、`:251` 等，约 395 行；旧服务 fallback 见 `server/start-enhanced.sh` 文件末尾。
- **依据与引用**：`server/package.json:7` 起、`server/Dockerfile:22` 和 `render.yaml:8` 的正式启动链均使用 server-enhanced.js。旧服务仍复制健康检查、本地上传、列表、代理、OSS 上传/删除等功能，且与当前接口/保护条件不完全一致。
- **影响**：删除不会改变仓库声明的默认服务启动，但旧部署可能直接执行 `node server.js`，启动脚本也保留显式 fallback。不能当作 P0。
- **建议/人工确认/置信度**：核对实际进程启动命令与运维引用；统一增强服务后，再删旧文件、fallback 和旧启动说明。不要为消除重复而降低增强服务的认证保护。**95%**。

## 6. P2：重复或过度设计

### P2-01 — 媒体 URL 工具接近整文件复制

- **位置/对象**：`src/utils/urlUtils.js:1` 与 `packages/shared/mediaUrls.js:1`，分别约 293/294 行。
- **依据与引用**：逐行 diff 除空行外，只有 `:140` 的代理开关来源不同：Web 读取 `import.meta.env.VITE_USE_OSS_MEDIA_PROXY`，共享层读取 `globalThis.__PIC4PICK_USE_OSS_MEDIA_PROXY__`。Web 的 8 处模块引用与小程序 media/detailMetadata 分别使用两份实现；两份都在使用，不能删掉其中一份而不迁移调用。
- **影响**：预览尺寸、原图恢复、历史 ore 路径和代理修复容易只改一端。共享层的 global 开关只有读取，没有项目内设置来源，也需要明确契约。
- **建议/置信度**：把纯规则统一到 shared，以显式参数/工厂注入平台代理配置，Web 保留薄适配；不要依靠隐式 global 传配置。可消除接近一份文件的重复，但需验证两端图片、下载、代理和回退。**100%（重复事实）**。

### P2-02 — 后端再次维护完整照片字段列表

- **位置/对象**：`packages/shared/photoFields.js:1` 与 `server/server-enhanced.js:368` 的 `PHOTO_SELECT_FIELDS`。
- **依据与引用**：字段序列一致；Web 和小程序已消费共享列表，后端仍本地复制，并用它构建管理查询及允许选择字段集合。
- **影响**：增加字段时易发生查询结果漂移；但 Render 的 `rootDir: server` 和 Docker 当前只复制 server，直接引用 `../packages` 会破坏独立部署。
- **建议/置信度**：先确定共享包发布/打包方式，再统一列表或在现有检查中验证一致性；保留后端的字段白名单职责。**100%**。

### P2-03 — Web API Base URL 规范化规则多处复制

- **位置/对象**：`src/utils/auth.js:12`、`src/utils/adminApi.js:5`、`src/pages/gallery/hooks/usePhotoData.ts:15`，以及 `src/utils/spatialDepth.js:19`、`:117` 一带。
- **依据与引用**：同样读取 VITE_API_BASE_URL、trim、去尾斜线与 `/api` 再拼路径；分别被认证、管理、点赞和空间请求使用。不是未使用代码。
- **影响**：修复地址规则时容易遗漏一条业务路径；认证/响应解析和取消逻辑则有实际差异。
- **建议/置信度**：先共享一个小的 URL 构造函数，保留各请求层；不要借此强行合并 fetch、XHR 与 Taro.request。**99%**。

### P2-04 — Admin 上传/编辑选点及字段组维护两套

- **位置/对象**：`src/pages/Admin.jsx:571` 与 `:941` 的 MapLibre 初始化；`:694` 搜索、`:842` 搜索结果选择；`:1502` 上传与 `:2012` 编辑提交。
- **依据与引用**：上传和编辑分别持有容器、实例、标记、搜索状态，并复制中心点/标记/点击位置处理和表单字段。二者均有真实 UI 入口；旧 useLocationPicker 未参与这些调用，不能视为已经复用。
- **影响**：地图样式、定位回填、器材/胶片等字段容易两边不一致；上传涉及文件和事务，编辑涉及现有记录，不能合成一个庞大万能表单。
- **建议/置信度**：提取复用的选点组件、位置搜索结果转换和字段展示组，保留独立的上传/编辑提交控制器；验证弹窗关闭、地图销毁、异步取消和两种回填。**97%**。

### P2-05 — 图片失败后的候选回退算法重复

- **位置/对象**：`src/pages/gallery/components/PhotoGrid.tsx:197` 与 `src/pages/gallery/GalleryPage.jsx:877` 一带的 onError；小程序对应 `miniapp/src/components/PhotoImage.tsx:1`。
- **依据与引用**：Web 两处均读取 dataset 回退索引、跳过当前 URL、清空 srcset/sizes、尝试下一候选，最后进入失败状态。调用场景不同，但候选推进规则高度一致。
- **影响**：修复循环回退和 srcset 时可能只修一处；灯箱和缩略图的失败展示、比例状态和空间图片引用不能混为一谈。
- **建议/置信度**：先提取纯候选推进规则或小 Hook；保留各视图错误状态与 platform adapter。不要重写成一个控制所有图片行为的大组件。**98%**。

### P2-06 — App.css 多轮覆盖聚集，存在重复规则

- **位置/对象**：`src/App.css:3685`、`:5738`、`:6489` 的 768px `.lightbox-panel`；`:3776`、`:3820`、`:5885` 的同 media `.lightbox-meta`；`:3771` 与 `:5822` 的相同规则。
- **依据与引用**：PostCSS 共解析到 915 条规则。最后两处 `.lightbox-content-wrapper.meta-visible .lightbox-media::after` 在相同 media 下声明完全相同；另有多组同选择器同上下文的重复/覆盖。`themes.css` 和 `darkroom.css` 又提供有意的主题覆盖。
- **影响**：增加判断最终样式的成本，旧实现的属性可能只被部分覆盖。即使两条规则文本相同，夹在中间的规则也可能使后一次重申生效，故没有将一般 CSS 重复列为 P0。
- **建议/置信度**：以最终 computed style 为基准整理基础、响应式、主题三层；先清 P0-01 专属旧样式，再按灯箱区域合并，覆盖桌面、480/768px、方向与全部主题的截图回归。**100%（重复/覆盖事实）；具体可删行需视觉验证**。

### P2-07 — 重复 BrowserLocation 类型导致出口冲突

- **位置/对象**：`packages/shared/photoFilterUtils.ts:10` 与 `src/pages/gallery/hooks/useExifAndLocation.ts:15`；冲突出口 `src/pages/gallery/index.ts:14`。
- **依据与引用**：两者均为 `{ lat: number; lon: number }`；孤立 index 的多个 export-star 使根类型检查产生 TS2308。类型本身在真实筛选和定位 Hook 中都有用途。
- **影响**：删 index 可消除该出口冲突，但重复类型仍存在；不能直接删除定位 Hook 或筛选逻辑。
- **建议/置信度**：使用共享坐标/位置类型，再按语义命名；短期可随 P0-04 删除孤立出口，长期统一契约。**100%**。

### P2-08 — 两端管理业务规则已有共享实现，但 Web 仍维护自己的版本

- **位置/对象**：`packages/shared/adminWorkflow.ts:5` 的页大小及筛选/审核/批量规则，对照 `src/pages/Admin.jsx:484`、`:487`、`:1786` 和 `src/hooks/usePhotoManagement.js:17`；`packages/shared/adminSettings.ts:26`、`:31` 对照 `src/utils/gaodeMapStyle.ts:20`、`:37`。
- **依据与引用**：小程序使用共享 reviewPatch/runPhotoBatch/设置转换；Web 仍本地维护页大小、审核 patch、批量部分成功处理，以及相同的地图预设到四个环境字段的转换。平台 UI 不同，但这些纯规则不依赖 DOM 或 Taro。
- **影响**：拒绝原因、重新提交、部分成功、配置字段保留等细节可能出现两端偏差；表面相似不代表当前语义完全相同。
- **建议/置信度**：逐项比对并收敛纯规则，以现有批量、重新提交和设置测试保护行为；保留两端 UI 状态、错误提示和请求适配。**96%**。

### P2-09 — 上传遗留物与删除任务复制了安全清理片段

- **位置/对象**：`server/photoDeletion.js:35`–`:53` 与 `server/photoUploads.js:32`–`:47`。
- **依据与引用**：两处均验证资产属于当前 bucket/允许路径、转义 key、查询其他照片的 image/thumbnail 引用，再删除并忽略 NoSuchKey/404。已有共用 getPhotoOssAssets，但其后公共步骤仍重复。
- **影响**：路径/引用检测修复可能漂移；两个服务的任务创建、锁、保留期和“照片是否已经存在”语义不同，而且决定是否删除真实文件。
- **建议/置信度**：仅提取小的资产引用查询/安全删除辅助，保留两个服务和各自事务顺序；保留重试、共享引用和响应丢失测试，不合并成一个通用任务框架。**97%**。

### P2-10 — 完整历史文档多处并存，部分与源码状态冲突

- **位置/对象**：`server/DEPLOYMENT_GUIDE.md:1` 与 `docs/deployment/platforms/backend-deployment-guide.md:1`；`docs/MAP_REFACTOR_GUIDE.md:14`、`docs/engineering/map-refactor-guide.md:15`；`docs/PROJECT_DOCUMENTATION.md:368` 一带的旧模块清单。
- **依据与引用**：保留多份完整/摘录版部署与重构文档，部分仍推荐无调用方的 useMapInitialize、ToolsPanel、ossSignature；新工程记录则说明它们没有接入。不同文档不全是字节一致副本，不能批量按文件名删除。
- **影响**：新维护者会尝试接入已经撤下的功能或旧上传链。`docs/API.md`、`docs/DEVELOPMENT.md` 等仅几行的迁移跳转说明则有链接兼容用途，不是重复正文。
- **建议/置信度**：确定唯一当前正文；历史实施报告标日期并归档，旧正文保留短跳转；随代码清理修正现状。**98%**。

### P2-11 — 检查配置过宽与覆盖不足并存

- **位置/对象**：`eslint.config.js:8`、`:10`、`:26`、`:32`；根 `package.json:11` lint；`tsconfig.json:31` 起；`miniapp/package.json:9`、`miniapp/tsconfig.json:3`。
- **依据与引用**：根 `eslint .` 会进入 `.artifacts` 的第三方虚拟环境；规则只匹配 src 的 JS/JSX，以及部分服务端/脚本 JS，没有实际覆盖所有 TS/TSX/MJS。`varsIgnorePattern: '^[A-Z_]'` 也放过了 FILM_STOCK_OPTIONS。根 tsconfig 没有 allowJs，当前混合工程产生多项 TS7016；miniapp typecheck 可用但没有默认启用 noUnused，lint 又不含 shared/tests。
- **影响**：浪费扫描成本并制造“lint 已通过即无冗余”的错觉；这是审计基础设施问题，不是要求新增业务抽象或重复测试。
- **建议/置信度**：限定第一方检查目录、排除产物/虚拟环境，明确 TS/MJS 覆盖及混合 JS/TS 策略，提供统一的非写入验证入口；谨慎缩小大写名称豁免。不要只通过关闭诊断取得全绿。**100%**。

## 7. P3：潜在冗余，需人工确认

### P3-01 — 云图库与本地持久化模式并存

- **位置/对象**：`src/pages/gallery/hooks/usePhotoData.ts:37`、`:70`–`:96`；`src/hooks/usePhotoManagement.js:17`；`src/pages/Admin.jsx:392`、`:406`。
- **依据与引用**：未配置 Supabase 时，图库、待审核/通过/拒绝列表仍走 localStorage；图库订阅 storage 并每秒比较快照。当前默认业务有云服务，但代码存在明确可达的无云分支。
- **影响**：移除会影响离线/演示/配置失败时的行为以及历史本地作品；同页面写 localStorage 不自动触发同一窗口的 storage 回调，因此不能仅因已有监听就删轮询。
- **建议/人工确认/置信度**：确认是否仍承诺本地模式、是否需迁出历史数据；保留时可统一同页面写入事件并评估轮询，不能先删除数据通道。**75%（可能精简，需求未定）**。

### P3-02 — 旧点赞 RPC 为兼容而保留

- **位置/对象**：`supabase/migrations/20260910141626_secure_like_updates.sql:1` `update_public_photo_likes`；后继 `20261012072633_record_photo_like_ips.sql:18` 起；实际调用 `server/photoLikes.js:18`。
- **依据与引用**：当前后端只调用带 IP 的新 RPC；后继 migration 注释明确要求部署过渡期间保留原 RPC。没有检查生产数据库的函数依赖、旧后端版本和调用日志。
- **影响**：旧后端或外部集成可能依赖原 RPC；历史迁移也承担重建与升级职责。
- **建议/人工确认/置信度**：确认所有调用方升级及数据库依赖后，通过**新的 migration**退役旧 RPC；绝不删除/重写已执行的历史 migration。**90%（当前源码未调旧 RPC）；可下线需确认**。

### P3-03 — 空间深度仍支持历史 Supabase Storage 与 OSS

- **位置/对象**：`src/utils/spatialDepth.js:17`–`:31`、`miniapp/src/platform/spatial.ts:1` 起；`scripts/spatial-gpu/worker.mjs:20`、`:135`、`:145`；`scripts/spatial-gpu/transfer-to-oss.mjs:1`。
- **依据与引用**：新 worker 在 `:175` 上传 OSS 并调用 complete_spatial_job_oss；前端仍按 metadata.storage_backend 读取两种存储，worker 仍清扫历史 Storage。仓库提供显式迁移工具，说明历史数据尚是需要考虑的边界。
- **影响**：删历史分支可能让已有空间照片无法显示。SQL `complete_spatial_job` 也被 `complete_spatial_job_oss` 内部调用（`20261012164932_spatial_depth_oss_storage.sql:43`），不能因 worker 不直接调用就删。
- **建议/人工确认/置信度**：先只读统计 storage_backend 和迁移状态，完成逐对象验证、切换及保留期后再考虑收敛；迁移脚本有 `--switch/--remove-source`，本轮未运行。**80%**。

### P3-04 — 仓库客户端未用的 HTTP API 不等于无用

- **位置/对象**：`server/server-enhanced.js:236` 本地上传、`:277` 本地删除、`:300` 图片列表、`:818` token refresh、`:843` 单作品 GET。
- **依据与引用**：当前 Web/小程序主要走 OSS 上传、管理列表及 verify，未找到 refresh 调用；但这些已注册的 HTTP 接口可供脚本和仓库外客户端直接请求。文档也公开过相关接口。
- **影响**：删除可能破坏外部集成、历史本地文件或运维工具；客户端闲置封装可删并不意味着服务端可同步删。
- **建议/人工确认/置信度**：结合访问日志、API 消费者清单和本地 uploads 数据确认，再分阶段停用。**85%（项目内缺少消费者）；业务需求未定**。

### P3-05 — 多部署链与 keepalive 的必要性需要运维决定

- **位置/对象**：`.github/workflows/deploy.yml:3`、`deploy-oss.yml:3`/`:18`、`supabase-keepalive.yml:3`；`render.yaml:1`、`server/Dockerfile:1`、`server/start-enhanced.sh:1`、`build-all.sh:1`。
- **依据与引用**：main push 对应 Pages 和可选 OSS 两条前端构建部署；OSS 有 repository variable 条件。keepalive 每日三次读表。Render/Docker/手工脚本也各自声明启动流程。它们均有独立入口，没有被 import 是正常情况。
- **影响**：若双目标是主备或迁移方案，则都有用途；仓库无法确认 OSS_FRONTEND_ENABLED、生产 DNS/托管责任、数据库套餐及保活需求。
- **建议/人工确认/置信度**：确认唯一生产/备用目标和实际调度后，合并公共构建步骤或停用不再使用的路径；不能因为本地没有调用就删任务。本轮没有执行会安装依赖或部署的脚本。**70%**。

### P3-06 — 历史设计素材、截图与发布快照有归档空间

- **位置/对象**：`public/images/film-workbench.png`、`film-paper-label.png`、`film-monochrome-label.png`、`film-canister-label.png`、`film-amber-label.png`（二进制无行号）；`public/loa.png`；`miniapp/src/assets/map-pin*.png/svg` 和 `map-dots/*.svg`；`artifacts/releases/*`、主题截图目录。
- **依据与引用**：当前暗房样式只引用 `src/themes/darkroom.css:141` 的 film-desktop.png，以上另外 5 张 PNG 无当前源码/配置 URL 消费，共 **10,783,241 字节（约 10.28 MiB）**。小程序标记实际由 `miniapp/src/components/ExploreView.tsx:22` 动态选择 map-dots 的 PNG；SVG 更像源素材。`miniapp/config/index.ts:34` 会复制整个 assets 目录。发布快照和图片可能供回滚、设计迭代或外部 URL 使用。
- **影响**：从 public 移出素材可减少今后发布文件体积，但用户原始设计稿、外链、缓存和回滚记录不能仅因当前无引用而删除；loa-cropped.png、loa-loading.webp、film-desktop.png、三张 film-frame 源图、动态 map-dots PNG 与预设缩略图仍有明确用途。
- **建议/人工确认/置信度**：确认后将未使用设计源稿移出 public/小程序运行素材目录，制定截图/发布快照保留策略；优先归档，避免销毁。`.artifacts` 的 Python 环境还被 worker 默认路径引用，不能按“缓存”整体清空。**90%（无当前静态消费者）；保留价值需确认**。

### P3-07 — 错误处理示例与仅示例消费的辅助函数

- **位置/对象**：`src/utils/errorHandler.example.js:1`（191 行）；`src/utils/errorHandler.js:312` `isNetworkError`、`:328` `isPermissionError`。
- **依据与引用**：示例没有运行入口或测试入口，不进入 Web 构建；两个分类辅助的唯一外部源码消费者是该示例。它与完全失联业务模块不同，可能有教学/维护说明价值。
- **影响**：移除示例不会改变现有业务；直接删除可能损失错误处理约定。createError、AppError、ErrorSeverity 等还在实际错误系统内部使用，不能连带清除。
- **建议/人工确认/置信度**：确认文档用途后移入 docs 并校正，或整体删除示例及无实际使用的辅助函数；不把示例代码保留在运行源码目录作为功能。**99%（不参与运行）；文档保留价值需确认**。

## 8. 已排除的误报与明确应保留的设计

| 看似冗余的对象 | 实际用途/为何不列为可删业务 |
| --- | --- |
| `src/pages/Gallery.jsx` | App 的 lazy import 直接消费此转导出；不同于没有调用方的 gallery/index.ts |
| Web 的 `photoFields/photoSubmission/photoCategories/storageKeys`、gallery utils/constants 转导出 | 迁移 shared 后保留旧导入契约，多数只有一行；它们不是第二套业务实现。仅为减少文件数迁移所有 import 收益有限 |
| `src/utils/spatialPixels.js:1` | 当前只有 spatial-input 测试消费，但转导出的 shared 实现被小程序运行路径使用；可换测试导入后移除薄壳，不能删 shared 算法或测试 |
| ExploreView、maplibreLoader | lazy/import() 和视图切换会间接使用；不是无入口文件 |
| Taro `index.config.ts`、`app.config.ts`、`env.d.ts`、Babel/插件声明 | 框架约定、类型环境和构建时入口；无普通 import 不构成证据 |
| 两种 React 版本及三份 package/lock 文件 | Web React 19、小程序 React 18 和 server 独立依赖/部署边界；当前迁移记录明确要求共享纯代码，不能强制共用 React 或简单删锁文件 |
| miniapp 的 Taro helper/runtime/shared/react-dom 等依赖 | 构建/运行时可间接消费，没有源码 import 不足以认定闲置 |
| `ali-oss` 的根和 server 声明 | 根用于 scripts/deploy-oss，server 用于服务和存储；两个安装边界下都有用途 |
| 字体包、GSAP/@gsap/react、terser、Playwright、Supabase CLI | 分别通过 CSS import、主题组件、Vite minify、smoke 工具、运维命令使用；不能只查 JS import |
| `server/miniappCompatibility.js:2`、`:6` 的 PATCH/POST 双路由 | Web 和小程序采用不同方法，两者复用同一鉴权/限流/处理器，兼容测试还验证共享限流；这是有效适配，不是重复业务实现 |
| 上传提交、上传遗留物和删除清理服务 | 处理响应丢失、幂等重试、共享引用和持久化清理；虽复杂但具有数据完整性价值，不应以“减少代码”为由撤销 |
| `queue_photo_spatial`、`claim_spatial_job`、租约恢复与 complete 函数 | 分别由数据库触发器、独立 worker、RPC 内部调用；没有前端引用并不等于死代码 |
| 品牌/地图/主题事件、缓存刷新和定时器 | 存在注册者及订阅者；同页、跨页和恢复可见时的同步具有不同触发条件，不能笼统认作重复请求 |
| Admin 的两次 `exifr.parse`（`:1187`、`:1193`） | 配置分别为 raw GPS 与翻译/筛选后的拍摄参数；可优化但当前不属于完全同功能重复，合并需验证不同图片格式的输出 |
| `.artifacts` 与 worker 的 Python 依赖 | worker 默认 Python 路径指向该目录的 GPU venv；当前不应作整体垃圾目录处理 |
| `docs/API.md` 等短迁移说明 | 保留旧链接可达性，正文已移动；应与重复完整文档区别处理 |

没有发现足以支持删除现行图库筛选、地图发现、胶片主题、管理员审核、点赞通知或空间照片功能的证据。它们有实际入口或后台调用链。

## 9. 依赖、配置与测试的处理建议

1. **依赖**：本轮确定可去掉的是根 4 项直接声明；其余包结合构建和脚本用途保留。`src/pages/Admin.jsx:4` 直接 import `date-fns/locale`，但根 manifest 未直接声明 date-fns，当前由 react-datepicker 带入。它是依赖归属不明确，不能当作“未用依赖”；后续应明确直接声明或调整导入契约。
2. **锁文件**：三套独立工程的锁文件不是相同文件的冗余副本；获准清理依赖后分别更新对应锁文件，不手工删除条目。
3. **测试**：现有单元测试确实保护不同契约，未发现应仅为减量而删除的整组测试。Node 测试和 miniapp 的空间/管理测试覆盖范围不同；源文件成为薄转导出后，测试可迁移到实际共享入口。
4. **脚本**：部分 `server/*.test.js`、小程序测试及 smoke 没有统一根级检查入口，不代表无人使用。建议明确单元/类型/lint/UI 检查范围。部署、重建预览、迁移、安装启动任务均有外部入口，不按 package scripts 里是否出现来判断死代码。
5. **配置**：优先修正 lint 扫描范围与混合 TS/JS 检查契约；平台部署配置的去留由实际托管职责决定。代码中拒绝旧 Edge 地址、旧静态 token、清理旧长期密钥等防护不应随旧功能一起过早删除。

## 10. 对七个最终问题的回答

1. **总体是否存在明显代码冗余？** 有。已确认失联实现和未消费符号，也存在多处仍在运行的重复规则；尚不能据此判断有哪个核心业务功能应该整块下线。
2. **哪些模块最严重？** Web 遗留组件/Hook 的闲置比例最高；upload.js 的功能方案冗余最明显；urlUtils/mediaUrls 的重复最直接；Admin.jsx 与 App.css 的维护复杂度和多轮并存问题最集中。
3. **哪些可以安全删除？** P0 列出的 7 个文件（1,285 行）、旧开场专属 CSS、未消费常量/函数/Hook 方法，以及 4 项直接依赖声明。后续实施仍应按小批次执行现有回归；本轮没有实际删除。
4. **哪些功能可能不再需要？** 非 OSS 上传、旧 Express 服务、Edge 签名直传最可疑；本地模式、旧 RPC、历史 Storage、refresh/本地文件 API 和双部署目标需人工确认，不能直接断言无用。
5. **哪些值得合并重构？** 优先共享媒体 URL 规则、API URL 构造和字段契约，再处理选点/字段组、图片回退、管理纯规则、CSS 和安全清理公共片段。
6. **预计精简哪些文件/模块/依赖？** 确定部分见 P0；P1 可进一步减少旧上传路径和约 395 行旧服务等。P2 可消除接近一份约 290 行媒体 URL 实现。经确认将 5 张闲置设计 PNG 移出发布目录，还可减少约 10.28 MiB 发布文件。各项有重叠，不能直接相加为项目压缩率，也没有实测删改后的压缩包收益。
7. **按什么顺序清理？** 按下面阶段推进，先消除确定无用的维护面，再收敛现行重复逻辑，最后退役外部契约和历史数据兼容。

## 11. 推荐清理顺序及验收

| 阶段 | 建议工作 | 应保留/补齐的验收证据 |
| --- | --- | --- |
| 0. 固定基线 | 保留当前未提交改动；确认本报告的具体清理范围；明确根检查的既有错误与覆盖盲区 | 记录工作树基准；避免把既有错误归因于清理 |
| 1. P0 内部代码 | 删除 7 个失联文件和专属 CSS，再清局部符号、未消费导出和 Hook 方法；同步修正文档 | 现有单测、定向 lint、小程序 typecheck、Web 构建；检查当前开场、地图、灯箱和上传入口 |
| 2. P0 依赖 | 获准后移除 4 项直接声明并正常更新根锁文件 | 正常安装解析与构建验证；不要求传递 nanoid 消失 |
| 3. 高收益纯规则 | 统一媒体 URL、API URL、字段/类型、地图预设与审核规则 | 原图/预览/旧路径/代理、批量部分失败、配置保留、两端契约回归 |
| 4. UI 与 CSS | 整理选点/字段组件、图片回退和灯箱样式；归档确认闲置的发布素材 | 桌面/手机截图，主题/分类切换、灯箱导航、原图下载、小程序素材及地图真机验证 |
| 5. P1 功能退役 | 确认消费者后下线非 OSS 上传、Edge 功能、旧 server.js | 实际部署启动命令、调用日志、上传/删除/重试、认证和运维文档 |
| 6. P3 数据与运维 | 评估本地模式、旧 RPC/Storage、外部 API、keepalive 与部署组合 | 用户需求、历史数据统计、数据库依赖、迁移/回滚窗口；数据库退役用新 migration |

**当前交付仅为报告。所有删除、合并、依赖变更、归档、数据库或部署操作均等待用户后续确认。**
