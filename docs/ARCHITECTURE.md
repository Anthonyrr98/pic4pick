# Pic4Pick 架构说明

## 当前架构

### 存储架构
- **图片存储**：阿里云 OSS（对象存储服务）
- **元数据存储**：Supabase PostgreSQL 数据库

### 数据流程

```
用户上传图片
    ↓
前端 (GitHub Pages)
    ↓
后端服务器 (Node.js) → 上传到阿里云 OSS
    ↓
返回 OSS URL
    ↓
前端保存元数据 → Supabase 数据库
```

## 详细流程

### 1. 图片上传流程

1. **用户选择图片** → 前端读取 EXIF 数据（地理位置、相机参数等）
2. **点击上传** → 调用 `uploadImage()` 函数
3. **上传到 OSS**：
   - 前端 → 后端服务器（`/api/upload/oss`）
   - 后端服务器 → 阿里云 OSS
   - 返回 OSS URL（例如：`https://your-bucket.oss-cn-hangzhou.aliyuncs.com/pic4pick/xxx.jpg`）
4. **保存元数据**：
   - 前端将图片 URL 和元数据保存到 Supabase `photos` 表
   - 状态设置为 `pending`（待审核）

### 2. 数据结构

#### Supabase `photos` 表结构

```sql
CREATE TABLE photos (
  id UUID PRIMARY KEY,
  title TEXT,
  location TEXT,
  country TEXT,
  category TEXT,
  tags TEXT,
  image_url TEXT,        -- 阿里云 OSS URL
  thumbnail_url TEXT,    -- 缩略图 URL（可选）
  latitude DECIMAL,
  longitude DECIMAL,
  altitude DECIMAL,
  focal TEXT,
  aperture TEXT,
  shutter TEXT,
  iso TEXT,
  camera TEXT,
  lens TEXT,
  rating INTEGER,
  shot_date DATE,
  status TEXT,          -- 'pending' | 'approved' | 'rejected'
  hidden BOOLEAN,
  reject_reason TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### 阿里云 OSS 存储结构

```
your-bucket/
  └── pic4pick/
      ├── xxx.jpg          (原图)
      └── ore/
          └── xxx.jpg     (缩略图，如果后端生成)
```

## 配置要求

### 1. 前端配置（GitHub Pages）

#### 必需配置
- ✅ Supabase URL 和 Anon Key（用于数据库连接）
- ✅ 后端服务器 URL（用于图片上传到 OSS）

#### 配置位置
- 管理面板 → "配置"标签页
- 或通过浏览器控制台：
  ```javascript
  // Supabase 配置
  localStorage.setItem('supabase_url', 'https://xxx.supabase.co');
  localStorage.setItem('supabase_anon_key', 'your-anon-key');
  
  // 后端服务器配置
  localStorage.setItem('aliyun_oss_backend_url', 'https://your-backend.com/api/upload/oss');
  ```

### 2. 后端服务器配置

#### 环境变量（`.env` 文件）

```env
# 服务器配置
PORT=3002
NODE_ENV=production

# CORS 配置（允许 GitHub Pages 域名）
CORS_ORIGIN=https://pic.rlzhao.com

# 阿里云 OSS 配置
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=your-bucket-name
ALIYUN_OSS_ACCESS_KEY_ID=your-access-key-id
ALIYUN_OSS_ACCESS_KEY_SECRET=your-access-key-secret
```

#### 后端服务器功能
- ✅ 接收图片上传请求
- ✅ 上传图片到阿里云 OSS
- ✅ 可选：生成缩略图
- ✅ 返回 OSS URL

### 3. Supabase 配置

#### 必需配置
- ✅ 创建 `photos` 表（参考上面的 SQL）
- ✅ 配置 Row Level Security (RLS) 策略（如果需要）
- ✅ 获取 Supabase URL 和 Anon Key

#### 数据库表
- `photos`：存储照片元数据
- `brand_settings`：品牌配置（可选）

## 优势

### 使用阿里云 OSS 的优势
- ✅ **CDN 加速**：全球 CDN 分发，访问速度快
- ✅ **成本低**：按使用量付费，比服务器存储便宜
- ✅ **可扩展**：无存储容量限制
- ✅ **可靠性高**：99.999999999% 的数据持久性

### 使用 Supabase 的优势
- ✅ **实时同步**：支持实时数据同步
- ✅ **PostgreSQL**：强大的关系型数据库
- ✅ **免费额度**：个人项目免费额度充足
- ✅ **易于管理**：Web 界面管理数据

## 部署检查清单

### 前端（GitHub Pages）
- [ ] 配置 Supabase URL 和 Anon Key
- [ ] 配置后端服务器 URL
- [ ] 测试图片上传功能
- [ ] 测试数据保存到 Supabase

### 后端服务器
- [ ] 部署到云平台（Railway/Render/Fly.io）
- [ ] 配置环境变量（OSS 凭证）
- [ ] 配置 CORS（允许 GitHub Pages 域名）
- [ ] 测试上传接口

### Supabase
- [ ] 创建 `photos` 表
- [ ] 配置 RLS 策略（如果需要）
- [ ] 测试数据插入和查询

## 常见问题

### Q: 图片上传成功但数据库没有记录？
- 检查 Supabase 配置是否正确
- 检查浏览器控制台是否有错误
- 检查 Supabase 表结构是否匹配

### Q: 数据库有记录但图片无法显示？
- 检查 OSS URL 是否正确
- 检查 OSS Bucket 是否设置为公共读
- 检查 CORS 配置（如果使用自定义域名）

### Q: 如何备份数据？
- **OSS 数据**：使用阿里云 OSS 的备份功能
- **数据库数据**：使用 Supabase 的备份功能或导出 SQL

### Q: 如何迁移到其他存储？
- 修改后端服务器代码，支持其他存储服务
- 更新前端配置，指向新的后端地址
- 数据库结构无需改变（只存储 URL）

## 成本估算

### 阿里云 OSS
- **存储费用**：约 ¥0.12/GB/月
- **流量费用**：约 ¥0.50/GB（国内）
- **请求费用**：约 ¥0.01/万次 PUT 请求

### Supabase
- **免费额度**：500MB 数据库，1GB 带宽/月
- **超出后**：按使用量付费

**个人项目通常每月成本 < ¥10**

