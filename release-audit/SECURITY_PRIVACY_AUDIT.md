# 安全与隐私审计

审计对象为访客 iOS 产品与直接关联的生产 API，按 OWASP MASVS 的 STORAGE、AUTH、NETWORK、PLATFORM、CODE、PRIVACY 等控制域抽样。细节与修复位置见 [问题清单](ISSUES.md)。本轮未做全量渗透或线上攻击测试。[OWASP MASVS](https://mas.owasp.org/MASVS/03-Using_the_MASVS/)

| 检查 | 状态 | 证据与限制 |
|---|---|---|
| Required Reason API、Manifest | FAIL | 发行源码及两个产物均无 PrivacyInfo.xcprivacy。UserDefaults 保存照片 ID，文件时间用于缓存 LRU。由维护者按最终用途核对 Apple 分类、批准理由及根 bundle 布局。P1-01。[Apple 理由列表](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api) · [清单打包位置](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk?language=objc) |
| 隐私政策、收集说明 | FAIL | 原生访客入口未见政策。点赞写照片 ID、事件时间、客户端 IP。仓库中缺少删除和保留证据；App Privacy 分类需由数据负责人按实际目的、保留、第三方和用户关联方式填写。P1-02、P2-10。[Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/) |
| 原生用户凭证 / Keychain | NOT_APPLICABLE | 公开产品无原生用户令牌。历史 AdminStore 的 Keychain 路径被 Package.swift 排除，Release 符号抽查无管理员符号。已有设备 profile 的系统 keychain-access-groups 不构成业务令牌存储。 |
| 客户端公开 API key | PASS | prepare 校验 HTTPS，只接受 publishable 或 JWT role=anon；线上读取探测使用现有公开配置，报告未复制 key。校验服务端权限仍依赖 RLS。 |
| 存储与缓存 | PASS | 静态确认本机收藏/点赞状态为照片 ID，图片和目录进 Caches，磁盘测试覆盖过期、清理和损坏。签名景深链接未持久化，空间资源缓存有条目上限。缓存文件保护等级、卸载/升级、存储压力与系统 URLCache 行为为 NOT_VERIFIED。 |
| ATS 与证书校验 | PASS | 已检查 plist 无 ATS 例外，生产公开端点使用 HTTPS，源码未见绕过证书校验的 delegate。设备 TLS/重定向抓包和弱 TLS 失败测试为 NOT_VERIFIED。 |
| RLS 与数据最小化 | PASS | 仓库迁移公开照片谓词为 approved 且 hidden=false，线上匿名计数抽样 */0，点赞事件 HEAD 401。权限结果仅覆盖被探测的客户端角色和查询。存储桶、全角色矩阵和生产权限漂移待核。地图云配置读 401 单独为 FAIL。P2-07。[Supabase Data API 安全](https://supabase.com/docs/guides/api/securing-your-api) |
| 点赞授权和滥用 | FAIL | 业务 API 允许匿名 delta，数据写入经后端角色且仅对公开照片，仍缺少操作幂等性。锁定 proxy-addr 命中公告，生产代理条件与实际利用为 NOT_VERIFIED。P2-08、P2-11。 |
| 依赖与密钥泄露 | FAIL | server npm audit 命中 body-parser、proxy-addr、multer、sharp、nodemailer、qs；工作树高信号秘密扫描 0 命中。部署版本和原生第三方远程代码动态审计为 NOT_VERIFIED。P1-06、P2-08、P2-09、P3-17。 |
| WebKit 桥与外部脚本 | NOT_VERIFIED | 地图桥限制主框架、消息大小（地址）及业务 ID，缺少来源核验。完整网站代码使用持久 WebKit store 且关闭 inspector，当前原生入口可达性需随发布版本重验。P2-14。 |
| 系统权限 | PASS | plist 有仅使用期间定位、相册添加、运动文案。原生定位用于本机距离计算，景深姿态本机使用。拒绝/恢复和运行时三方传输待真机。 |
| ATT 和第三方 SDK 数据处理 | NOT_VERIFIED | 原生源码未见 ATT 调用、广告 SDK 或 IDFA 入口。运行时高德、瓦片、地址服务、Open-Meteo、Supabase、OSS 和网站的真实行为需查文档、合同及流量，按结果判定是否追踪。核对 Apple 重点 SDK 清单与最终归档。 |
| 调试与日志 | NOT_VERIFIED | Release 排除了管理员原生模块，生产日志仍以 public 记录作品 ID；源码未见上述日志包含签名 URL。需设备检查实际日志和后台采集。P3-18。 |

## 数据路径

- 访问图库、预览和空间场景。请求携带公开 API key，使用作品 ID 和图片 URL。服务端与供应商可能收到连接元数据；实际保留项待数据负责人确认。
- 点赞。移动端 PATCH 发送 delta，服务端解析 IP。正向点赞原子更新计数和记录 IP/时间/作品 ID；取消点赞保留历史事件。详情见 [GalleryStore.swift:297](../ios/Sources/Pic4Pick/GalleryStore.swift#L297) 和 [点赞事件迁移](../supabase/migrations/20261012072633_record_photo_like_ips.sql#L40)。
- 位置信息。手机当前位置用于本机排序和距离显示。地图和 Open-Meteo 可能收到**作品拍摄坐标**用于地理服务，需和手机当前位置分开披露。高德 JS 的额外数据行为待验。见 [PhotoMetadataView.swift:153](../ios/Sources/Pic4Pick/PhotoMetadataView.swift#L153)、[PhotoGeography.swift:84](../ios/Sources/Pic4Pick/PhotoGeography.swift#L84)。
- 无原生账号删除流程的适用范围限访客产品。仍需提供适用于访客数据的联系与删除方式，核对托管方日志、点赞 IP 与持久缓存政策。