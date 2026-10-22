# 图库模块与入口

更新：2026-10-22。

| 路径 | 职责 |
| --- | --- |
| src/App.jsx | HashRouter 与页面 lazy import |
| src/pages/Gallery.jsx | 仍被 App 使用的页面转导出入口 |
| src/pages/gallery/GalleryPage.jsx | 页面协调、筛选、实际灯箱、键盘/焦点、空间场景与视图切换 |
| components/PhotoGrid.tsx、FilmFrame.tsx、TabStrip.tsx | 网格、胶片装饰与分类交互 |
| components/ExploreView.jsx、CurationPanel.tsx、LocationPanel.tsx | 动态发现视图、城市和地点面板 |
| components/PhotoLocationMap.jsx | 详情地图 |
| hooks/usePhotoData.ts | 公开数据缓存、跨标签同步与点赞 |
| hooks/useExifAndLocation.ts、useMapInit.ts | 浏览器定位/EXIF 和地图生命周期 |
| packages/shared | 照片类型、分类、排序/分组、媒体 URL、提交事务、空间纯规则 |

原 gallery utils/constants 路径多数是共享层的薄转导出，保留现有调用契约。不要删除仍被 App 懒加载的 src/pages/Gallery.jsx。无调用方的 gallery/index.ts、旧 LightboxPanel.tsx 已移除，实际灯箱始终由 GalleryPage 驱动。

媒体平台配置由适配层显式传入；图片候选推进由 src/utils/imageFallback.js 共享，缩略图与灯箱保留各自失败状态。BrowserLocation 类型复用共享筛选类型，避免出口歧义。

[统一检查与分批清理记录](redundancy-cleanup.md)。
