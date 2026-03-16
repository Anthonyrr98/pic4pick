# 配置检查清单

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

-- 允许管理员插入/更新/删除（需要配置认证）
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

- [ ] **获取后端服务器 URL**
  - Railway: `https://your-app-name.up.railway.app`
  - Render: `https://your-app-name.onrender.com`
  - Fly.io: `https://your-app-name.fly.dev`

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
   - 访问应用的管理页面
   - 输入管理员密码

2. [ ] **上传测试图片**
   - 选择一张图片
   - 填写标题、位置等信息
   - 点击上传

3. [ ] **检查上传结果**
   - ✅ 上传进度条正常显示
   - ✅ 上传成功后显示 OSS URL
   - ✅ 图片在 Supabase 数据库中有记录
   - ✅ 状态为 `pending`

4. [ ] **检查 OSS**
   - 访问阿里云 OSS 控制台
   - 确认文件已上传到 `origin/` 目录
   - 确认缩略图已上传到 `ore/` 目录（如果生成）

5. [ ] **检查数据库**
   - 访问 Supabase 控制台
   - 查看 `photos` 表
   - 确认记录已创建，`image_url` 字段包含 OSS URL

### 测试审核流程

1. [ ] **审核通过**
   - 在管理面板找到待审核照片
   - 点击"通过"
   - 确认状态变为 `approved`
   - 确认在前台图库中可见

2. [ ] **审核拒绝**
   - 点击"拒绝"
   - 确认状态变为 `rejected`

---

## 5. 常见问题排查

### 问题：上传失败，提示"OSS 客户端未配置"
- ✅ 检查后端服务器环境变量是否正确配置
- ✅ 检查后端服务器日志，确认 OSS 客户端是否初始化成功
- ✅ 确认环境变量名称拼写正确

### 问题：上传成功但数据库没有记录
- ✅ 检查 Supabase URL 和 Anon Key 是否正确
- ✅ 检查浏览器控制台是否有错误
- ✅ 检查 Supabase 表结构是否匹配
- ✅ 检查 RLS 策略是否允许插入

### 问题：CORS 错误
- ✅ 检查后端服务器 CORS 配置
- ✅ 确认 `CORS_ORIGIN` 环境变量包含前端域名
- ✅ 检查后端服务器是否正确处理 OPTIONS 请求

### 问题：图片无法显示
- ✅ 检查 OSS URL 是否正确
- ✅ 检查 OSS Bucket 是否设置为"公共读"
- ✅ 检查图片 URL 是否可访问（在浏览器中直接打开）

---

## 6. 生产环境优化建议

- [ ] **安全配置**
  - [ ] 限制 CORS 来源（不要使用 `*`）
  - [ ] 配置 OSS Bucket 的访问策略
  - [ ] 使用 HTTPS（所有平台都自动提供）

- [ ] **性能优化**
  - [ ] 配置 OSS CDN 加速
  - [ ] 优化图片压缩质量
  - [ ] 使用 Supabase 索引提高查询速度

- [ ] **监控和日志**
  - [ ] 配置错误监控（如 Sentry）
  - [ ] 定期检查后端服务器日志
  - [ ] 监控 OSS 存储和流量使用情况

- [ ] **备份**
  - [ ] 定期备份 Supabase 数据库
  - [ ] 配置 OSS 生命周期规则（自动备份）

---

## 本地开发故障排除

### 1. `net::ERR_CONNECTION_REFUSED`（如 `http://localhost:3002/api/upload/sign`）

**原因**：后端未启动，前端请求不到签名/上传接口。

**处理**：在项目根目录执行：

```bash
npm run server
```

或在单独终端执行：

```bash
cd server
npm run dev
```

后端默认端口为 **3002**（与 vite 代理一致）。确保终端中看到类似 “服务器运行在 http://0.0.0.0:3002” 再刷新前端。

### 2. Supabase CORS：`No 'Access-Control-Allow-Origin' header`

**原因**：从 `http://localhost:5173` 访问 Supabase 时，若未把该来源加入允许列表，或接口返回 401/403 且未带 CORS 头，浏览器会报 CORS 错误。

**处理**：

1. **在 Supabase 中允许本地来源**  
   - 打开 [Supabase Dashboard](https://supabase.com/dashboard) → 选择项目  
   - **Project Settings** → **API**  
   - 在 **CORS / Allowed origins**（或类似名称）中增加：`http://localhost:5173`  
   - 保存后重试

2. **先排除鉴权问题**  
   - 若仍报 CORS，可能是接口返回 401/403，而错误响应未带 CORS 头  
   - 在管理后台「配置」中确认 **Supabase URL** 与 **Anon Key** 与 Dashboard → Project Settings → API 中一致  
   - 确认 `photos`、`gear_presets` 等表已按文档配置 RLS 策略，允许 anon 的 SELECT/INSERT/UPDATE

---

## 完成检查

完成以上所有配置后，您的应用应该能够：
- ✅ 上传图片到阿里云 OSS
- ✅ 保存元数据到 Supabase
- ✅ 在前台图库中显示已审核的照片
- ✅ 在管理面板中管理照片

如有问题，请参考：
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 架构说明
- [server/DEPLOYMENT_GUIDE.md](./server/DEPLOYMENT_GUIDE.md) - 后端部署指南
- [BACKEND_SETUP.md](./BACKEND_SETUP.md) - 后端配置指南
- [docs/MIGRATION_DOMESTIC_DATABASE.md](./docs/MIGRATION_DOMESTIC_DATABASE.md) - **数据库迁移至国内服务器指南**

