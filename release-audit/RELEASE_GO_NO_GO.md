# 发布决策

**NO-GO**。审计日期 2026-11-08，见远方 1.7.2 (104)。P0 0、P1 6、P2 10、P3 3。发布状态依据已确认阻断项，真机和 TestFlight 证据缺口另列。

## 发布前优先处理的 10 项

1. P1-03 建立受支持 Xcode 的 Release Archive，确认二进制 SDK 达到提交门槛。
2. P1-04 用正式 App ID 与 App Store Distribution profile 生成候选，验证证书链及签名 entitlement。
3. P1-01 添加并验证 Privacy Manifest 和 Required Reason API。
4. P1-02 增加 App 内易找的隐私政策入口，并同步 Connect 链接。
5. P1-05 将 iOS 源码和构建配置纳入版本控制，建立可复建 RC。
6. P1-06 修复后端全局 JSON 解析器的高危依赖并复验。
7. P2-07 修复原生地图动态设置匿名读取失败，用白名单接口提供配置。
8. P2-08 更新 proxy-addr 并核验生产代理、IP 限流和审计边界。
9. P2-09 更新管理员上传的 multer 和 sharp，并回归中断上传。
10. P2-10 明确点赞 IP 的用途、保留、删除和申报。

其余问题与定位见 [ISSUES.md](ISSUES.md)。

## 重新评审的证据

| 门禁 | 当前状态 | 负责人需提交的证据 |
|---|---|---|
| P0/P1 和未解决高危为 0 | FAIL | 修复 diff、依赖复扫、staging 回归及后端部署制品对应关系。 |
| 正式 RC | FAIL | Git 追踪、明确的生产配置来源、可复建的 Release Archive、Store 正式签名、产物 SDK/版本检查、匹配 dSYM、App Store Validation。 |
| 隐私与合规 | FAIL | App 内政策入口、App Privacy 申报、清单与有效理由、第三方数据图、地图与地区许可、出口问卷和审核说明。 |
| 核心功能与质量 | NOT_VERIFIED | 原生测试矩阵、核心覆盖率和不崩溃证据、实际帧时/启动/内存基线，权限、网络、升级回归。 |
| TestFlight 与发布审批 | NOT_VERIFIED | 同一候选完成内部测试和人工批准，保存设备/系统矩阵、问题状态、证据和回退联系人。 |

## 上线操作准备

- 发布负责人登记 RC 的 commit、配置指纹、build number、可执行 UUID、Archive 与 dSYM 哈希。建立 1.7.2 客户端到后端的契约矩阵，包含旧客户端、读图/签名 URL、RLS、地图配置与迁移顺序。
- QA 完成内部 TestFlight 冒烟并记录反馈。发布负责人设置崩溃、冷启动、媒体/景深错误、点赞与地图 401/429/5xx 的监控和责任人，阈值由测试基线确定。评估地图/空间等功能是否需要具备失效回退及可操作的停用方式，仓库未证实有统一开关。
- 若为首发，采用团队审批后的手动发布日期。若为版本更新，可在 Connect 配置分阶段发布并明确暂停条件。客户端修正通常需提交更高构建号的版本；保留前后版本兼容的后端和可回滚配置，事先演练回滚与通知。Apple 分阶段发布适用于版本更新。[App Store Connect 分阶段发布](https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases/)