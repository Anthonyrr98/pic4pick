# 上传方案状态

旧的“Edge 签名 + 浏览器直传”流程已被当前 Web 客户端禁用。当前入口固定走带管理员 JWT 的后端 `/api/upload/oss`，保留原图、进度和稳定提交 ID。

统一配置与验证步骤见 [后端部署指南](../deployment/platforms/backend-deployment-guide.md)。旧 Edge 函数源码保留外部兼容用途，本次未下线远程入口。
