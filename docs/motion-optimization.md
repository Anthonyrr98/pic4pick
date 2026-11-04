# Web 动画优化

本次调整针对 React Web 端；小程序、iOS 原生动画、地图镜头计算与 WebGL 渲染继续使用各自的驱动方式。

## 已完成的场景

- 探索城市卡片：面板事件委托、进入时缓存尺寸、复用 `quickTo`；离开、滚动、尺寸变化、减少动态效果或卸载时释放变换与图层。
- 胶片显影：首次注册后增量观察新增、移除和加载完成的图片，无关 class 更新不再扫描整个网格。保持可见照片同时显影、原图完整和按胶卷类型匹配边框。
- 分类重排：统一 Flip 参数，打断时清理旧回调，触摸按下立即取消重排；延续入场、悬停与重排的交接。
- 灯箱：解码完成后切入，等待期间保留旧图；过期解码、关闭和卸载不会重新启动动画。调整动态效果偏好时，已显示照片不重复入场。
- 移动探索面板：隐藏时立即终止尺寸动画并清理内容反向补偿；键盘避让时省略内容入场，保留最终面板几何供地图定位。
- 图库与探索切换：80 ms 淡出后提交视图，180 ms 淡入；支持连续反向操作、焦点转移、图库滚动位置恢复，保留地图实例。离开动作开始时立即停止地图飞行。
- 开场、主题、弹窗、上传反馈：参数集中到 `src/constants/motionPresets.js`。开场最短停留从 900 ms 调至 600 ms，淡出从 260 ms 调至 220 ms，继续等待懒加载页面就绪。地点面板退出期间不拦截下一次地图选择。

## 同一测试夹具的前后对比

Chromium 无头浏览器，1200 × 900，48 张合成照片：

| 操作 | 调整前 | 调整后 |
| --- | ---: | ---: |
| 120 次城市卡片移动中的尺寸读取 | 120 | 1 |
| 24 次无关 class 更新触发的胶片全量扫描 | 24 | 0 |
| 同时显影的可见照片 | 16 | 16 |

这些数字说明重复 DOM 工作减少，不代表真实设备上的 FPS 或加载速度保证。实际照片尺寸、设备和地图服务都会影响观感。

## 复测

先运行 `npm run dev -- --host 127.0.0.1`，再运行对应命令。可通过 `UI_BASE_URL` 指定其他地址。

- `npm run check`：项目 lint、类型检查、单元测试和内存生产构建。
- `npm run test:motion-refinement`：新增跟随、转场、滚动/焦点、隐藏面板、解码竞争和卸载回归。
- `npm run test:motion-performance -- after`：生成性能样本与 Chrome trace。
- 相关已有回归：`test:motion`、`test:discovery-motion`、`test:entry-motion`、`test:gallery-layout`、`test:location-like-motion`、`test:admin-motion`、`test:gallery-scroll`、`test:photo-details`、`test:themes`、`test:maps`、`test:spatial`。

性能 JSON、trace 和测试截图位于忽略提交的 `.artifacts/motion/`。本次前后样本分别是 `performance-before.json`、`performance-after.json`；trace 可在 Chrome DevTools Performance 中导入查看。
