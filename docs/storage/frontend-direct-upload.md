# 前端签名直传到阿里云 OSS

> 原文件位置：`FRONTEND_DIRECT_UPLOAD.md`  
> 注意：仓库里还有一份“直传使用指南”（`frontend-direct-upload-guide.md`），两份文档结论存在历史演进痕迹，请以代码实际行为为准。

## 当前状态

代码中支持“签名直传”：Supabase Edge Function 只生成短期 OSS `PUT` URL，浏览器直接把图片上传到阿里云 OSS。

## 为什么这样做？

1. OSS AccessKey 只保存在 Supabase Function Secrets，不暴露到浏览器。
2. 图片文件不经过 Supabase，可减少 Supabase Egress。
3. 前端仍会生成缩略图并上传到 `ore/`，原图上传到 `origin/`。

## 如何启用？

1. 部署 `supabase/functions/upload-oss`。
2. 在 Supabase Function Secrets 配置：

   ```bash
   ALIYUN_OSS_REGION=oss-cn-beijing
   ALIYUN_OSS_BUCKET=pic4pick
   ALIYUN_OSS_ACCESS_KEY_ID=...
   ALIYUN_OSS_ACCESS_KEY_SECRET=...
   ```

3. 在阿里云 OSS 配置 CORS：

   - AllowedOrigin: GitHub Pages 域名或自定义域名
   - AllowedMethod: `PUT`, `GET`, `HEAD`
   - AllowedHeader: `Content-Type`
   - ExposeHeader: `ETag`

4. 前端生产环境配置 `VITE_SUPABASE_URL` 后会自动推导函数地址，也可在后台配置页填写：

   ```text
   https://your-project-ref.supabase.co/functions/v1/upload-oss
   ```
