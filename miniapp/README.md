# Pic4Pick 微信小程序

独立的 Taro 4.3.0 + React 18 + TypeScript 工程。原网页仍使用 React 19 + Vite，共享业务代码位于 `../packages/shared`。已完成真实模拟器的公开图库、主题、详情、发现页及空间画布验证；尚未完成真机、管理读写和完整功能/视觉验收。

## 开发与导入

在本目录执行：

```powershell
npm ci
Copy-Item .env.example .env.local # 仅首次配置；已有配置时不要覆盖
npm run typecheck
npm run lint
npm test
npm run build:weapp
# 持续开发：npm run dev:weapp
```

微信开发者工具导入 `F:/Github/pic4pick/miniapp`，配置中的 `miniprogramRoot` 指向 `dist/`。AppID 已使用用户提供的 `wxbee87099f5e5d386`。也可以直接导入 `dist/`，其中生成的配置使用 `./`。当前账号已成功生成预览二维码，手机打开与体验版上传权限仍待验证。

配置变更后必须重新构建。`.env.local` 只包含公开配置并受 Git 忽略。不要填写管理员密码、JWT_SECRET、service_role、Supabase secret key、OSS Secret、SMTP 密码或 AppSecret。构建配置只导出白名单中的字段，并拒绝 Supabase secret/service_role key。

## 服务

公开内容来自同一 Supabase PostgREST，只携带原 anon/publishable key，显式使用 `Accept-Profile: public`，保留原 RLS。照片公开查询仍限制最多 1000 条，加载更多为客户端分段展示。原后台 JWT 认证继续使用 `/api/auth/login` 和 `/api/auth/verify`。

后台已于 2026-10-14 部署提交 `558882c` 的两条兼容接口，供小程序点赞和编辑：

- `POST /api/photos/:id/likes`，与原 PATCH 共用处理函数和限流实例。
- `POST /api/admin/photos/:id/update`，与原 PATCH 共用 JWT、管理员校验及部分更新处理函数。

原 PATCH 接口及网页调用保留。线上健康检查与新旧接口保护条件通过；尚未执行有效 JWT、成功点赞/编辑或上传的生产联调。未上传小程序体验版或修改数据库结构。本地协议测试不会访问生产数据库。部署和回退记录见 [后端部署审查](../docs/engineering/wechat-miniapp-backend-deploy.md)。

## 网络、地图和字体

当前本地配置沿用原线上后台及公开数据库地址，仅用于开发。需要在微信后台分别核实 request、uploadFile、downloadFile 的生产服务器域名与证书/平台要求；开发时关闭域名校验不能作为发布验证。

本机 `project.private.config.json` 暂设 `setting.urlCheck=false` 并被 Git 忽略；共享配置保留域名校验。模拟器若在构建后继续使用旧 JS，清除该项目的编译缓存并编译打开图库，再检查真实运行元素；刷新命令返回成功本身不能证明新代码已运行。

手机预览的域名校验独立于电脑本地设置。若预览报 `url not in domain list`，可由开发者在手机右上角菜单的开发调试入口打开调试，退出并重新进入以继续开发验证。本次用户已反馈此方式下照片正常加载；正式版本仍需配置并验证服务器域名，不能用开启调试的结果作为发布验收。

本次只读访问实际涉及：

- `https://pic4pick-backend.onrender.com`：认证、管理、上传、点赞、深度签名。
- `https://iwlwbnvhgxlnqozduhrp.supabase.co`：公开 PostgREST 和历史深度 Storage。
- `https://pic4pick.oss-cn-beijing.aliyuncs.com`：照片与当前深度图。
- `https://api.open-meteo.com`：沿用原网页的地形海拔兜底，只在 EXIF 和照片记录都没有海拔时调用。[接口说明](https://open-meteo.com/en/docs/elevation-api)。

如果需要自有域名代理，公开读代理必须继续使用客户端公开 key 和 RLS；禁止改成 service_role 公开代理。上传与私有深度签名继续由原后台负责。最终域名应以实际请求日志核对。

地图使用微信原生组件，地点分组与城市归类使用原共享函数。EXIF/GPS 按 WGS84 处理，地图显示转换为 GCJ02，选点再转回 WGS84；历史网页地图选点可能混有 GCJ02，当前 schema 未标注坐标来源，需逐样本核实，未做数据转换或回写。原高德/MapLibre 底图及网页地图样式不能直接套到原生地图。

用户选择无需购买个性化样式的方案：发现页保留微信默认底图，地点标记采用原网页的四色小圆点，气泡、地图面板、城市卡片及地点抽屉采用远山黛灰蓝配色。道路和水域颜色仍为默认值；纸白/胶片主题下地图周边配色一致，照片保留原色。已备好腾讯原生 `subkey` / `layer-style` 接口但未配置，当前方案不需要这两项。说明及未来可选接入步骤见 [地图样式说明](../docs/engineering/wechat-miniapp-map-style.md)。

发现页现为铺屏布局：地图通栏延伸到屏幕边缘，顶部导航悬浮，城市列表收进可展开的底部足迹栏。图库页采用自定义导航并按微信胶囊/状态栏避让；图库和详情保留顶部安全区，管理页仍使用原生导航。真实模拟器的城市/照片入口和切换路径通过，手机安全区及地图手势仍待反馈。

品牌字标沿用原素材；原 PNG 生成 840px 的小程序派生文件以控制包体，原文件保留。正文/标题字体支持通过 `PIC4PICK_BODY_FONT_URL`、`PIC4PICK_TITLE_FONT_URL` 加载原许可字体；尚未配置及真机验证，当前会回退到设备字体。

## 当前边界

图库、主题、详情、分享、点赞、保存、地图发现、管理员登录/上传/审核/编辑/隐藏/删除及空间 Canvas 的第一轮代码已写入。管理页面使用分包。

管理页已补齐分类/器材搜索、各审核状态独立列表控制、当前页批量操作、冻结确认范围及部分失败反馈；配置页提供原环境/地图预设、品牌文案、Logo 文件/地址/重置和器材控件。网页环境设置继续作用于原网站，小程序 API 配置需要修改公开构建配置并重新构建；卫星/路况开关仅作用于当前设备。

上传复用原 SHA-256、稳定 UUID、upload_id、缓存重试及 410 失效规则。原上传优化阈值为 6 MB、2560px、质量 88、至少缩小 8% 才替换；微信格式变化或压缩失败时保留原文件。选择 original 不保证相册所有来源的字节/EXIF，须真机验证。

详情从原图字节补读 EXIF，关闭/换图取消请求并清理本次下载的临时文件；坐标与海拔优先使用 EXIF，其次照片记录，海拔最后使用地形高程。地形海拔显示来源，不写入照片记录。结果缓存仅保留轻量元数据，最大原图读取的内存与手机相机格式仍需真机验收。

空间效果复用原 shader、输入数学和共享预计算缓存。详情预取检查一次，准备中不后台轮询；最多缓存三份灰度字节，generation/尺寸变化会重新读取。照片通过原生 2D 离屏画布缩至设备纹理上限与 2048px 上限之内，再上传字节；深度取红通道，与网页一致。图片解码超时、签名失效后的单次重试、临时文件清理及内存告警释放已实现。

页面关闭/切后台取消网络、解码、帧调度、窗口尺寸与方向监听；微信方向角按弧度转为原数学所需的度数。2D 离屏画布接口要求基础库至少 2.16.1，目标微信需支持该能力。真实模拟器的像素渲染、重开、加载中切换和进入其他页面已验证；方向/横屏、实际 OS 后台、签名过期、内存和帧率仍需设备验收。

具体未完成的功能和实际测试记录见 [迁移实施记录](../docs/engineering/wechat-miniapp-progress.md)。不能将本阶段称为完整移植或已可发布。
