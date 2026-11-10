# 图片预览与信息面板转场 · 1.7.1（43）

## 参考视频分析

已实际读取用户提供的视频 `G:/AAA下载/微信视频2026-11-05_195125_866.mp4`：约 9.097 秒、1170×2532，视频流标称 120 fps。抽取并查看了 2 fps 总览，以及上滑和关闭两段 20 fps 关键帧。标称帧率不代表本 App 实测帧率。

- 0–约 1.2 秒：照片居中，信息面板收起。
- 约 1.3–1.7 秒：同一照片向上运动并连续裁成顶部预览，地图和信息卡片同步上来。
- 中段：地理位置和光圈、快门等参数是一张连续长页；滚动时底部分区指示变化。
- 约 8 秒起：底层网格显现，照片沿释放方向继续运动，再收回对应单元，约 8.4 秒附近收敛。

[总览关键帧](F:/Github/pic4pick/.artifacts/preview-reference/overview.jpg) · [上滑片段](F:/Github/pic4pick/.artifacts/preview-reference/panel.jpg) · [关闭片段](F:/Github/pic4pick/.artifacts/preview-reference/closing.jpg)。这些文件仅用于分析，不进入安装包。

## 最终架构

图库、收藏和城市作品集通过 `.photoPreview(item:)` 呈现原有 SwiftUI PhotoViewer。外层使用 UIKit 自定义模态、UIViewControllerTransitioningDelegate、UIViewControllerAnimatedTransitioning 及保留底层列表的 UIPresentationController。列表不会为转场重新创建或强制滚动。

会话分开管理生命周期和内容状态：photo（居中）、information（顶部裁剪＋展开信息）、returningToGrid（回位）。一张持有已解码 UIImage 的覆盖层贯穿图片运动。没有用简单 scaleEffect＋dismiss 代替回位。

手指按住时，由窗口坐标的 translation/velocity 直接驱动照片和同一个面板进度，不启动弹簧追手。SwiftUI 原有信息内容保持固定布局，只有少量 offset/opacity 修饰器订阅进度；根查看器、分页和参数业务不订阅每帧变化。图片 bitmap bounds 固定，使用 transform/center 调整显示，顶部裁剪终点只在几何改变时重算。

松手阶段使用临时 CADisplayLink 和解析阻尼弹簧，沿用设备刷新率／省电／温度策略。评估过 matchedGeometryEffect、percent-driven 和 UIViewPropertyAnimator；独立裁剪窗口、尺寸、位置需要分别保留初速度，因此使用统一物理模型。参考 [UIKit 自定义转场](https://developer.apple.com/documentation/uikit/uiviewcontrolleranimatedtransitioning)。没有永久动画时钟。

## 几何与最后一帧

- 作品 ID 是业务身份，每个单元有独立 token，每个列表有独立 scope，每次打开有独立会话 UUID。翻页后只在同一列表作用域查目标，避免落到其他页面的同一照片。
- 来源弱引用原生 UIImageView。进入、退出及结束复核时通过 `view → UIWindow → transition container` 转换实际 frame，包含当前滚动、安全区和导航位置，不缓存旧屏幕坐标。
- 全屏端点取 UIScrollView/UIImageView 的实际可见图片区域。图片始终保留宽高比；裁剪窗口和内部图片矩形连续插值，连接列表 aspectFill 与预览 aspectFit。
- 来源离屏、部分被裁、销毁或失去公开状态时自然缩小淡出，不估算回位坐标。目标持续变化时接续修正；无法稳定时淡出，不突然跳到新位置。
- 进入复用来源 bitmap，高清可以后台加载，但稳定后才替换，不因升级高清重置手动缩放。显影中的胶片只在进入时捕获一次画面。
- 来源按会话所有权隐藏，分支重建时迁移隐藏状态。先精确到达目标，再与原卡片短暂同位置交接，处理不同解码尺寸、标题和渐变层的接缝，之后移除覆盖层。

## 手势、滚动和物理连续性

开始位移可能为零：用起始速度判向，位移／速度均为零时等待后续事件，不提前锁为关闭。一次手势认领后保持用途，上滑中反向只收回信息，不误变成退出。

预览控制器的根识别器接收照片、空白和参数区域。触摸参数内容时追踪最外层 ScrollView：向上交给内容滚动；向下且内容位于顶部时收起，否则先保留正常回顶滚动。横向和双指手势仍由原有分页／缩放／地图处理；放大态图片优先平移。无效识别器直接禁用，也不建立阻塞滚动的失败依赖。

地理位置和基本参数现在连续排列，评级和年代只显示一次。底部分区可跳到锚点，也随实际滚动区域更新。地理信息任务不因分区指示变化反复重载。

几何配置桥固定为零尺寸，同时在 SwiftUI 和 UIKit 关闭触摸命中。修复了透明桥挡住下面 ScrollView、导致根下拉可用但内容无法上滑的回归。

松手保留当前几何和真实速度，计算缩放／位置／背景透明度的导数作为初速度。弹簧后段使用五次平滑收敛窗，最终位置和速度连续达到目标与零。取消时回到当前完整照片位置，回弹中可再次接住；重置手势不会重置可见进度。

## 修改文件

| 文件（相对 ios） | 本次职责 |
| --- | --- |
| Sources/Pic4Pick/PhotoPreviewTransition.swift | 共享覆盖层、原生图片／面板进度、根手势、回弹、回位与交接 |
| Sources/Pic4Pick/PhotoTransitionMath.swift | 集中调参、几何、手指锚点、初速度及有限时长弹簧 |
| Sources/Pic4Pick/PhotoViewer.swift | 内容状态接入、根手势配置、零尺寸且不可命中的几何桥 |
| Sources/Pic4Pick/PhotoViewerMotion.swift | 轻量变换节点共用进度，手势复位保留当前画面 |
| Sources/Pic4Pick/PhotoViewerChrome.swift | 连续参数 ScrollView、分区锚点／指示及现有面板控件 |
| Sources/Pic4Pick/PhotoMetadataView.swift | 地理位置和基本参数连续展示，避免重复评级和年代 |
| Sources/Pic4Pick/PhotoPanelPictureBridge.swift | 几何配置、顶部裁剪锚点，不承载触摸或逐帧回传 |
| Sources/Pic4Pick/PhotoPanelScrollBridge.swift | 非自定义转场兼容路径的滚动协调 |
| Sources/Pic4Pick/PhotoPanelPanGesture.swift、PhotoPanelPanPolicy.swift | 原生手势／缩放冲突、有效识别器和内容回顶策略 |
| Sources/Pic4Pick/PhotoViewerLayout.swift | 原有布局及连续滚动分区判断 |
| Tests/PhotoTransitionChecks.swift、PhotoPanelPanChecks.swift、PhotoViewerLayoutChecks.swift | 几何、物理、方向、滚动策略与分区回归 |
| Info.plist、scripts/build.sh、README.md、WEB-PARITY.md | 版本、构建入口与验证记录 |

来源注册仍沿用 PhotoTransitionSource.swift；没有改动照片分类、胶卷映射、地图默认样式或公开数据规则。

## 调参

`Sources/Pic4Pick/PhotoTransitionMath.swift` 的 PhotoTransitionTuning：

| 参数 | 当前值 |
| --- | --- |
| dismissMinimumDistance | 单指下滑达到 18 pt，明显反向抬手时取消 |
| interactiveMinimumScale | 0.82 |
| backgroundFadeProgress | 0.68，归一化进度 |
| returnSpringResponse / returnSpringDamping | 0.34 / 0.92 |
| transitionDurationRange | 0.30–0.54 s，按距离／速度调整 |
| panelSpringResponse / panelSpringDamping | 0.44 / 0.94 |
| panelSettleDuration | 0.44 s |
| thumbnailHandoffDuration | 0.08 s，仅完成精确几何对齐后 |

## 验证结果和边界

1.7.1（43）已通过全部构建脚本回归、Release 编译／签名及 IPA 版本核对，无编译警告；已覆盖安装，设备实际查询版本一致。

新增／扩展模型检查覆盖横图、竖图、超长图、fit/fill、手指锚点、正反向路径、零起点方向、距离／快甩阈值、起始导数、终点位置和零速度、60/120Hz 同时刻轨迹、内容 offset/inset 和分区判断。模型检查不代表真实帧率。

用户已在当前 iPhone 确认可以上下滚动参数并收起，最后反馈目前没有明显卡顿或跳动。设备日志也记录内容滚动与 geography/parameters 分区往返。

仍需专门真机核验：不同滚动位置的缩略图精确落点、离屏／删除回退、旋转中断、冷缓存／慢网络、极端快速反复及放大与关闭交替。当前 Windows／WSL 环境没有可用 Instruments，不宣称持续 120fps 或与 Apple Photos 完全一致。
