# 发布问题清单

审计日期 2026-11-08。共 **19 项**，P0 **0**、P1 **6**、P2 **10**、P3 **3**。严重程度按本项目的影响划分。依赖公告等级和线上可利用性分别记录。

## P0 BLOCKER

无已确认项。

## P1 CRITICAL

| ID | 证据与复现 | 影响 | 修复与复验 |
|---|---|---|---|
| P1-01 缺少 Privacy Manifest | [GalleryStore.swift:71](../ios/Sources/Pic4Pick/GalleryStore.swift#L71) 使用 UserDefaults，[DiskImageCache.swift:69](../ios/Sources/Pic4Pick/DiskImageCache.swift#L69) 读取文件修改时间。扫描源码并列出干净 Release 与现有 IPA，两者都没有 PrivacyInfo.xcprivacy。 | Required Reason API 申报缺失，影响上传验收。 | 按实际用途核对 User Defaults 与 File Timestamp 分类和批准理由。将清单置于 iOS App bundle 根目录，对最终 Archive 做清单和隐私报告校验。[Apple Required Reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api) |
| P1-02 App 缺少易找的隐私政策 | 从 [RootView](../ios/Sources/Pic4Pick/Pic4PickApp.swift#L34) 追踪两处导航与照片操作，未找到隐私政策入口；[SettingsView](../ios/Sources/Pic4Pick/Pic4PickApp.swift#L472) 也没有隐私政策链接。 | 审核规则 5.1.1(i) 的 App 内要求未满足，Connect 链接待查。 | 在可达界面提供稳定的公开政策链接，涵盖点赞 IP、第三方、保留与删除，Connect 使用同一政策并以访客身份验证。[App Review Guidelines 5.1.1(i)](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage) |
| P1-03 构建产物 SDK 声明低于提交门槛 | [Package.swift:6](../ios/Package.swift#L6)、[build.sh:49](../ios/scripts/build.sh#L49)。对新 Release 和现有 IPA 的可执行文件运行 llvm-objdump，两者 LC_BUILD_VERSION 都是 sdk 17.0 / minos 17.0，链接器为 lld；Info.plist 无 DTSDKName / DTXcode。 | 已检查产物无法提供满足 Apple 当前 Xcode 26+/iOS 26+ 提交要求的证据。环境 SDK 27.2 和 iOS 17 部署目标是不同的指标。 | 建立可在受支持 Xcode 上 Archive 的 App target 和共享 Scheme，保留所需部署目标，在产物中核验 SDK 与工具链并走正式验证。[Apple 提交要求](https://developer.apple.com/news/upcoming-requirements/) |
| P1-04 现有 IPA 为设备开发签名 | [xtool.yml:2](../ios/xtool.yml#L2)、[build.sh:46](../ios/scripts/build.sh#L46)。解码 IPA 的 embedded.mobileprovision，证书类型 Apple Development，含设备列表及 get-task-allow=true，Bundle ID 增加 XTL 前缀；仓库未找到可复现的 Store Archive 配置。 | 此 IPA 的签名和 ID 适用于开发设备；正式 App Store 候选未生成或核验。 | 核对 Connect App ID、团队及分发权限，生成同 ID 的 App Store Connect 分发归档，核对 profile、签名链、签名 entitlements、UUID 和版本。 |
| P1-05 iOS 候选缺少版本控制基线 | [ios/Package.swift](../ios/Package.swift#L1)、[ios/.gitignore](../ios/.gitignore#L1)。git ls-files -- ios 返回 0 条，git ls-files --others --exclude-standard -- ios 返回 95 条；根 README 和中文版有本地修改。 | 当前 HEAD 的干净克隆缺少整个 iOS 工程，无法按提交复建、评审或回溯。 | 审阅后纳入源码、测试、资源生成和发布配置，保留生成配置、凭证及二进制在忽略目录，以提交、构建号和哈希关联 RC。 |
| P1-06 共享 API 的请求解析器命中高危 DoS 公告 | [server/package-lock.json:737](../server/package-lock.json#L737) 锁定 body-parser 2.3.0；[server-enhanced.js:113](../server/server-enhanced.js#L113) 在路由限流前全局挂载 express.json。运行 server npm audit，命中 GHSA-27r3-jxmh-p828。 | 漏洞版本及全局入口确认。代理是否转发特定压缩请求、线上部署版本及实际利用未验证。故障可波及图库关联 API。 | 锁定含修复版本的 Express/body-parser（body-parser ≥2.4.0），在测试环境验证压缩输入、请求大小、拒绝策略及服务可用性。[依赖公告](https://github.com/advisories/GHSA-27r3-jxmh-p828) |

## P2 MAJOR

| ID | 证据与复现 | 影响 | 修复与复验 |
|---|---|---|---|
| P2-07 地图云端设置无法同步 | [GalleryStore.swift:248](../ios/Sources/Pic4Pick/GalleryStore.swift#L248) 匿名读 app_settings.data，遇错静默回退打包值；[RLS 迁移:30](../supabase/migrations/20260628123812_lock_down_public_rls.sql#L30) 撤销匿名权限。使用客户端公开配置发出只读请求，返回 401。 | 发现页和照片小地图可能使用陈旧预设、域名或 key；实际底图状态待真机验证。 | 提供只输出许可地图字段的公开接口，保留 app_settings 访问限制；测试成功、授权失败、缓存失效及回退提示。 |
| P2-08 代理依赖与 IP 信任边界 | [server/package-lock.json:2013](../server/package-lock.json#L2013) 锁定 proxy-addr 2.0.7，npm 报 critical；[server-enhanced.js:86](../server/server-enhanced.js#L86) 使用固定 1 跳信任，[photoLikes.js:4](../server/photoLikes.js#L4) 依赖 req.ip。公告涉及 IPv4-mapped IPv6 子网匹配，本项目使用数字跳数。 | 受影响版本已确认，公告特定条件及生产 ingress 可利用性待验。IP 限流、审计和访客事件依赖正确来源。 | 升级到修复版本 ≥2.0.8；在 staging 测试直接到源站、重复 Forwarded / X-Forwarded-For、不同代理跳数和映射 IPv6。[依赖公告](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) |
| P2-09 管理上传依赖命中高危公告 | [server/package-lock.json:1811](../server/package-lock.json#L1811) multer 2.3.0、[server/package-lock.json:2255](../server/package-lock.json#L2255) sharp 0.35.4；[server-enhanced.js:238](../server/server-enhanced.js#L238) 和 [server-enhanced.js:517](../server/server-enhanced.js#L517) 为管理员上传入口。运行 server npm audit。 | 受影响版本确认；鉴权与本项目文件过滤缩小暴露面，具体利用和线上 librsvg 版本待验。上传问题可间接影响 API 进程。 | 更新 multer ≥2.5.0、sharp ≥0.35.5，隔离压测中止上传、文件过滤、临时文件回收和图像输入。[multer 高危](https://github.com/advisories/GHSA-q7qp-rjg7-q26m) · [multer 中危](https://github.com/advisories/GHSA-3pph-fpjx-jg34) · [sharp](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) |
| P2-10 点赞 IP 缺少可审计的保留与删除流程 | [点赞迁移:1](../supabase/migrations/20261012072633_record_photo_like_ips.sql#L1)、[点赞迁移:40](../supabase/migrations/20261012072633_record_photo_like_ips.sql#L40)、[server/README.md:50](../server/README.md#L50)。每次正向点赞写入 IP、作品 ID、时间，取消保留既有事件；仓库未见独立保留/清理流程。 | 数据处理范围和删除响应缺少发布证据，实际线上作业与日志保留待核。 | 明确必要性、最短保留期、权限与删除通道；确定是否能改用短期去标识标记，按实际处理申报 App Privacy。 |
| P2-11 点赞请求可重放且本机状态与服务端计数可能分离 | [GalleryStore.swift:280](../ios/Sources/Pic4Pick/GalleryStore.swift#L280)、[photoLikes.js:10](../server/photoLikes.js#L10)、[点赞迁移:28](../supabase/migrations/20261012072633_record_photo_like_ips.sql#L28)。客户端只发送 delta，服务端校验 delta 后累加，没有操作 ID 或每客户端状态。用 staging 模拟服务端已提交但响应丢失后重试。 | 重复加减、重装或多设备下状态不一致、点赞统计可受滥用；本次未写线上点赞。 | 增加幂等操作 ID 或按去标识客户端设置目标状态，覆盖乱序、重试、429 和取消。 |
| P2-12 图库仅取前 1000 条且在主线程处理目录 | [GalleryStore.swift:176](../ios/Sources/Pic4Pick/GalleryStore.swift#L176)、[GalleryStore.swift:188](../ios/Sources/Pic4Pick/GalleryStore.swift#L188)、[GalleryStore.swift:205](../ios/Sources/Pic4Pick/GalleryStore.swift#L205)。用 1001 条 staging 夹具验证无分页；当前只读样本 86 条。 | 超过上限后较早作品、地点相册、筛选覆盖不足；每分钟同步解码、目录构建和磁盘写入有卡顿风险。性能未测。 | 稳定游标分页及同步取消，移出主线程的目录构建和磁盘 I/O，只在主线程发布结果。 |
| P2-13 图片下载缺少解码前的响应大小上限 | [PhotoImage.swift:77](../ios/Sources/Pic4Pick/PhotoImage.swift#L77)、[PhotoImage.swift:109](../ios/Sources/Pic4Pick/PhotoImage.swift#L109)、[DiskImageCache.swift:66](../ios/Sources/Pic4Pick/DiskImageCache.swift#L66)。网络响应先整块进入内存，后续才缩图及限缓存，磁盘写入触发遍历与排序。 | 大文件和并发请求的瞬时内存、低存储 I/O 风险；OOM 及实际抖动待真机测。 | 流式限长与格式检查，合并相同 URL 下载、限制并发，压测 50 MB、无长度、大像素和并发请求。 |
| P2-14 地图 WebView 桥仅核验主框架 | [WebsiteMap.swift:32](../ios/Sources/Pic4Pick/WebsiteMap.swift#L32)、[WebsiteMap.swift:96](../ios/Sources/Pic4Pick/WebsiteMap.swift#L96)、[WebsiteMap.swift:114](../ios/Sources/Pic4Pick/WebsiteMap.swift#L114)、[Map.ts:57](../ios/Web/Map.ts#L57)。非用户点击的 HTTPS 主框架跳转可能继续载入，桥没核验安全来源；远程 SDK 在页面上下文执行。 | 第三方脚本或重定向可能发送伪造的地图状态或地址消息。桥的现有行为范围限地图，无敏感原生操作被证实。 | 对主文档导航设来源白名单并校验 frameInfo.securityOrigin，限制 CSP 和脚本，测试跳转、iframe、消息大小和来源。 |
| P2-15 候选构建缺少隔离配置与原生集成门禁 | [prepare.mjs:7](../ios/scripts/prepare.mjs#L7)、[Package.swift:8](../ios/Package.swift#L8)、[build.sh:11](../ios/scripts/build.sh#L11)。脚本混读本地、production、小程序配置，同一生成配置用于 Debug/Release；测试为独立模型程序与源码断言，未定义 iOS test target、UITest 或核心覆盖率门槛。 | 调试构建可误指生产写 API，自动化遗漏 WKWebView、权限、启动和手势集成故障。 | 显式分环境并校验端点，绑定配置与 RC；建立 staging 网络契约、XCTest / XCUITest 和核心模块覆盖率报告。 |
| P2-16 商店图标和启动验证缺口 | [xtool.yml:4](../ios/xtool.yml#L4)、[Info.plist:9](../ios/Info.plist#L9)。Release 和现有 IPA 含 AppIcon.png 与 UILaunchScreen 配置；检查未见 Assets.car 或 CFBundleIcons。 | 图标资产、iPad 呈现及商店校验待证实，现有图标可作为制作源。 | 在正式 Xcode target 配置 App Icon，归档后核对适用平台图标、启动过渡和 Connect 预览。[Apple 图标配置](https://developer.apple.com/help/app-store-connect/manage-app-information/add-an-app-icon) |

## P3 MINOR

| ID | 证据与复现 | 影响 | 修复与复验 |
|---|---|---|---|
| P3-17 邮件与查询序列化依赖命中中危 | [server/package-lock.json:1879](../server/package-lock.json#L1879)、[server/package-lock.json:2036](../server/package-lock.json#L2036)。npm audit 命中 Nodemailer 地址解析和 qs comma 序列化公告。 | 已确认受影响版本。通知配置、收件人输入和 qs 特定调用的可达性待验。 | 更新 Nodemailer 至审计推荐 10.3.1 和 qs 至含修复的版本，回归固定收件人和序列化。[Nodemailer 公告之一](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8) · [qs 公告](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) |
| P3-18 正式日志公开作品标识 | [SpatialSceneModel.swift:83](../ios/Sources/Pic4Pick/SpatialSceneModel.swift#L83) 以公开级别记照片 ID 与深度尺寸，[PhotoPreviewPresenter.swift:7](../ios/Sources/Pic4Pick/PhotoPreviewPresenter.swift#L7) 记过渡事件。源码可复核，设备日志待采集。 | 可从系统日志还原局部浏览行为；照片 ID 指向公开内容，当前未发现签名 URL 或令牌进入这些日志。 | 使用静态事件名、private hash 或 DEBUG 专用诊断，验收 Release 的实际系统日志。 |
| P3-19 运行路径存在强制解包与旧入口 | [GalleryStore.swift:73](../ios/Sources/Pic4Pick/GalleryStore.swift#L73)、[GalleryStore.swift:123](../ios/Sources/Pic4Pick/GalleryStore.swift#L123)、[ExploreDiscoveryView.swift:121](../ios/Sources/Pic4Pick/ExploreDiscoveryView.swift#L121)、[Pic4PickApp.swift:425](../ios/Sources/Pic4Pick/Pic4PickApp.swift#L425)。查看 URL/缓存目录处理及当前 RootView 的调用关系。 | 破损配置或极端运行环境可能导致异常退出；旧视图增加入口和权限审计负担。正常配置下的复现待验证。 | 在解析层验证 HTTPS URL 与目录并回退，整理旧视图的去留，用错误配置与不可用缓存夹具回归。 |

## 修复与验收进度

上表保留原始审计证据。下表记录工作区的修复和剩余验收。

| ID | 已落实 | 待验收 |
|---|---|---|
| P1-01 | 清单声明本机偏好的 CA92.1 和应用缓存文件时间的 C617.1。已验证清单在 xtool App 根目录。 | 在 Xcode Organizer 生成正式 Archive 隐私报告。 |
| P1-02 | 图库顶部提供隐私政策入口。政策页面涵盖点赞 IP、第三方、保留和删除，联系邮箱来自维护者公开网站。 | 部署页面并在访客浏览器和 Connect 核对同一 URL。 |
| P1-03 | 增加 iOS 17 部署目标的 Xcode App target、共享 Scheme 和 Xcode 26+/SDK 26+ 归档验证。已复查 xtool Release 的 Mach-O，声明 SDK 仍为 17.0。 | 在 macOS 生成并用 Xcode Validate App 校验正式归档。 |
| P1-04 | 分发脚本校验商店 Bundle ID、分发证书、描述文件、entitlements、SDK、版本和 UUID。当前 xtool 登录只列出免费签名团队和带 XTL 前缀的开发标识。 | 使用具备 App Store 分发权限的团队核对 Connect 记录，生成实际商店 IPA。 |
| P1-05 | iOS 源码已在提交 `57063c3` 纳入版本控制。归档脚本记录提交 SHA、配置和 IPA 哈希。 | 提交本轮变更后，用干净工作区生成候选包。 |
| P1-06 | body-parser 2.4.0，解析前限流并拒绝压缩正文。本地实际 HTTP 入口验证 415、413、400 与随后健康检查。 | 在 staging 和实际代理路径复验。 |
| P2-07 | 公开接口仅返回 4 个地图样式字段，保留 app_settings 权限。iOS 读取失败回退并提示。 | 用 staging 配置验证权限及真机高德授权、底图和切换。 |
| P2-08 | proxy-addr 2.0.8。直连按套接字、Render 保留最近一跳，本地测试覆盖伪造头、多跳与映射地址。 | 在 Render staging 确认实际 ingress 和私网直连路径。 |
| P2-09 | Multer 2.5.0、Sharp 0.35.5；本地认证上传测试拒绝伪装扩展名，断开上传后清除临时文件并继续响应。 | staging 并发上传和 Sharp 实际输入压测。 |
| P2-10 | 点赞 IP 保留 7 天、操作记录保留 30 天；迁移提供清理作业与受限删除 RPC；新邮件不带 IP。隔离数据库已执行清理 SQL。 | 部署后验证 Cron、私下删除请求处理、历史邮件与服务商留存，并核对 App Privacy。 |
| P2-11 | iOS v2 点赞操作 ID 落盘，重试复用同一 ID；数据库验证重复、冲突、取消及旧请求晚到。 | staging 复验响应丢失和 429。兼容旧客户端的 delta 路由保留原语义。 |
| P2-12 | 公开作品使用 UUID 游标分页，目录、解码和磁盘 I/O 转入后台 actor。隔离数据库夹具覆盖 1001 条。 | staging API 分页和真机刷新性能。 |
| P2-13 | 图片下载限制 24 MiB、4 路并发，按 URL 合并并校验格式及尺寸；磁盘清理分批。新增原生夹具覆盖 50 MiB 声明、无长度超限和非图片响应。 | 在 macOS 运行原生夹具，真机验证异常像素、并发和内存。 |
| P2-14 | WebView 限制导航与消息来源、大小，地图脚本启用哈希 CSP。浏览器地图夹具已通过。 | 运行 WKWebView XCTest，核对真机高德脚本和重定向。 |
| P2-15 | Debug 和 Release 显式选择环境；加入 staging 合同检查、XCTest、XCUITest 和覆盖率工作流。原生测试源码通过 iOS SDK 类型检查。 | 跑真实 staging 和 macOS 工作流，记录覆盖率基线。 |
| P2-16 | 正式 target 从现有 RGB 图生成 1024×1024 App Icon，配置 iPad 方向和启动设置。 | Archive 校验资产目录、iPad 启动过渡及 Connect 预览。 |
| P3-17 | Nodemailer 10.3.1、qs 6.17.1，服务端 npm audit 为零。 | staging 验证固定收件人和真实邮件投递。 |
| P3-18 | 正式版本的空间事件不含作品 ID 或景深尺寸，预览诊断仅保留于 Debug。 | 在真机采集 Release 系统日志。 |
| P3-19 | 验证配置 HTTPS URL，缓存目录可缺失，移除无引用的 Apple 地图及设置页。 | 在真机运行损坏配置与不可用缓存回归。 |
