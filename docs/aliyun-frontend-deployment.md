# 北京 OSS + 阿里云 CDN 前端部署

站点域名：`pic.rlzhao.com`。前端使用独立 Bucket `pic4pick-web-rlzhao`（北京），照片仍在 `pic4pick`，数据库与管理 API 仍使用现有 Supabase / Render。

## 云端设置

- OSS：标准存储、公共读；静态网站首页 `index.html`，错误页 `404.html`。禁止公共写。
- OSS 绑定 `pic.rlzhao.com`。默认 OSS 域名访问 HTML 会触发下载，自定义域名配合 CDN 回源 HOST 才能正常显示。
- CDN：中国内地，图片小文件；源站 `pic4pick-web-rlzhao.oss-cn-beijing.aliyuncs.com`。
- 默认回源 HOST：加速域名 `pic.rlzhao.com`；基础源站端口 443（HTTPS），回源 SNI 使用上述 OSS 域名。单独的“回源协议”覆盖开关保持关闭。
- 缓存目录 `/`：0 秒，优先遵循源站缓存策略；`/assets/`：365 天、权重 99。Gzip 开启。
- DNS 的 `pic` CNAME 已于 2026-10-10 切换为 `pic.rlzhao.com.w.kunlunaq.com`，TTL 10 分钟。
- CDN 已部署 DigiCert 证书 `cert-sqlzo`，到期时间 2027-01-08 07:59:59（控制台显示）。HTTP 强制跳转 HTTPS，HTTP/2、OCSP Stapling 开启，TLS 1.2 / 1.3 开启，TLS 1.0 / 1.1 关闭。
- 免费个人测试证书有效期 90 天，需要在到期前重新申请并部署。本仓库没有自动续签任务。

## 本地发布

需要 Node.js 22。将 `.env.oss.example` 复制为 `.env.oss.local`，填入只授权这个前端 Bucket 的部署凭据；不要把密钥写入前端 `VITE_*` 变量或提交到 Git。

```powershell
npm ci
npm run build
npm run deploy:oss -- --dry-run
npm run deploy:oss
```

构建使用现有 `.env` 中的公开前端配置。地图的后台配置不会自动进入构建，发布前应将已保存的高德 Web Key 和安全密钥同步到本地 `.env.local` 的 `VITE_AMAP_WEB_KEY`、`VITE_AMAP_SECURITY_JS_CODE`，并保留当前主题：

```dotenv
VITE_MAP_STYLE_PRESET=js_whitesmoke
VITE_MAP_USE_AMAP_SDK=true
VITE_AMAP_MAP_STYLE=amap://styles/whitesmoke
```

这三个主题参数对应「远山黛」。缺少主题或高德参数时，访客页面会回退为标准街道图；仅打开过管理后台的浏览器可能仍使用本地保存的主题。因此发布后必须使用未登录的页面检查发现地图的颜色、主题和高德加载状态。

上传脚本明确拒绝照片 Bucket，先上传资源，再上传 HTML，最后发布并校验首页。不会删除旧文件，已有浏览器标签页仍能请求上一版资源。带哈希的资源设置一年不可变缓存，其他文件设置 `no-cache`；字体也随构建发布，避免依赖 Google Fonts。

发布完成后，在 CDN “刷新预热”中刷新 `https://pic.rlzhao.com/` 与 `https://pic.rlzhao.com/index.html`。旧哈希资源可在确定没有客户端再使用后另行清理。

## GitHub Actions（默认关闭）

`.github/workflows/deploy-oss.yml` 已准备，只有仓库变量 `OSS_FRONTEND_ENABLED=true` 才会执行。启用前配置：

- Variables：`OSS_FRONTEND_BUCKET=pic4pick-web-rlzhao`。
- Secrets：`OSS_DEPLOY_ACCESS_KEY_ID`、`OSS_DEPLOY_ACCESS_KEY_SECRET`，以及现有 Pages 工作流使用的 `VITE_*` 配置。自动构建也需要上述地图主题参数和高德 Web Key、安全密钥。
- 创建只允许目标 Bucket 的 RAM 部署身份。脚本需要 `oss:GetBucketInfo`、`oss:GetBucketWebsite`（目标 Bucket）和 `oss:PutObject`、`oss:GetObject`（目标 Bucket 内对象）；不需要照片 Bucket、CDN 或 DNS 的权限。

工作流在 `main` 更新或手动触发时发布；当前不会自动刷新 CDN。原 GitHub Pages 工作流保留作为备用站点。

## 检查与回退

检查首页 HTTP 200、HTML 显示而非下载、CSS/JS/字体的 MIME 类型、HTTPS 域名与有效期，以及图库和 `/#/admin`。

如需回退，把 `pic` 的 DNS CNAME 恢复为 `pic4pick.github.io`（原 TTL 10 分钟），或将此前构建重新发布至 OSS 并刷新首页。切换 DNS 不能解决 Supabase 或 Render 在部分国内网络上的访问问题。

参考：[OSS 静态网站](https://help.aliyun.com/zh/oss/user-guide/hosting-static-websites)、[CDN HTML 自动下载处理](https://help.aliyun.com/zh/cdn/requests-sent-to-cdn-accelerated-domain-names-to-access-html-files-trigger-automatic-downloads-of-the-files/)、[默认回源 HOST](https://help.aliyun.com/zh/cdn/user-guide/configure-the-default-origin-host)。
