# 数据库迁移至国内服务器指南

本文档说明如何将 Pic4Pick 的数据库从 Supabase 迁移到国内自建服务器。

---

## 方案概览

| 方案 | 前端改动 | 部署复杂度 | 适用场景 |
|------|----------|------------|----------|
| **方案一**：自建 Supabase | 仅改 URL | 中（Docker） | 希望改动最小、保持 Supabase 生态 |
| **方案二**：Node + PostgreSQL + 自定义 API | 需适配层 | 中高 | 希望完全掌控、与现有后端统一 |

---

## 方案一：自建 Supabase（推荐）

Supabase 开源，可在国内服务器用 Docker 部署，前端只需修改 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。

### 1. 服务器要求

- Linux（Ubuntu 20.04+ / CentOS 7+）
- Docker 与 Docker Compose
- 至少 2GB 内存、20GB 磁盘

### 2. 安装 Supabase 自托管

```bash
# 克隆 Supabase 自托管仓库
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker

# 复制环境变量模板
cp .env.example .env

# 编辑 .env，设置：
# - POSTGRES_PASSWORD（强密码）
# - JWT_SECRET（用于 anon key 签名，可用 openssl rand -base64 32 生成）
# - SITE_URL（你的前端地址，如 https://pic.yourdomain.com）
# - ADDITIONAL_REDIRECT_URLS（同上，用于 OAuth 回调）

# 启动
docker compose up -d
```

### 3. 获取 API 凭证

启动后访问 `http://你的服务器IP:3000`（或配置的端口），进入 Supabase Studio：

- **Project Settings** → **API**：复制 `Project URL` 和 `anon public` key
- 将这两个值填入前端配置（管理后台 → 配置）

### 4. 执行数据库迁移

在 Supabase Studio 的 **SQL Editor** 中，按顺序执行 `supabase/migrations/` 目录下的 SQL 文件，或使用合并后的完整脚本（见下文「完整建表脚本」）。

### 5. 前端配置

在管理后台「配置」中：

- **Supabase URL**：`http://你的国内服务器IP:54321`（或你的 Kong 网关地址）
- **Supabase Anon Key**：从 Studio 复制的 anon key

---

## 方案二：Node 后端 + PostgreSQL + 自定义 API

将数据库改为国内 PostgreSQL，在后端（`server-enhanced.js`）提供 REST API，前端通过适配层调用。

### 1. 服务器安装 PostgreSQL

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# 创建数据库和用户
sudo -u postgres psql
CREATE DATABASE pic4pick;
CREATE USER pic4pick_user WITH ENCRYPTED PASSWORD '你的密码';
GRANT ALL PRIVILEGES ON DATABASE pic4pick TO pic4pick_user;
\q
```

### 2. 执行建表脚本

在 `pic4pick` 数据库中执行 `docs/schema_domestic_postgres.sql`（见下文）。

### 3. 后端扩展

在 `server/` 中安装 pg 客户端：

```bash
cd server
npm install pg
```

新增数据库连接与 API 路由（需在 `server-enhanced.js` 中实现）：

- `GET /api/db/photos` - 查询照片（支持 status、order）
- `POST /api/db/photos` - 插入照片
- `PATCH /api/db/photos/:id` - 更新照片
- `DELETE /api/db/photos/:id` - 删除照片
- `GET/POST/PATCH /api/db/gear_presets` - 相机/镜头预设
- `GET/POST/PATCH /api/db/brand_settings` - 品牌配置

### 4. 前端适配

需要新增「数据源适配层」：当配置为「国内自建」时，使用 `fetch` 调用 `/api/db/*`，否则使用 Supabase 客户端。具体实现需修改：

- `src/utils/supabaseClient.js` → 支持切换为 `DomesticApiClient`
- 各 hook（`usePhotoManagement`、`useGearOptions`、`useBrandConfig`）接收统一的「数据源接口」

此方案改动较大，建议在方案一验证通过后再考虑。

---

## 数据迁移（从 Supabase 导出 → 国内导入）

### 1. 从 Supabase 导出

在 Supabase Dashboard → **Table Editor** 中：

- 对 `photos`、`gear_presets`、`brand_settings` 分别导出为 CSV，或
- 使用 `pg_dump`（若你有数据库直连权限）：

```bash
pg_dump -h db.xxx.supabase.co -U postgres -d postgres \
  -t photos -t gear_presets -t brand_settings \
  --data-only --column-inserts > backup.sql
```

### 2. 导入到国内 PostgreSQL

```bash
psql -h 你的国内服务器 -U pic4pick_user -d pic4pick -f backup.sql
```

---

## 完整建表脚本（国内 PostgreSQL / 自建 Supabase 通用）

项目已提供完整脚本：`docs/schema_domestic_postgres.sql`

在目标数据库中执行：

```bash
psql -h 你的服务器 -U 你的用户 -d pic4pick -f docs/schema_domestic_postgres.sql
```

或在 Supabase Studio / pgAdmin 的 SQL 编辑器中粘贴并执行该文件内容。

---

## 国内云数据库可选方案

若不想自建 PostgreSQL，可使用国内云厂商的托管数据库：

| 厂商 | 产品 | 说明 |
|------|------|------|
| 阿里云 | RDS PostgreSQL | 需配合方案二（Node API），或使用 Supabase 自托管连接 RDS |
| 腾讯云 | 云数据库 PostgreSQL | 同上 |
| 华为云 | RDS PostgreSQL | 同上 |

**注意**：Supabase 自托管默认使用 Docker 内的 PostgreSQL。若希望数据库与计算分离，可修改 Supabase Docker 配置，将 `postgres` 服务指向外部 RDS 连接串。

---

## 常见问题

### Q: 自建 Supabase 的 anon key 如何生成？

Supabase 自托管的 JWT 使用你在 `.env` 中配置的 `JWT_SECRET` 签名。anon key 是一个预签名的 JWT，需与 Supabase 工具链一致。建议直接使用 Docker 启动后 Studio 提供的默认 anon key，或参考 [Supabase 自托管文档](https://github.com/supabase/supabase/tree/master/docker) 生成。

### Q: 迁移后前端仍连不上？

1. 检查国内服务器防火墙是否放行 54321（Kong）、5432（PostgreSQL 直连时）等端口
2. 若使用 Nginx 反向代理，确保 WebSocket 和 CORS 配置正确
3. 管理后台「配置」中的 Supabase URL 需为 `https://你的域名` 或 `http://IP:54321`（开发环境）

### Q: 图片存储（OSS）需要迁移吗？

不需要。图片存储在阿里云 OSS，`photos` 表仅存图片 URL。迁移数据库后，只要 OSS 的 URL 不变，图片可正常访问。
