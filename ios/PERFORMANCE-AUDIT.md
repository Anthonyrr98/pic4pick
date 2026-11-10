# 见远方 iOS 性能审计与优化报告

审计日期为 2026 年 11 月 9 日。基线是审计开始时的工作区，包含当时已有的 iOS 修改。源码结论和设备采样结果分开记录。

## A. 项目概况

| 项目 | 审计结果 |
| --- | --- |
| 工程 | SwiftUI，部分手势、转场、缩放通过 UIKit 桥接。Swift 6，最低 iOS 17。SwiftPM 和 xtool 用于设备交叉构建，XcodeGen 用于生成 App、XCTest 和 XCUITest targets。审计时 `Info.plist` 版本为 1.7.5（107）。 |
| 入口 | `Pic4PickApp` 创建图库与位置状态。场景进入活跃状态后尝试恢复图库缓存并刷新，活跃期间每隔 60 秒发起下一次刷新。图库和发现页保留视图身份，符合条件时预热发现页。 |
| 状态 | 主要共享状态使用 `ObservableObject` 和 `@Published`，点赞操作使用细粒度 Observation，逐帧拖动使用局部状态与 UIKit 变换。图库使用 `LazyVGrid` 和稳定的作品 ID。 |
| 网络与图片 | 使用 `URLSession.shared`，通过 REST 读取公开图库和品牌配置。图库 reader 分批取数并在 actor 上解析。图片管线复用在途请求，限制并发下载，在后台降采样和合成边框，使用位图内存缓存与压缩数据磁盘缓存。 |
| 本地数据 | UserDefaults 保存收藏及点赞状态。图库使用 JSON 快照，图片使用文件缓存。iOS 目标未发现 SwiftData、Core Data 或 SQLite 数据访问层。 |
| 模块与依赖 | 图库与城市作品集、全屏预览和参数、WebKit 地图、Metal 与 Core Motion 空间照片。原生目标依赖系统框架。发现地图打包 MapLibre GL JS 和 worker，并按配置使用高德。管理员源码从客户端目标排除。 |
| 生命周期 | 前台刷新由 `scenePhase` 和 `.task(id:)` 驱动。键盘、内存警告、场景、电源与温度通过通知处理。空间场景启用时按需采样和绘制，退出或失活时停止。客户端发布配置未声明常驻后台模式。 |

## B. 性能问题

P0 静态审计未发现需要立即停发的性能问题。P1、P2 表示检查优先级。表中影响是从代码路径推导的，严重程度仍需真机采样确认。

| 级别与位置 | 原因和潜在影响 | 方案、修改风险与验证 |
| --- | --- | --- |
| P1 · `PhotoViewerPaging.swift:16,61,84` | 构建最多五个预览页之前遍历全相册，每次水平拖动采样再线性查找当前页。相册较长时，主线程工作随作品数量增长。 | 已改为直接取窗口，并复用中心索引。风险集中在首尾、RTL、无选中项和拖动中作品下架。对照窗口结果，再用 Animation Hitches 和 Time Profiler 检查长相册拖动。 |
| P1 · `GalleryStore.swift:153` | 排序缓存原先和搜索词绑定。改一个字就会重新排序，在附近和远方还会重复计算距离。 | 已复用按分类和有效坐标缓存的有序作品。缓存缺失时先筛选再排序，避免稀疏查询对全量数据排序。风险是并列项顺序、收藏变更和定位变化，以及每个分类多保留一份匹配数组。用相同结果序列和 Time Profiler 验证，Allocations 检查长相册查询时的峰值。 |
| P1 · `ExploreCollections.swift:26,55`、`PhotoViewer.swift:30,36` | 城市相册重复构建全图库字典，单张作品及其可见性检查也重复扫描。图库和相册变大时，视图更新产生更多临时数组和散列表。 | 已在作品快照替换时建立共享 ID 索引。风险是快照换代、下架和点赞后读取过期内容。用刷新、点赞和离线失效用例核对，再对比 Allocations 和 Time Profiler。 |
| P1 · `Pic4PickApp.swift:19`、`GalleryReader.swift:25`、`GalleryStore.swift:233,308,319` | 每次前台刷新读取完整图库分页和配置。相同快照已有目录缓存，但请求和页解析仍会发生。图库越大，后台计算和传输量越高。 | 待验证现有服务是否提供可靠的条件请求能力，再决定是否支持 304 或独立校验配置。高风险涉及下架时效、排序与点赞计数。对比固定前台窗口内请求数、字节和解析耗时，验证增删改与失效。 |
| P1 · `PhotoGeography.swift:17`、`CompactPhotoLocationMap.swift:74` | 紧凑地图和参数面板可能同时读取同一 URL 的 EXIF。媒体源忽略 512 KiB Range 时，单次请求也可能传输整张原图。 | 已合并同 URL 的在途请求。单个调用方取消时保留其他调用方，最后一个调用方退出时取消下载。有限回退仍需先验证 JPEG、HEIF、无 GPS 及 206 / 200 兼容性。直接截断存在丢失坐标和海拔的风险。 |
| P2 · `PhotoMetadataView.swift:183,188`、`GalleryTheme.swift:104` | 参数卡片在 `body` 中重复读取 PNG，内联品牌头像在 MainActor 做 Base64 解析。两者都可能增加主线程工作。 | 已复用后台素材缓存和降采样。参数图首次加载预留 80 点高度，头像目标为 180 像素并保留原解码回退。风险是占位时序、透明边缘与兼容格式。核对首次和再次打开、暗房、旋转和 3× 屏幕截图。 |
| P2 · `GalleryStore.swift:46,121,318`、`GalleryTopBar.swift:6`、`GalleryCatalog.swift:61–94` | 整对象订阅可能放大刷新，启动时同步读取小配置和字标。媒体缓存首次缺失时在 MainActor 初始化或调用 JavaScriptCore。 | 已去掉两个重复状态发布、加取消检查，并移出品牌 JSON 解析。进一步按读依赖拆分 Observation、字标加载与共享媒体规则属于后续方案。风险包括环境注入、首帧字标和 Swift/JS 规则偏差。先用 App Launch、Time Profiler 与 SwiftUI 因果图定位实际成本。 |
| P2 · `ImageDownload.swift:14–43`、`PhotoImage.swift:33–51,335–339` | 下载已限制为四路，但响应按字节追加。预览与详情使用固定的 1,000 和 2,500 像素上限，四个 `NSCache` 的成本上限合计 160 MiB。峰值还包括可见视图、WebKit 与 Metal。 | 先采样大图、滚动与相邻页预读。若证实有压力，再测试分块传输、尺寸分档或内存警告缩容。风险涉及流式大小限制、取消、缩放清晰度和胶片裁切。用受控大响应、冷暖缓存及 2×/3× 真机验证。 |
| P2 · `Pic4PickApp.swift:75–88`、`GalleryTheme.swift:75`、`SpatialMetalView.swift:9,145,278,331` | 地图预热、预读暗房背景和空间纹理准备可带来额外工作。前台静置和空间场景稳定后是否仍有显著功耗需要采样。 | 先量化预热对首次切页的影响和空间开启时的 Metal 开销。若样本支持，再调整预热时机或将空间准备分阶段。风险是切页延迟、颜色、动画节奏和 GPU 资源生命周期。对比地图进程内存、Energy Log 和空间开关循环。 |
| P2 · `scripts/prepare.mjs:67–73` | iOS 复制了一张没有客户端引用的 35 mm 控制示意图。其他静态资源中包含仍在使用的胶片扫描图、字标和地图脚本。 | 已删除示意图的生成副本。回归风险集中在资源引用遗漏，通过全量源引用扫描、重新打包和资源清单验证。其余资源需先做无损体积分析与像素比对。 |

## C. 已完成优化

- **翻页与相册。** 预览只物化中心前后各两页，拖动时通常只做下标与 ID 检查。图库快照更新时建立一次 ID 到下标的索引，详情与城市相册共享查询。索引在点赞计数原地更新时继续使用，作品下架与失效清空走同一快照替换路径。
- **图库搜索。** 已有完整分类排序时，改字只过滤该数组。分类尚未缓存且查询非空时，先筛选再排序。搜索沿用即时执行及 `localizedCaseInsensitiveContains`，缓存跟随照片、目录、收藏、随机顺序和坐标失效。
- **图片与状态。** 参数卡片和内联品牌头像使用后台图片 actor。品牌响应在图库读取 actor 解析，只有标题、副标题和选出的头像值回到 MainActor。取消的读取跳过解析和状态写入，相同的错误清空跳过重复发布。移除发现页的内置地图配置提示时，一并移除了该提示专用的状态发布。
- **EXIF 请求。** 紧凑地图和参数面板共享相同完整 URL 的在途请求，保留原 Range、回退与成功缓存规则。共用请求支持逐个取消调用方。
- **包体积。** 准备脚本移除旧的生成文件 `35mm-controls.png`，仓库里的原始图仍供网页使用。边框文件继续由原资源复制，预览和详情的胶卷匹配、横竖方向和完整画面合成沿用现有实现。

## D. 验证结果

| 验证项 | 结果 |
| --- | --- |
| 基线 | 在 Windows 的隔离副本中使用 staging 夹具，WSL Swift 6.4.2、xtool 1.24.0 和已安装的 Darwin SDK 完成 iOS Debug 交叉构建。 |
| 修改后构建 | Debug 和 Release 均完成交叉构建。Release 使用隔离的 production 形态夹具。两种构建均使用 Swift 6 模式，构建输出未出现并发诊断。 |
| 现有检查 | `scripts/build.sh` 的 13 组 Swift 可执行检查和 3 项 Python 静态检查通过。网页共享规则一致性检查通过，Playwright 地图夹具检查通过。 |
| 原生测试源码 | 更新地图桥接测试的 `WebsiteMapPayload` 初始化方式。XCTest 和 XCUITest 两组源码均以 Swift 6 针对 iPhoneOS SDK 通过类型检查。原生测试的运行结果仍待设备或模拟器。 |
| 差分检查 | 临时 Swift 6 脚本通过 5,367 个对照用例，涵盖 5,000 张合成照片的六种分类或收藏、并列排序、首次窄查询、查询切换、定位变化，以及空相册和首尾分页窗口。 |
| 搜索微基准 | WSL Swift 6 优化编译，5,000 张合成照片，21 次交替运行取中位数。已缓存「附近」分类的 11 条查询由 120.67 ms 降到 51.96 ms。分类缓存缺失时，首次窄查询由 9.91 ms 到 9.93 ms。第二轮测量发现原先的缓存策略会在冷查询时对全量数据排序，已改为只排序匹配项。该测试只衡量搜索算法。 |
| 网络夹具 | 6 组品牌请求和响应夹具覆盖原路径、查询参数和请求头，以及内联头像、URL 回退、清空、无数据、无效 JSON 和 HTTP 错误。共享请求检查覆盖重叠读取、取消其中一个调用方、取消最后一个调用方和重试。原生 ImageIO 与媒体源的 Range 兼容性待真机测量。 |
| 包体积 | 包内确认移除 1,210,060 字节（1.15 MiB）的生成 PNG。第一轮包体对比以完成当轮 P1 修改后的 Debug 包为参照，文件总字节数由 34,171,892 降至 33,055,480，减少约 3.27%。五个打包边框的 SHA-256 均与仓库原图一致。App Store 下载及安装大小仍待归档后测量。 |
| 待实测 | 原生 XCTest/XCUITest、真机视觉和手势、启动毫秒数、帧率、CPU、内存峰值、泄漏、实际 HTTP 流量和能耗需要 macOS 与测试设备。交叉编译及模型检查覆盖了编译与逻辑层。 |

## E. 尚未解决的问题

1. **全量刷新。** 先在同一组上架、下架、点赞和断网样本中抓取请求与缓存响应。只有能验证服务提供的校验器涵盖可见性和字段变更时，才把条件读取接入刷新路径。保留五分钟缓存失效与下架可见性测试作为验收条件。
2. **EXIF 与图片传输。** 在真机用受控媒体夹具验证 Range、忽略 Range 和无效分段，并确认合并请求后仍能正确获取坐标及海拔。对照 EXIF 结果后再定回退策略。若采样确认逐字节追加的 CPU 成本高，用分块传输实现并复跑超限、重定向、取消、格式校验和多订阅者取消场景。
3. **状态与启动。** 用 SwiftUI 因果图确认刷新波及的实际视图。若代价显著，优先分离地图配置、品牌和目录更新，并验证 UIKit 托管的照片查看器仍能正确收到状态变更。用 App Launch 决定是否拆分配置加载和媒体规则初始化。搜索防抖留待即时搜索的交互取舍得到确认后评估。
4. **显示、缓存与包体。** 测试普通滚动、胶片显影、全屏翻页、地图预热与空间场景的峰值内存和持续功耗。用设备尺寸归档报告确认 MapLibre、图片及图标的体积占比，再决定优化顺序。胶片素材变更应做横竖屏边缘、透明度和照片完整范围的像素对照。

## F. Instruments 测试指南

### 构建与自动化

在 macOS 的独立副本中准备 Debug 用的 staging 配置。安装 Node、XcodeGen 和 iOS Simulator。纯自动化可以使用仓库 CI 的夹具配置，真机网络采样使用同一个可用的 staging 环境与固定图库快照。命令从仓库根目录执行。

```bash
npm ci
bash ios/scripts/prepare-store.sh staging /absolute/path/to/ios-staging.env
xcrun simctl list devices available
export PIC4PICK_SIMULATOR_UDID='<simulator-udid>'
xcodebuild -project ios/Pic4Pick.xcodeproj -scheme Pic4Pick \
  -destination "platform=iOS Simulator,id=$PIC4PICK_SIMULATOR_UDID" \
  -parallel-testing-enabled NO -resultBundlePath "/tmp/Pic4Pick-$(date +%s).xcresult" \
  CODE_SIGNING_ALLOWED=NO SWIFT_STRICT_CONCURRENCY=complete test
xcrun xctrace list templates
```

使用 Xcode 的 **Product → Profile**。对同一台真机、同一 iOS 版本、相同构建优化级别和符号，分别记录基线和修改后版本。固定网络、亮度、电量模式、屏幕刷新设置、图库数据和图片缓存状态。各跑至少 10 次启动和 3 轮操作轨迹，记录中位数、P90 或范围。将 60 Hz 和 ProMotion 分开记录。App Launch 和 SwiftUI 轨迹建议分别采集，以减少分析工具的采样干扰。

| 指标 | 操作与记录 |
| --- | --- |
| 冷启动、热启动、恢复 | 用 **App Launch** 从进程未运行状态启动。分别测重启后的首次启动、已启动过后终止再开，以及进程仍在时后台回前台。每组再区分有无图库缓存。记录系统首帧、首批作品可见和首次可滚动时间。展开主线程栈，定位配置、字标、缓存、JS 初始化。 |
| SwiftUI 更新 | 在支持 SwiftUI 模板的 Xcode 与 iOS 上，固定输入一组中英文搜索词，依次点收藏、点赞、下拉刷新、切类别。查看 Long View Body Updates、更新次数和 Cause & Effect Graph，检查无变化的地图状态是否仍触发图库刷新。 |
| 滚动与切页 | 用 **Animation Hitches** 录制固定长度滚动、胶片分类切换、长相册连续左右翻页、参数展开及收起。分别采集冷暖图片缓存。记录 hitch time ratio、卡顿次数及最长帧，并回归 RTL、首尾、下架中断、Reduce Motion 和旋转。 |
| CPU | 用 **Time Profiler** 逐场景录制搜索、拖动、地图初次切换、空间场景开启和静置。检查主线程的排序、距离计算、PNG IO、Base64、JS 初始化，以及后台的图片追加、解码和合成。 |
| 内存与泄漏 | 用 **Allocations / Leaks** 和 Xcode Memory Graph 标记启动、首次地图、50 次打开关闭详情、空间场景开关 20 次以及退出后的稳定点。记录峰值和稳定值，检查图片位图、`WKWebView`、宿主控制器、Metal 纹理和任务持有链。预期缓存有明确的稳定区间。 |
| 网络 | 用 **HTTP Traffic** 或可信测试代理记录请求数、状态码、响应大小和取消时间。覆盖首次启动、前台静置五分钟、两次下拉刷新、快速翻页、参数 EXIF、后台切换和断网重连。分开统计图库分页、配置、图片、地形和地图瓦片，核对 `Range` 的 206 / 200 差异。 |
| 耗电与后台 | 在真机用 **Energy Log / Power Profiler** 分别录制固定时长的图库静置、发现页、空间场景，以及回后台后的安静窗口。记录 CPU/GPU 活动、网络唤醒、传感器和温度。验证离开空间模式和进入后台后任务与绘制收敛。 |
| 包体积 | 用同一配置和资源准备流程归档两个版本。在 Xcode Organizer 查看 App Thinning Size Report，比较相同设备变体的压缩与解压大小，核对 `35mm-controls.png` 缺席并逐一检查五张胶片边框。 |

Apple 参考资料：[SwiftUI 性能分析](https://developer.apple.com/documentation/xcode/understanding-and-improving-swiftui-performance)、[App 响应性与掉帧](https://developer.apple.com/documentation/xcode/improving-app-responsiveness)、[Instruments 工具参考](https://developer.apple.com/library/archive/documentation/AnalysisTools/Conceptual/instruments_help-collection/)。

品牌读取继续使用现有 Data REST API 路径和参数。[Supabase Data REST API 文档](https://supabase.com/docs/guides/api)
