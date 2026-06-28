# Supabase Edge Functions 配置说明

## 阿里云 OSS 签名直传函数

`upload-oss` 不接收图片文件本体，只生成短期有效的阿里云 OSS `PUT` 签名 URL。浏览器随后直接把原图上传到 `origin/`，把缩略图上传到 `ore/`。这样图片流量不会经过 Supabase Edge Function，可显著减少 Supabase Egress。

### 部署步骤

1. 安装并登录 Supabase CLI：

   ```bash
   npm install -g supabase
   supabase login
   ```

2. 链接项目：

   ```bash
   supabase link --project-ref your-project-ref
   ```

3. 设置 Function Secrets：

   ```bash
   supabase secrets set ALIYUN_OSS_REGION=oss-cn-beijing
   supabase secrets set ALIYUN_OSS_BUCKET=pic4pick
   supabase secrets set ALIYUN_OSS_ACCESS_KEY_ID=你的AccessKeyId
   supabase secrets set ALIYUN_OSS_ACCESS_KEY_SECRET=你的AccessKeySecret
   ```

   `ALIYUN_OSS_ENDPOINT` 可选；不设置时自动使用 `https://<bucket>.<region>.aliyuncs.com`。

4. 部署函数：

   ```bash
   supabase functions deploy upload-oss
   ```

5. 前端配置上传后端地址：

   ```text
   https://your-project-ref.supabase.co/functions/v1/upload-oss
   ```

   如果 `VITE_SUPABASE_URL` 已配置，生产环境会自动推导这个地址；也可以在后台配置页的“阿里云 OSS 上传后端 URL”中显式填写。

### OSS CORS

在阿里云 OSS Bucket 的 CORS 规则中允许你的 GitHub Pages 域名：

- AllowedOrigin: `https://你的用户名.github.io` 或你的自定义域名
- AllowedMethod: `PUT`, `GET`, `HEAD`
- AllowedHeader: `Content-Type`
- ExposeHeader: `ETag`

### 测试签名

```bash
curl -X POST https://your-project-ref.supabase.co/functions/v1/upload-oss \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.jpg","contentType":"image/jpeg","thumbnailContentType":"image/jpeg"}'
```

返回的 `uploads.origin.uploadUrl` 和 `uploads.thumbnail.uploadUrl` 应该是短期有效的 OSS `PUT` 地址。
