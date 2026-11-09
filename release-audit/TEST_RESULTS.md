# 实测结果与复现

日期 2026-11-08。Windows PowerShell、Node 24.11.1、npm 11.6.2，WSL 2 Ubuntu 26.04.1 LTS，Swift 6.4.2、xtool 1.24.0。xtool sdk status 确认安装 Darwin artifact bundle，SDKSettings.json 实测 iphoneos27.2，随附 Xcode 元数据为 27.2 (27B52)。见 sdk-status.log、sdk-metadata.log。产物的 SDK 元数据另见下文。

## 实际执行

| 命令或检查 | 状态 | 结果与本地证据 |
|---|---|---|
| git rev-parse HEAD / git status / git ls-files | FAIL | HEAD 为 785eb3d8a66c46082408371ce7a93ba8ae203588，95 个 iOS 源文件未跟踪；快照哈希 source-sha256.txt。 |
| node ios/scripts/prepare.mjs | PASS | 从完整隔离源码及现有 node_modules 生成地图、图库、胶片资源。构建 URL 使用 example.invalid，公开 key 为测试值。首次临时副本漏复制 src/constants，已补齐并重新运行。prepare.log。 |
| WSL ext4 新目录 bash scripts/build.sh build debug | PASS | Debug 退出 0，xtool 编译报告 9.97 秒，未见警告。build-debug.log、Debug.app。 |
| 同一隔离源码 bash scripts/build.sh build release | PASS | Release 退出 0，为新建 Release 配置构建。xtool 编译报告 22.31 秒，未见警告。build-release.log、Release.app、build-exits.txt。 |
| build.sh 内 Swift 主机检查 | PASS | 12 个独立程序两轮通过。覆盖磁盘缓存、照片解析/胶卷、发现分组、查看器布局、手势分流、共享过渡、空间数学、显影、分类指示器、刷新率、底部导航、图片呈现。 |
| build.sh 内 Python 配置检查 | PASS | 3 项通过。覆盖 ProMotion/更新注册、Liquid Glass/兼容外观、底部导航源码合同。 |
| swift package describe；swiftc -frontend -parse Sources/Pic4Pick/*.swift | PASS | 包配置可解析，Swift 全部源码通过语法检查。swift-package.log、swift-parse.log。 |
| swiftc -profile-generate -profile-coverage-mapping，llvm-profdata merge，llvm-cov export | PASS | 对上述 12 个 Linux 主机程序逐项生成行覆盖。共 13 个唯一生产源文件。DiskImageCache 69/70、Photo 94/103（照片套件）、ExploreDiscoveryModel 117/129、PhotoTransitionMath 125/126、SpatialMath 87/91；PanelSnapPolicy 在布局套件为 6/8。相同文件在不同套件分别报告。coverage.log、coverage-exit.txt。App 整体和核心门槛为 NOT_VERIFIED。 |
| node ios/scripts/check-parity.mjs | PASS | 3 个本地照片夹具，地点和城市归类与网页共享规则一致，14 个地图预设通过。parity.log。 |
| python ios/scripts/check-map-ui.py | PASS | Chromium 夹具包含实际 MapLibre worker、离线底图、标记、GPS 地址桥、默认镜头、署名和失败处理；高德 JS 为替身。map-ui.log。 |
| wsl -d Ubuntu --cd F:/Github/pic4pick/ios -- python3 scripts/check-admin.py | PASS | 在 WSL 内启动本地 HTTP fixture，验证旧管理员登录、会话失败、multipart 上传、提交、审核和清理合同。首次从 Windows 执行时 fixture 绑定 Windows 回环，WSL 无法访问，已改为同一环境重跑。admin-wsl.log、admin-check.log。该模块排除在公开 App。 |
| npm run test:unit | PASS | Node 135 通过、0 失败、0 跳过。覆盖共享数据及服务端路线，包括点赞、可见性、景深和上传。node-tests.log。 |
| npm audit --omit=dev --json | PASS | 根 lockfile 生产依赖 0 项公告；未覆盖高德运行时脚本与 Apple 框架。npm-audit-root.json。 |
| npm --prefix server audit --omit=dev --json | FAIL | 6 个依赖条目，1 critical、3 high、2 moderate。未执行漏洞利用。npm-audit-server.json。 |
| 工作树凭证模式扫描 | PASS | ios、shared、src、server、supabase 范围 275 路径，检查可读文本的私钥、Supabase secret、常见云/服务 token 和 JWT 模式，0 命中。未做全 Git 历史或第三方二进制扫描。secret-scan.log。 |
| node .artifacts/release-audit-20261108/live-audit.mjs | PASS | 线上只读探测图库 HTTP 200、86 条全为 approved / hidden=false，非公开计数过滤 HEAD 200 且 */0，品牌 HEAD 200，点赞事件 HEAD 401，网站及 /api/health 200。3 个媒体 HEAD 为 JPEG 200。景深 86 条 ready，3 个样本签发与下载均 200，版本/PNG/尺寸检查通过。live.log。地图子项见下一行。 |
| app_settings 匿名 GET / HEAD | FAIL | 带原生相同 Accept-Profile: public 与客户端授权头时，GET 401/42501、HEAD 401。补充无 Accept-Profile 的探测 GET 404/PGRST205。app-settings-exact.log、app-settings-get.log。 |
| llvm-objdump --macho --private-headers、plistlib、OpenSSL CMS | FAIL | 干净 Release 和既有 IPA 都是 sdk 17.0、minos 17.0、DTSDKName / DTXcode 缺失。既有 IPA 是 Apple Development 设备 profile，核对了 profile 与 Mach-O 签名内的 get-task-allow、Bundle ID、到期时间，未见 APS、App Groups 或 Associated Domains entitlement；CMS 解码使用 -noverify，无证书链信任结论。release-inspect.log、ipa-inspect.log、ipa-entitlements.log。 |
| Release dSYM UUID | PASS | WSL 产出的 Release-iphoneos/Pic4Pick-App.dSYM 与同一次 Release 可执行文件 UUID 一致。App Store Archive 的符号及后台可符号化另验。dsym.log。 |
| Apple 转接 TCP、idevice_id -l、idevicepair validate、xtool devices --no-wait | FAIL | Windows 显示手机 USB 接入且苹果服务在运行。WSL 转接 TCP 四秒超时（124）、枚举 255、pair 1、xtool 1。device.log。真机 UI 和安装为 NOT_VERIFIED。 |

日志、快照哈希、检查脚本和未签名产物位于 `F:/Github/pic4pick/.artifacts/release-audit-20261108/`，目录受 Git 忽略。WSL 路径见 wsl-path.txt。两次成功构建用测试配置；线上读探测用既有公开配置，未生成生产签名包。构建日志只用于编译耗时。

## NOT_VERIFIED

- xcodebuild analyze、iOS 模拟器、XCTest、XCUITest、Instruments。当前 WSL 未提供 Xcode / simctl，SwiftLint 也未安装。仓库没有 iOS test target；Linux swift test 无法替代原生 test runner。
- 真机初次启动、升级、启动崩溃、iOS 17/27.2、iPad、VoiceOver、Dynamic Type、权限拒绝和恢复、相册保存、空间运动实际渲染、异常网络及系统存储压力。
- 正式 Archive、签名链和生产 entitlement、Connect Validation、上传后的 TestFlight、真实 TLS/第三方流量以及部署的依赖版本。
- 生产点赞及任何生产写入。回归设计见 [人工 QA 清单](MANUAL_QA_CHECKLIST.md)。