# 阿里云 OSS 配置指南

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

## 地域代码参考

| 地域 | Region 代码 |
|------|------------|
| 华东1（杭州） | oss-cn-hangzhou |
| 华东2（上海） | oss-cn-shanghai |
| 华北1（青岛） | oss-cn-qingdao |
| 华北2（北京） | oss-cn-beijing |
| 华北3（张家口） | oss-cn-zhangjiakou |
| 华北5（呼和浩特） | oss-cn-huhehaote |
| 华南1（深圳） | oss-cn-shenzhen |
| 华南2（河源） | oss-cn-heyuan |
| 西南1（成都） | oss-cn-chengdu |
| 中国（香港） | oss-cn-hongkong |
| 美国西部1（硅谷） | oss-us-west-1 |
| 美国东部1（弗吉尼亚） | oss-us-east-1 |
| 亚太东南1（新加坡） | oss-ap-southeast-1 |
| 亚太东南2（悉尼） | oss-ap-southeast-2 |
| 亚太东南3（吉隆坡） | oss-ap-southeast-3 |
| 亚太东南5（雅加达） | oss-ap-southeast-5 |
| 亚太东北1（东京） | oss-ap-northeast-1 |
| 亚太南部1（孟买） | oss-ap-south-1 |
| 欧洲中部1（法兰克福） | oss-eu-central-1 |
| 英国（伦敦） | oss-eu-west-1 |
| 中东东部1（迪拜） | oss-me-east-1 |

## 安全建议

### 1. 使用后端代理（推荐）

- AccessKey 存储在服务器端，不会暴露
- 可以添加身份验证
- 支持图片自动优化
- 可以记录上传日志

### 2. 使用 STS 临时凭证（高级）

如果需要前端直传但又要保证安全，可以使用 STS（Security Token Service）临时凭证：

1. 后端提供接口生成 STS 临时凭证
2. 前端使用临时凭证上传
3. 临时凭证有过期时间，更安全

### 3. 设置 Bucket 权限

- **公共读**：图片可以公开访问（适合图片展示）
- **私有**：需要签名 URL 访问（更安全，但需要后端生成签名）

### 4. 配置 CORS

如果使用前端直传，需要在 OSS 控制台配置 CORS：

1. 进入 Bucket 设置
2. 点击"跨域设置"
3. 添加规则：
   - 来源：你的前端域名（如：`https://yourdomain.com`）
   - 允许 Methods：`PUT`, `POST`, `GET`
   - 允许 Headers：`*`
   - 暴露 Headers：`ETag`, `x-oss-request-id`
   - 缓存时间：`3600`

## 成本估算

阿里云 OSS 按使用量计费：

- **存储费用**：约 ¥0.12/GB/月
- **流量费用**：
  - 内网流量：免费
  - 外网下行流量：约 ¥0.5/GB（前 10GB 免费）
- **请求费用**：
  - PUT 请求：¥0.01/万次
  - GET 请求：¥0.01/万次

**示例**：
- 存储 1000 张照片（每张 2MB）：约 2GB
- 存储费用：约 ¥0.24/月
- 每月访问 10,000 次：约 ¥0.01
- **总计：约 ¥0.25/月**

## 常见问题

### 1. 上传失败：CORS 错误

**解决方案**：
- 检查 OSS Bucket 的 CORS 配置
- 确保允许你的前端域名

### 2. 上传失败：403 Forbidden

**解决方案**：
- 检查 AccessKey 是否正确
- 检查 Bucket 权限设置
- 检查 Bucket 名称是否正确

### 3. 图片无法访问

**解决方案**：
- 检查 Bucket 读写权限（需要"公共读"）
- 检查图片 URL 是否正确
- 检查 OSS 服务是否正常

### 4. 前端直传需要签名

**解决方案**：
- 使用后端代理上传（推荐）
- 或使用 STS 临时凭证
- 或后端提供签名接口

## 最佳实践

1. **生产环境使用后端代理**
   - 保护 AccessKey 安全
   - 支持图片优化
   - 可以添加水印

2. **配置 CDN 加速**
   - 在 OSS 控制台开启 CDN
   - 提升图片访问速度
   - 降低流量费用

3. **设置生命周期规则**
   - 自动删除过期文件
   - 自动转换存储类型
   - 节省存储成本

4. **监控和告警**
   - 设置存储空间告警
   - 设置流量告警
   - 定期检查费用

## 相关链接

- [阿里云 OSS 文档](https://help.aliyun.com/product/31815.html)
- [OSS JavaScript SDK](https://help.aliyun.com/document_detail/32068.html)
- [STS 临时访问凭证](https://help.aliyun.com/document_detail/100624.html)

