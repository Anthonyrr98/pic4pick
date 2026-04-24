# Supabase Edge Functions 配置说明

> 原文件位置：`supabase/functions/README.md`  
> 本文件为整理后的文档副本，旧文件保留原位置。

## 阿里云 OSS 上传函数

### 部署步骤

1. **安装 Supabase CLI**（如果还没有安装）:
   ```bash
   npm install -g supabase
   ```

2. **登录 Supabase**:
   ```bash
   supabase login
   ```

3. **链接到您的项目**:
   ```bash
   supabase link --project-ref your-project-ref
   ```

4. **设置环境变量**（在 Supabase Dashboard）:
   - `ALIYUN_OSS_REGION`
   - `ALIYUN_OSS_BUCKET`
   - `ALIYUN_OSS_ACCESS_KEY_ID`
   - `ALIYUN_OSS_ACCESS_KEY_SECRET`
   - `ALIYUN_OSS_ENDPOINT`（可选）

5. **部署函数**:
   ```bash
   supabase functions deploy upload-oss
   ```

### 注意事项

⚠️ **重要**: 当前提供的 `index.ts` 是一个简化版本，需要实现完整的 OSS 签名算法才能正常工作。

**推荐方案**:
1. 使用现有的 Node.js 后端服务器（`server/server-enhanced.js`），它已经完整实现了 OSS 上传功能
2. 或者使用 Supabase Storage 替代阿里云 OSS

### 测试

```bash
curl -X POST https://your-project-ref.supabase.co/functions/v1/upload-oss \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -F "file=@test.jpg" \
  -F "filename=test.jpg"
```

