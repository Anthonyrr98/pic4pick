# App Store 预检查

依据 2026-11-08 可访问的 Apple 官方文档。当前提交门槛为 Xcode 26 或更高、iOS 26 SDK 或更高；Apple 已允许 Xcode 27.2 构建上传。2027 年 4 月起的 iOS 27 SDK 门槛单独记录。App 的 iOS 17 最低系统与 SDK 门槛分别核验。[当前要求](https://developer.apple.com/news/upcoming-requirements/) · [27.2 发布说明](https://developer.apple.com/help/app-store-connect/release-notes/) · [后续门槛](https://developer.apple.com/app-store/submitting/)

| 项目 | 状态 | 证据或提交前核验 |
|---|---|---|
| 最低系统声明 | PASS | Package.swift 与新 Release plist / Mach-O 均为 17.0。实机运行待验。 |
| 产物 SDK / Xcode | FAIL | 新 Release 与旧 IPA 均为 sdk 17.0 / lld，缺 DTXcode。需在受支持 Xcode Archive，并检查最终产物。 |
| Distribution Signing | FAIL | 已有 IPA 是开发签名，使用带 XTL 前缀的 Bundle ID。需核对 Connect ID、正式 profile、签名和 entitlements。 |
| Validation / Connect 可选构建 | NOT_VERIFIED | 无正式 Archive 或 App Store Connect 会话核验；需完成正式校验后保存输出。 |
| 版本与构建号 | PASS | 本地声明和两份产物均为 1.7.2 (104)。Connect 已使用编号及递增要求为 NOT_VERIFIED。 |
| 审核 2.1 完整性 / 4.2 原生功能 | NOT_VERIFIED | 原生图库、胶片、手势、视差和城市相册有源码证据。需让评审能在可访问地区看到真实内容、地图和空间照片。 |
| 隐私政策 App 内链接 | FAIL | 访客路径没有可发现链接，5.1.1(i) 需补。Connect 隐私政策链接待查。 |
| PrivacyInfo.xcprivacy 与 Required Reason API | FAIL | UserDefaults 和文件时间存在，根 bundle 无清单。 |
| App Privacy、第三方 SDK 与 ATT | NOT_VERIFIED | 如实填点赞 IP、作品交互及各处理方的数据保留、关联及跟踪情况；审核高德等运行时脚本。 |
| 权限目的字符串 | PASS | 有定位、相册添加和运动用途说明；调用时机、拒绝/恢复待真机。 |
| 注册、登录、Sign in with Apple、账户删除 | NOT_APPLICABLE | 原生公开目标为访客模式，无创建账号或第三方登录。若上线包提供可建账号的网站入口，重新判断。 |
| IAP、订阅、数字商品付费 | NOT_APPLICABLE | 无 StoreKit 或数字商品购买入口。 |
| APNs、Universal Links、App Groups | NOT_APPLICABLE | 产品无对应功能或自有 entitlement。 |
| 图标与启动界面 | NOT_VERIFIED | 有 PNG 与 UILaunchScreen 字典，未见商店资产目录产物，需核对正式归档和 iPhone/iPad 启动显示。 |
| 审核账号与说明 | NOT_APPLICABLE | 访客主要功能无需账号。审核说明仍需列入口、空间效果样例、定位/相册触发及地区访问条件。 |
| 年龄分级、摄影内容、图片授权、字体和地图授权 | NOT_VERIFIED | 在 Connect 完成最新问题，核对照片、品牌、拍摄地点和胶片素材的传播权限、字体许可证与地图署名和服务条款。 |
| 元数据与截图 | NOT_VERIFIED | 核对中文名称、描述、关键词、支持 URL、隐私 URL、版权、分类、iPhone/iPad 截图与实际 RC。 |
| 出口合规与地区 | NOT_VERIFIED | 最终构建未见 ITSAppUsesNonExemptEncryption；依据实际加密用途与目标地区完成 Connect 问卷。拟在中国大陆分发时核对适用 ICP 备案及地图/数据要求；如在欧盟分发，核对适用 DSA 商家状态。 |
| TestFlight | NOT_VERIFIED | 待同一正式签名候选的内部测试和设备矩阵记录。 |

政策依据。[审核指南](https://developer.apple.com/app-store/review/guidelines/) · [App Privacy](https://developer.apple.com/app-store/app-privacy-details/) · [出口合规](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/) · [地区与 App 信息](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information) · [App 图标](https://developer.apple.com/help/app-store-connect/manage-app-information/add-an-app-icon)