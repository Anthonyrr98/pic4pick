# 前端直传到阿里云 OSS（无需后端）

> 原文件位置：`FRONTEND_DIRECT_UPLOAD.md`  
> 注意：仓库里还有一份“直传使用指南”（`frontend-direct-upload-guide.md`），两份文档结论存在历史演进痕迹，请以代码实际行为为准。

## 当前状态

代码中**已经支持前端直传**，但默认使用后端代理模式（更安全）。

## 为什么默认使用后端？

1. **安全性**：前端直传需要暴露 AccessKey，存在安全风险
2. **功能完整**：后端可以处理图片优化、缩略图生成等
3. **错误处理**：后端可以更好地处理错误和日志

## 如何启用前端直传？

### 方式 1：通过浏览器控制台

在浏览器控制台执行：

```javascript
// 启用前端直传
localStorage.setItem('aliyun_oss_use_backend', 'false');

// 刷新页面
location.reload();
```

## 前端直传的要求

### 必需配置

前端直传需要以下配置（在管理面板 → 配置中设置）：

1. **阿里云 OSS 地域**：`oss-cn-hangzhou` 等
2. **Bucket 名称**：您的 OSS Bucket 名称
3. **AccessKey ID**：您的阿里云 AccessKey ID
4. **AccessKey Secret**：您的阿里云 AccessKey Secret

⚠️ **安全警告**：
- AccessKey 会暴露在前端代码中
- 任何人都可以在浏览器中查看
- 建议使用 STS 临时凭证（更安全）

## 推荐方案

- **推荐继续使用后端代理模式**：更安全、功能更完整
- 如果确实需要前端直传：建议 STS 临时凭证 / PostObject 等方案

