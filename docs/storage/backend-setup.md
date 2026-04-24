# 后端服务器配置指南

> 原文件位置：`BACKEND_SETUP.md`  
> 本文件为整理后的文档副本，旧文件将保留为跳转页。

## 使用现有的 Node.js 后端

### 1. 启动后端服务器

在项目根目录下，进入 `server` 目录并启动服务器：

```bash
cd server
npm install  # 如果还没有安装依赖
npm start    # 或 node server-enhanced.js
```

服务器默认运行在 `http://localhost:3002`

### 2. 配置前端连接后端

有两种方式配置后端 URL：

#### 方式 1：通过管理面板配置（推荐）

1. 打开应用的管理面板（Admin Panel）
2. 切换到"配置"标签页
3. 找到"阿里云 OSS 后端配置"部分
4. 输入后端服务器 URL，例如：
   - 本地开发：`http://localhost:3002/api/upload/oss`
   - 生产环境：`https://your-backend-server.com/api/upload/oss`
5. 点击"保存配置"
6. 刷新页面使配置生效

> 不知道如何获取后端服务器地址？请查看：`../deployment/platforms/backend-deployment-guide.md`

#### 方式 2：通过浏览器控制台配置

在浏览器控制台执行：

```javascript
// 设置后端 URL
localStorage.setItem('aliyun_oss_backend_url', 'https://your-backend-server.com/api/upload/oss');

// 清除配置（使用默认值）
localStorage.removeItem('aliyun_oss_backend_url');
```

然后刷新页面。

### 3. 后端服务器环境变量配置

确保后端服务器的 `.env` 文件包含以下配置：

```env
# 服务器端口
PORT=3002

# CORS 配置（生产环境建议限制特定域名）
CORS_ORIGIN=*

# 阿里云 OSS 配置
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=your-bucket-name
ALIYUN_OSS_ACCESS_KEY_ID=your-access-key-id
ALIYUN_OSS_ACCESS_KEY_SECRET=your-access-key-secret

# JWT 密钥（用于认证，可选）
JWT_SECRET=your-secret-key

# 运行环境
NODE_ENV=production
```

