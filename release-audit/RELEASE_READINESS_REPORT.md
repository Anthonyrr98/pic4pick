# 见远方 iOS 发布验收

**2026-11-08 · NO-GO · 1.7.2 (104)**

审计对象为 F:/Github/pic4pick 当时的工作树。基线 HEAD 为 `785eb3d8a66c46082408371ce7a93ba8ae203588`，分支 main。iOS 有 95 个可纳入版本控制的未跟踪文件，README.md 与 README.zh-CN.md 有既有改动。构建取隔离快照并生成哈希清单，线上核对使用工作区既有的客户端公开配置。审计增加本目录报告和 Git 忽略的证据，无业务代码、签名凭证、生产配置或数据写入。

## G0–G8 执行结果

| 阶段 | 状态 | 证据 |
|---|---|---|
| G0 项目与配置 | FAIL | SwiftUI / UIKit / SwiftPM，WebKit + MapLibre 与高德 JS，JavaScriptCore 共享图库规则，Metal / Core Motion 空间照片。Swift tools 6.0；最低 iOS 17；xtool 声明 com.rlzhao.pic4pick，1.7.2 (104)。Debug/Release 共用 plist 和生成资源。仓库没有 Xcode workspace、project、共享 Scheme、正式归档或签名配置。Release 声明设备族 [1,2]，支持 iPhone 与 iPad，plist 含竖屏及两侧横屏，UIRequiresFullScreen=true。无自有 App Groups、Associated Domains 或推送 entitlement；开发 profile 有系统签名标识和 keychain-access-groups。原生 SwiftPM 无外部 package，MapLibre 6.9.0 和 esbuild 0.28.2 锁定，高德脚本运行时加载。 |
| G1 工程与依赖 | FAIL | 在 WSL ext4 隔离目录完成干净 Debug 和 Release，退出均为 0，日志无编译警告。Swift 语法、源码扫描和 npm 依赖审计已执行，后端有 1 critical、3 high、2 moderate 包级命中。Xcode Static Analyze、SwiftLint 为 NOT_VERIFIED。 |
| G2 功能与测试 | FAIL | 12 个 Swift 主机测试程序、3 个静态断言、Node 135 项、共享规则与地图浏览器夹具通过。生产公开读探测通过图库 86 条、3 个缩略图、86 条 ready 景深元数据及 3 个景深 PNG；地图动态配置匿名读 401。真机启动、权限、真实点赞写入及原生 UI 为 NOT_VERIFIED。 |
| G3 兼容性 | NOT_VERIFIED | Windows 识别 iPhone USB，Apple Mobile Device Service 和转接规则存在，WSL TCP 探测超时，配对与设备枚举失败。模型检查覆盖小屏、横屏、RTL、减少动态效果的部分计算；iOS 17、当前稳定 iOS 27.2、iPad、系统权限、VoiceOver、系统主题、前后台与升级需要真机或 Mac 模拟器。 |
| G4 性能与稳定性 | NOT_VERIFIED | 静态证据表明缩图、胶片合成与模糊背景由 actor 处理，限制部分缓存并复用在途请求，空间模式有降频和停绘逻辑。图库仍在主线程处理列表和缓存文件，图片请求先整块载入。无启动、帧时、CPU、峰值内存、泄漏、OOM 或耗电实测。构建耗时单独记录。 |
| G5 安全与隐私 | FAIL | Required Reason API 清单缺失，App 内隐私政策缺失，服务端保存正向点赞 IP，共享后端锁文件命中高危依赖。静态无 ATS 例外，公开配置限制 anon/publishable，线上只读检查未返回非公开作品且禁止读取点赞事件。真实 TLS 抓包、SDK 数据用途和线上权限全覆盖为 NOT_VERIFIED。 |
| G6 正式构建分发 | FAIL | 新 Release 和现有开发 IPA 的 Mach-O 均声明 sdk 17.0 / minos 17.0；现有 IPA 使用 Apple Development profile 与设备列表、get-task-allow=true，Bundle ID 加 XTL 前缀。App Store Archive、正式签名、Connect 版本递增和 Validation 为 NOT_VERIFIED。 |
| G7 App Store 预检查 | FAIL | Apple 当前要求 Xcode 26+、iOS 26 SDK 或更新版本；官方已接受 Xcode 27.2，2027 年 4 月将要求 iOS 27 SDK 或更新版本。隐私政策入口及清单需补齐。原生图库、手势、胶片和空间渲染提供审查所需的功能证据，完整性与审核结论待真机和 Apple 评估。 |
| G8 TestFlight 与上线 | NOT_VERIFIED | 本地构建可追溯至快照；尚无受控候选、同一 Archive 的 TestFlight 证据、升级验收、监控门槛和经演练的止损流程。 |

### 业务范围与例外

- 原生访客旅程包括图库分类、搜索与刷新，发现页地图和城市相册，查看器翻页、缩放、信息面板、三个胶卷边框、点赞、本机收藏标记、分享、保存、空间视差和系统定位。缓存仅覆盖部分已阅内容，目录缓存 5 分钟，断网可导致目录清空。
- 注册、原生登录/注销、用户会话和账号删除、内购订阅、推送、Deep Links/Universal Links 为 NOT_APPLICABLE。管理员源文件排除在产品外；旧 Admin HTTP 夹具独立通过。正式包如接入可注册的网页，需重验账号与删除规则。
- 网络只读探测从 Windows Node 发起，未替代 iOS ATS / WebKit 或真机交互。生产点赞以及所有可能写入真实数据的场景使用 staging 验收方案。

### 质量门槛

| 团队门槛 | 状态 |
|---|---|
| 本次本地 Debug/Release 都通过 | PASS |
| 核心功能测试 100% 和无稳定复现崩溃 | NOT_VERIFIED，主机用例通过，真机集成未测且地图配置接口有已确认失败 |
| P0 / P1 为 0，且无未解决高危 | FAIL，P0 0 / P1 6，后端高危依赖未消除 |
| 核心业务行覆盖率目标 80% | NOT_VERIFIED，未取得代表完整 App 的覆盖数据 |
| Apple 强制合规、正式构建和签名 | FAIL，已观察到清单、隐私政策和当前打包方案缺口 |
| TestFlight 最终验收和人工批准 | NOT_VERIFIED |

详细内容见 [问题清单](ISSUES.md)、[测试结果](TEST_RESULTS.md)、[安全与隐私](SECURITY_PRIVACY_AUDIT.md)、[商店检查](APP_STORE_CHECKLIST.md)、[人工 QA](MANUAL_QA_CHECKLIST.md) 与 [发布决策](RELEASE_GO_NO_GO.md)。

Apple 版本与审核依据。[提交要求](https://developer.apple.com/news/upcoming-requirements/) · [App Store Connect 发行说明](https://developer.apple.com/help/app-store-connect/release-notes/) · [提交页面](https://developer.apple.com/app-store/submitting/) · [审核指南](https://developer.apple.com/app-store/review/guidelines/) · [系统版本](https://developer.apple.com/news/releases/)