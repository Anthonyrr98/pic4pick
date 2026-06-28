# Supabase Edge Functions 配置说明

> 原文件位置：`supabase/functions/README.md`

## 阿里云 OSS 签名直传函数

当前推荐方案是：Supabase Edge Function 只生成短期 OSS `PUT` 签名，浏览器直接上传到阿里云 OSS。图片文件不经过 Supabase，因此不会因为上传图片本体而增加 Supabase Egress。

### 部署

```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref

supabase secrets set ALIYUN_OSS_REGION=oss-cn-beijing
supabase secrets set ALIYUN_OSS_BUCKET=pic4pick
supabase secrets set ALIYUN_OSS_ACCESS_KEY_ID=你的AccessKeyId
supabase secrets set ALIYUN_OSS_ACCESS_KEY_SECRET=你的AccessKeySecret

supabase functions deploy upload-oss
```

### 前端地址

函数地址：

```text
https://your-project-ref.supabase.co/functions/v1/upload-oss
```

如果生产环境已经配置 `VITE_SUPABASE_URL`，前端会自动推导该地址；也可以在后台配置页的“阿里云 OSS 上传后端 URL”中显式填写。

### OSS CORS

阿里云 OSS Bucket 需要允许 GitHub Pages 域名直传：

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
