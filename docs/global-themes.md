# 全局主题

前台右上角与后台的「外观」按钮提供两个主题：

| 主题 | 氛围 | 卡片 | GSAP 切换节奏 |
| --- | --- | --- | --- |
| 纸白画廊 `paper` | 纸白、深绿、通透留白 | 20px 圆角 | 340ms，power2.out |
| 暖调胶片 `film` | 奶油纸、陶土、细纸纹 | 6px 圆角，纸色边框 | 560ms，power2.inOut |

主题覆盖图库、发现面板、地点弹窗、照片详情、管理后台和加载页。摄影图像不添加主题色滤镜；地图底图仍由后台的「地图样式」配置控制。

选择保存在浏览器的 `pic4pick_theme` 中，刷新、页面导航及同源其他标签页会保持同步。无有效保存值时使用纸白画廊。主题偏好是每位访客的本地选择，不会写入云端或修改站点配置。

`index.html` 在应用加载前设置主题，避免刷新时先显示浅色页面。存储不可用时仍可在当前会话切换。

- `src/themes/themes.css`：配色、界面形态、字体和公共组件样式。
- `src/themes/themeConfig.js`：主题名称、预览色和动效节奏。
- `src/themes/ThemeProvider.jsx`：主题状态、存储同步和切换动效。
- `src/themes/ThemeSwitcher.jsx`：主题入口、预览面板和键盘操作。

动效参考 [GSAP 官方 skills](https://github.com/greensock/gsap-skills)，使用 `useGSAP` 自动清理和 `gsap.matchMedia` 响应「减少动态效果」。按方向键浏览选项，Enter/Space 应用，Escape 关闭。

本地 Vite 服务启动后运行：

```powershell
npm run test:themes
npm run lint
npm run build
```

主题回归测试使用街道栅格地图，使检查不依赖高德 JS SDK 凭据。已有 UI 回归也支持两种地图容器；如需固定地图测试配置：

```powershell
$env:UI_MAP_PRESET = 'street'
npm run test:ui
```
