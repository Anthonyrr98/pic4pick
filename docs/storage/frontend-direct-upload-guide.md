# 前端直传到阿里云 OSS 使用指南

> 原文件位置：`FRONTEND_DIRECT_UPLOAD_GUIDE.md`

（为避免重复，这里保留原始文档要点。若你希望我把全文完整搬运到此处，也可以继续补齐。）

## 关键结论

- 直传功能在文档中被描述为“已实现”，但仓库内另一份文档存在相反表述；建议以 `src/utils/ossSignature.js` 与 `src/utils/upload.js` 的实现为准。
- 生产环境仍建议使用后端代理或 STS 临时凭证，避免 AccessKey 暴露。

## 启用方式

```javascript
localStorage.setItem('aliyun_oss_use_backend', 'false');
location.reload();
```

