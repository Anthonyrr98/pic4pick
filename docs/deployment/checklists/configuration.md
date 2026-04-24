# 配置检查清单

> 原文件位置：`CONFIGURATION_CHECKLIST.md`  
> 本文件为整理后的文档副本，旧文件将保留为跳转页。

## 架构确认
- ✅ **图片存储**：阿里云 OSS
- ✅ **数据库**：Supabase PostgreSQL

---

## 1. 阿里云 OSS 配置

### 在阿里云控制台配置

- [ ] **创建 OSS Bucket**
  - 访问：https://oss.console.aliyun.com
  - 创建 Bucket，记录名称（例如：`pic4pick-images`）
  - 设置读写权限为"公共读"（或配置 CORS）

- [ ] **获取访问凭证**
  - 访问：https://ram.console.aliyun.com/manage/ak
  - 创建 AccessKey（或使用现有）
  - 记录 AccessKey ID 和 AccessKey Secret
  - ⚠️ **安全提示**：不要在前端代码中暴露 AccessKey

- [ ] **记录 Region**
  - 例如：`oss-cn-hangzhou`、`oss-cn-beijing` 等
  - 注意：后端代码会自动添加 `oss-` 前缀

### 在后端服务器配置

在 `.env` 文件中添加：

```env
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=your-bucket-name
ALIYUN_OSS_ACCESS_KEY_ID=your-access-key-id
ALIYUN_OSS_ACCESS_KEY_SECRET=your-access-key-secret
```

- [ ] 验证后端服务器能成功连接到 OSS
- [ ] 测试上传功能

---

## 2. Supabase 配置

### 在 Supabase 控制台配置

- [ ] **创建项目**
  - 访问：https://supabase.com
  - 创建新项目，记录 Project URL 和 Anon Key

- [ ] **创建 `photos` 表**

在 Supabase SQL Editor 中执行：

```sql
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  location TEXT,
  country TEXT,
  category TEXT DEFAULT 'featured',
  tags TEXT,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  altitude DECIMAL(10, 2),
  focal TEXT,
  aperture TEXT,
  shutter TEXT,
  iso TEXT,
  camera TEXT,
  lens TEXT,
  rating INTEGER DEFAULT 7,
  shot_date DATE,
  status TEXT DEFAULT 'pending',
  hidden BOOLEAN DEFAULT false,
  reject_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(status);
CREATE INDEX IF NOT EXISTS idx_photos_category ON photos(category);
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at DESC);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_photos_updated_at BEFORE UPDATE ON photos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

- [ ] **配置 Row Level Security (RLS)（可选）**

如果需要限制访问，可以配置 RLS 策略：

```sql
-- 允许所有人读取已审核的照片
CREATE POLICY "Allow read approved photos" ON photos
  FOR SELECT USING (status = 'approved' AND hidden = false);

-- 这里简化处理，允许所有人插入（生产环境建议添加认证）
CREATE POLICY "Allow insert photos" ON photos
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update photos" ON photos
  FOR UPDATE USING (true);

CREATE POLICY "Allow delete photos" ON photos
  FOR DELETE USING (true);
```

### 在前端配置

- [ ] **配置 Supabase URL 和 Anon Key**
  - 管理面板 → "配置"标签页
  - 或浏览器控制台：
    ```javascript
    localStorage.setItem('supabase_url', 'https://xxx.supabase.co');
    localStorage.setItem('supabase_anon_key', 'your-anon-key');
    ```

---

## 3. 后端服务器配置

### 部署后端服务器

- [ ] **选择部署平台**
  - Railway（推荐）：https://railway.app
  - Render：https://render.com
  - Fly.io：https://fly.io
  - 或自有 VPS

- [ ] **配置环境变量**

在部署平台的环境变量设置中添加：

```env
PORT=3002
NODE_ENV=production
CORS_ORIGIN=https://pic.rlzhao.com

# 阿里云 OSS 配置
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=your-bucket-name
ALIYUN_OSS_ACCESS_KEY_ID=your-access-key-id
ALIYUN_OSS_ACCESS_KEY_SECRET=your-access-key-secret
```

### 在前端配置后端地址

- [ ] **配置后端 URL**
  - 管理面板 → "配置"标签页 → "阿里云 OSS 后端配置"
  - 输入：`https://your-backend-server.com/api/upload/oss`
  - 或浏览器控制台：
    ```javascript
    localStorage.setItem('aliyun_oss_backend_url', 'https://your-backend-server.com/api/upload/oss');
    ```

---

## 4. 测试流程

### 测试图片上传

1. [ ] **打开管理面板**
2. [ ] **上传测试图片**
3. [ ] **检查上传结果**（进度条、OSS URL、Supabase 记录）

---

## 5. 常见问题排查

### 问题：上传失败，提示"OSS 客户端未配置"
- 检查后端服务器环境变量是否正确配置
- 查看后端服务器日志，确认 OSS 客户端是否初始化成功

### 问题：上传成功但数据库没有记录
- 检查 Supabase URL 和 Anon Key 是否正确
- 检查 RLS 策略是否允许插入

### 问题：CORS 错误
- 检查后端服务器 CORS 配置
- 确认 `CORS_ORIGIN` 环境变量包含前端域名

---

## 相关文档

- `../production.md`
- `../overview.md`
- `../../storage/backend-setup.md`
- `../../migration/domestic-database.md`

