# 前端直传到阿里云 OSS 使用指南

> 原文件位置：`FRONTEND_DIRECT_UPLOAD_GUIDE.md`

（为避免重复，这里保留原始文档要点。若你希望我把全文完整搬运到此处，也可以继续补齐。）

## 关键结论

- 当前实现是“Supabase Edge Function 签名 + 浏览器直传 OSS”。
- AccessKey 保存在 Supabase Function Secrets，不暴露给浏览器。
- 图片文件不经过 Supabase Edge Function，可避免上传图片本体造成 Supabase Egress 增长。

## 启用方式

部署 `supabase/functions/upload-oss`，并在后台配置页填写函数 URL，或配置 `VITE_SUPABASE_URL` 让前端自动推导。

