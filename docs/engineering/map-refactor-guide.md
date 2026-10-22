# 地图实现与复用边界

更新：2026-10-22。本文描述当前代码，替代未接入的 useMapInitialize 重构草案。

- 图库发现视图使用 `src/pages/gallery/hooks/useMapInit.ts` 的 useGaodeMapInit、useFocusMapOnCity、useMapMotion。容器、activeView 和中心/缩放配置由 ExploreView 提供；地图预设决定高德 JS 或 MapLibre，失败时保留栅格回退。
- 照片详情地图由 `PhotoLocationMap.jsx` 管理，包含自身的显示和资源释放条件。
- 管理页上传和编辑保留独立的地图实例、搜索状态及生命周期；共同的标记样式、坐标顺序、弹窗与名称转义位于 `src/utils/locationMarker.js`。不要通过复用标记而混用两套选择状态。
- 地图预设数据位于 `packages/shared/mapStylePresets.ts`；设置推断/转换位于 `packages/shared/adminSettings.ts`；Web 的环境读取由 `src/utils/gaodeMapStyle.ts` 适配。
- 小程序使用原生 Map 与平台坐标适配，不加载浏览器 DOM/MapLibre 实现；平台差异保留在 `miniapp/src/platform`。

修改地图时应保留取消订阅、实例销毁、飞行取消、坐标来源及配置更新事件。纯规则运行 `npm run check`；浏览器地图 smoke 使用本地开发服务，原生定位/方向和地图权限仍需真机验证。

详见 [清理实施记录](redundancy-cleanup.md) 和 [小程序地图配置](wechat-miniapp-map-style.md)。
