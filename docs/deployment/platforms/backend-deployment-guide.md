# 后端服务器部署指南

后端服务器需要部署到云端才能让 GitHub Pages 访问。以下是几种常见的部署方式。

> 原始文档来源：`server/DEPLOYMENT_GUIDE.md`

---

## 如何获取后端服务器地址

部署完成后，你会得到一个公网 URL（平台提供的域名）。你的后端 API 通常是：

- **健康检查**：`https://<your-backend>/api/health`
- **OSS 上传**：`https://<your-backend>/api/upload/oss`

---

## 方式 1：使用免费云平台（推荐新手）

### 选项 A：Railway（推荐，简单易用）

**优点**：免费额度充足，部署简单，自动 HTTPS

**步骤**：

1. **注册账号**
   - 访问 https://railway.app
   - 使用 GitHub 账号登录

2. **创建新项目**
   - 点击 "New Project"
   - 选择 "Deploy from GitHub repo"
   - 选择您的仓库

3. **配置部署**
   - Railway 会自动检测 Node.js 项目
   - 设置根目录为 `server`（在 Settings → Source → Root Directory）
   - 设置启动命令：`npm start`

4. **配置环境变量**
   - 在项目 Settings → Variables 中添加：
     ```
     PORT=3002
     NODE_ENV=production
     CORS_ORIGIN=https://pic.rlzhao.com
     ALIYUN_OSS_REGION=oss-cn-hangzhou
     ALIYUN_OSS_BUCKET=your-bucket-name
     ALIYUN_OSS_ACCESS_KEY_ID=your-access-key-id
     ALIYUN_OSS_ACCESS_KEY_SECRET=your-access-key-secret
     ```

5. **获取服务器地址**
   - 部署完成后，Railway 会提供一个 URL，例如：`https://your-app-name.up.railway.app`
   - 您的后端 API 地址就是：`https://your-app-name.up.railway.app/api/upload/oss`

---

### 选项 B：Render（免费，但需要信用卡验证）

**步骤**：

1. **注册账号**
   - 访问 https://render.com
   - 使用 GitHub 账号登录

2. **创建 Web Service**
   - 点击 "New" → "Web Service"
   - 连接您的 GitHub 仓库
   - 设置：
     - **Name**: pic4pick-backend
     - **Root Directory**: server
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Environment**: Node

3. **配置环境变量**
   - 在 Environment 标签页添加环境变量（同 Railway）

4. **获取服务器地址**
   - Render 会提供：`https://pic4pick-backend.onrender.com`
   - 您的后端 API 地址：`https://pic4pick-backend.onrender.com/api/upload/oss`

---

### 选项 C：Fly.io（免费额度充足）

**步骤**：

1. **安装 Fly CLI**
   ```bash
   # Windows (PowerShell)
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```

2. **登录 Fly.io**
   ```bash
   fly auth login
   ```

3. **初始化项目**（在 server 目录下）
   ```bash
   cd server
   fly launch
   ```

4. **配置环境变量**
   ```bash
   fly secrets set PORT=3002
   fly secrets set NODE_ENV=production
   fly secrets set CORS_ORIGIN=https://pic.rlzhao.com
   fly secrets set ALIYUN_OSS_REGION=oss-cn-hangzhou
   fly secrets set ALIYUN_OSS_BUCKET=your-bucket-name
   fly secrets set ALIYUN_OSS_ACCESS_KEY_ID=your-access-key-id
   fly secrets set ALIYUN_OSS_ACCESS_KEY_SECRET=your-access-key-secret
   ```

5. **部署**
   ```bash
   fly deploy
   ```

6. **获取服务器地址**
   - 部署后会显示：`https://your-app-name.fly.dev`
   - 您的后端 API 地址：`https://your-app-name.fly.dev/api/upload/oss`

---

## 方式 2：使用云服务器（VPS）

如果您有自己的云服务器（如阿里云、腾讯云、AWS 等）：

### 步骤

1. **连接服务器**
   ```bash
   ssh user@your-server-ip
   ```

2. **安装 Node.js**
   ```bash
   # 使用 nvm 安装（推荐）
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 18
   nvm use 18
   ```

3. **上传代码**
   ```bash
   git clone your-repo-url
   cd Pic4Pick/server
   npm install
   ```

4. **配置环境变量**
   ```bash
   nano .env
   ```

5. **使用 PM2 运行**
   ```bash
   npm install -g pm2
   pm2 start server-enhanced.js --name pic4pick-backend
   pm2 startup
   pm2 save
   ```

6. **配置 Nginx 反向代理（可选）**
   ```nginx
   server {
       listen 80;
       server_name api.yourdomain.com;
       
       location / {
           proxy_pass http://localhost:3002;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

7. **配置 SSL（Let's Encrypt）**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d api.yourdomain.com
   ```

8. **获取服务器地址**
   - IP 方式：`http://your-server-ip:3002/api/upload/oss`
   - 域名方式：`https://api.yourdomain.com/api/upload/oss`

---

## 方式 3：使用 Supabase Edge Functions（已配置）

如果您已经配置了 Supabase，可以使用 Edge Functions：

1. **部署 Edge Function**：参考 `../../supabase/edge-functions.md`
2. **获取地址**：
   - 格式：`https://your-project-ref.supabase.co/functions/v1/upload-oss`
   - 系统会自动检测并使用

---

## 验证部署

```bash
curl https://your-backend-server.com/api/health
```

应该返回：`{"status":"ok"}`

---

## 在前端配置后端地址

部署完成后，在管理面板的"配置"标签页中：

1. 找到"阿里云 OSS 后端配置"
2. 输入您的后端地址，例如：
   - Railway: `https://your-app-name.up.railway.app/api/upload/oss`
   - Render: `https://pic4pick-backend.onrender.com/api/upload/oss`
   - Fly.io: `https://your-app-name.fly.dev/api/upload/oss`
   - 自定义域名: `https://api.yourdomain.com/api/upload/oss`
3. 点击"保存配置"
4. 刷新页面


