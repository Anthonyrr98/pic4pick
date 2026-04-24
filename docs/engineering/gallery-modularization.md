/**
 * Gallery.jsx 模块化重构方案
 *
 * 本方案将超过 1500 行的 Gallery.jsx 拆分为多个专业模块
 */

# Gallery 模块化架构

> 原始文档来源：`src/pages/gallery/MODULARIZATION.md`

## 目录结构（建议）

```
src/pages/gallery/
├── index.ts
├── Gallery.jsx
├── utils/
├── constants/
├── hooks/
└── components/
```

## 迁移步骤（建议）

1. 备份原文件
2. 按模块拆分 utils/constants/hooks/components
3. 回归测试：筛选、地图、点赞、响应式

