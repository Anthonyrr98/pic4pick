# 生产环境部署检查清单

> 原文件位置：`PRODUCTION_DEPLOY_CHECKLIST.md`  
> 本文件为整理后的文档副本，旧文件将保留为跳转页。

## 🚀 快速部署步骤

### 第一步：部署后端服务器（Cyclic - 完全免费）

#### 1. 准备
- [ ] 代码已推送到 GitHub
- [ ] 已注册 Cyclic 账号（https://cyclic.sh）

#### 2. 创建应用
- [ ] 在 Cyclic 创建新应用
- [ ] 连接 GitHub 仓库
- [ ] 设置 Root Directory: `server`
- [ ] 设置 Start Command: `npm start`

#### 3. 配置环境变量

在 Cyclic Environment Variables 中添加：

```env
PORT=3002
NODE_ENV=production
CORS_ORIGIN=https://pic.rlzhao.com

ALIYUN_OSS_REGION=cn-beijing
ALIYUN_OSS_BUCKET=pic4pick
ALIYUN_OSS_ACCESS_KEY_ID=你的AccessKey ID
ALIYUN_OSS_ACCESS_KEY_SECRET=你的AccessKey Secret
```

#### 4. 获取后端 URL
- [ ] 部署完成后，记录后端 URL（例如：`https://xxx.cyclic.app`）
- [ ] 测试健康检查：`https://xxx.cyclic.app/api/health`
- [ ] 确认返回：`{"status":"ok"}`

---

### 第二步：部署前端（GitHub Pages）

#### 1. 构建前端
- [ ] 运行 `npm run build`
- [ ] 确认 `dist` 目录已生成

#### 2. 部署到 GitHub Pages
- [ ] 将 `dist` 目录内容推送到 `gh-pages` 分支
- [ ] 或在 GitHub Settings → Pages 中配置构建

#### 3. 配置前端连接后端
- [ ] 访问 GitHub Pages 网站
- [ ] 进入管理面板
- [ ] 配置 → 阿里云 OSS 后端配置
- [ ] 输入后端 URL：`https://xxx.up.railway.app/api/upload/oss`
- [ ] 保存配置
- [ ] 刷新页面

---

### 第三步：验证部署

#### 1. 测试后端
- [ ] 访问 `/api/health` 返回正常
- [ ] 查看日志，确认 OSS 客户端已初始化

#### 2. 测试上传
- [ ] 在管理面板上传一张测试图片
- [ ] 上传进度条正常显示
- [ ] 上传成功后显示 OSS URL
- [ ] 浏览器控制台无错误

#### 3. 检查 OSS
- [ ] 访问阿里云 OSS 控制台
- [ ] 确认文件已上传到 `origin/` 目录
- [ ] 确认缩略图已上传到 `ore/` 目录

#### 4. 检查数据库
- [ ] 访问 Supabase 控制台
- [ ] 查看 `photos` 表
- [ ] 确认新记录已创建

