# 阿里云 OSS 配置指南

> 原文件位置：`ALIYUN_OSS_SETUP.md`  
> 本文件为整理后的文档副本，旧文件将保留为跳转页。

本文档说明如何配置阿里云 OSS 来存储照片。

## 前置准备

1. **注册阿里云账号**
   - 访问 [阿里云官网](https://www.aliyun.com/)
   - 完成实名认证

2. **开通 OSS 服务**
   - 进入 [OSS 控制台](https://oss.console.aliyun.com/)
   - 开通对象存储服务

3. **创建 Bucket**
   - 在 OSS 控制台点击"创建 Bucket"
   - 填写 Bucket 名称（全局唯一）
   - 选择地域（如：华东1-杭州）
   - 读写权限选择"公共读"（如果图片需要公开访问）
   - 点击"确定"创建

4. **获取 AccessKey**
   - 进入 [AccessKey 管理](https://usercenter.console.aliyun.com/#/manage/ak)
   - 点击"创建 AccessKey"
   - 保存 AccessKey ID 和 AccessKey Secret（只显示一次）

## 配置方式

### 方式一：后端代理上传（推荐，更安全）

#### 1. 配置后端服务器

在 `server/.env` 文件中添加：

```env
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=your-bucket-name
ALIYUN_OSS_ACCESS_KEY_ID=your_access_key_id
ALIYUN_OSS_ACCESS_KEY_SECRET=your_access_key_secret
```

#### 2. 安装依赖

```bash
cd server
npm install ali-oss
```

#### 3. 启动后端服务器

```bash
npm start
```

#### 4. 配置前端

1. 打开管理面板 (`/admin`)
2. 点击"存储设置"
3. 选择"阿里云 OSS"
4. 勾选"使用后端代理上传（推荐，更安全）"
5. 填写后端 API 地址：`/api/upload/oss`（或完整 URL）

#### 5. 测试上传

上传一张照片，检查是否成功保存到 OSS。

### 方式二：前端直传（仅用于开发测试）

⚠️ **安全警告**：前端直传会将 AccessKey 暴露在浏览器中，生产环境**强烈不推荐**使用！

#### 1. 配置前端

1. 打开管理面板 (`/admin`)
2. 点击"存储设置"
3. 选择"阿里云 OSS"
4. **取消勾选**"使用后端代理上传"
5. 填写以下信息：
   - **地域（Region）**：如 `oss-cn-hangzhou`
   - **Bucket 名称**：你的 Bucket 名称
   - **AccessKey ID**：你的 AccessKey ID
   - **AccessKey Secret**：你的 AccessKey Secret

#### 2. 测试上传

上传一张照片，检查是否成功保存到 OSS。

## 安全建议

- 生产环境优先使用 **后端代理**
- 如果必须前端直传，优先使用 **STS 临时凭证**
- 配置 Bucket 权限与 CORS 规则

