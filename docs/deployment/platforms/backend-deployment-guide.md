# 后端服务器部署指南

当前默认入口为 `server/server-enhanced.js`，以 `server/package.json` 的 start 脚本为准。旧 server.js 保留外部兼容用途，当前部署不应改为启动旧实现。

## 构建与启动

从仓库根目录运行：

```sh
npm --prefix server ci
npm --prefix server start
```

Render 配置见根目录 `render.yaml`：rootDir 为 server，构建 npm ci，启动 npm start，健康检查 `/api/health`。Docker 仍以 server 目录作为构建上下文，Dockerfile 启动 server-enhanced.js。部署方式和域名由运维决定，本次清理没有切换托管目标。

## 必需配置

使用 `server/.env.example` 对照实际环境，凭据不写入前端或 Git：

- 登录：JWT_SECRET、ADMIN_USERNAME、ADMIN_PASSWORD。
- 管理数据库：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY，仅后端持有服务密钥。
- 上传：ALIYUN_OSS_REGION、ALIYUN_OSS_BUCKET、ALIYUN_OSS_ACCESS_KEY_ID、ALIYUN_OSS_ACCESS_KEY_SECRET。
- 运行：PORT、HOST、CORS_ORIGIN；文件日志、上传超时、点赞邮件按 render.yaml 与服务端读取项配置。

前端 VITE_API_BASE_URL 指向该 HTTPS 后端。生产构建会拒绝 localhost 或非 HTTPS 地址。

## 当前上传契约

1. 管理员通过 `/api/auth/login` 获取 JWT。
2. `/api/upload/oss` 接收带 Bearer token 的 multipart 文件、filename 和可选 uploadId。
3. 后端保留原图并生成高清预览；客户端延续稳定 ID 和提交重试。
4. 照片元数据通过 `/api/admin/photos` 等受保护接口提交。清理任务保护仍被其他作品引用的资源，不能通过“简化上传”取消这些保障。

当前 Web 和小程序均使用受保护的 OSS 上传。旧 Supabase Edge 签名直传已被 Web 客户端显式拒绝，不能将旧直传指南当作当前部署步骤。仓库保留函数源码，不代表本次已下线远程函数。

照片字段唯一清单位于 server/photoFields.js，共享层仅转导出该纯 JS 模块；server 独立部署不依赖仓库外的 packages 目录。

## 验证与回滚

部署前在仓库根运行 `npm run check`。仅查询 `/api/health` 可以检查进程存活；真实上传、数据库写入、邮件及生产切换应使用受控验证。记录当前部署提交并按原平台回滚机制恢复；不要删除历史 migration 或直接清空 uploads、app_settings、空间存储。

[分批清理与保留兼容项](../../engineering/redundancy-cleanup.md)。
