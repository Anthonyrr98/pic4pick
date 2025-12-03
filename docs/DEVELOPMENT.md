# Pic4Pick 开发指南

本文档说明如何搭建开发环境、项目结构、代码规范和开发流程。

## 📋 目录

- [环境要求](#环境要求)
- [项目结构](#项目结构)
- [开发环境搭建](#开发环境搭建)
- [代码规范](#代码规范)
- [开发流程](#开发流程)
- [调试技巧](#调试技巧)
- [常见问题](#常见问题)

## 环境要求

### 必需软件

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Git**

### 推荐工具

- **VS Code** - 代码编辑器
- **VS Code 扩展**：
  - ESLint
  - Prettier
  - React 代码片段

## 项目结构

```
Pic4Pick/
├── src/                      # 前端源代码
│   ├── components/          # React 组件
│   │   ├── admin/          # 管理后台组件
│   │   │   ├── ConfigPanel.jsx
│   │   │   └── ToolsPanel.jsx
│   │   ├── ConfirmDialog.jsx
│   │   ├── ErrorBoundary.jsx
│   │   └── ...
│   ├── pages/              # 页面组件
│   │   ├── Admin.jsx      # 管理后台页面
│   │   └── Gallery.jsx    # 图库展示页面
│   ├── hooks/              # 自定义 Hooks
│   │   ├── useBrandConfig.js
│   │   ├── useFileUpload.js
│   │   ├── usePhotoManagement.js
│   │   └── ...
│   ├── utils/              # 工具函数
│   │   ├── adminUtils.js   # 管理工具
│   │   ├── branding.js     # 品牌配置
│   │   ├── envConfig.js    # 环境配置
│   │   ├── errorHandler.js # 错误处理
│   │   ├── storage.js      # 存储管理
│   │   ├── supabaseClient.js
│   │   └── upload.js       # 上传工具
│   ├── constants/          # 常量定义
│   │   └── storageKeys.js
│   ├── App.jsx             # 应用入口
│   ├── main.jsx            # 入口文件
│   └── index.css           # 全局样式
│
├── server/                  # 后端服务器
│   ├── server-enhanced.js  # 增强版服务器
│   ├── server.js           # 原始服务器
│   ├── package.json
│   ├── .env                # 环境变量
│   └── uploads/            # 上传文件
│
├── public/                  # 静态资源
├── dist/                    # 构建输出
├── docs/                    # 文档
└── package.json            # 项目配置
```

## 开发环境搭建

### 1. 克隆项目

```bash
git clone <repository-url>
cd Pic4Pick
```

### 2. 安装依赖

```bash
# 安装前端依赖
npm install

# 安装后端依赖
cd server
npm install
cd ..
```

### 3. 配置环境变量

创建 `.env.local` 文件（前端）：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_AMAP_KEY=your-amap-key
VITE_ADMIN_PASSWORD=your-password
```

创建 `server/.env` 文件（后端）：

```env
PORT=3001
NODE_ENV=development
JWT_SECRET=your-jwt-secret
```

### 4. 启动开发服务器

```bash
# 终端 1：启动前端（端口 5173）
npm run dev

# 终端 2：启动后端（端口 3001）
cd server
npm run dev
```

### 5. 访问应用

- 前端：http://localhost:5173
- 后端：http://localhost:3001
- 管理后台：http://localhost:5173/#/admin

## 代码规范

### 文件命名

- **组件文件**：PascalCase，如 `ConfigPanel.jsx`
- **工具文件**：camelCase，如 `errorHandler.js`
- **常量文件**：camelCase，如 `storageKeys.js`

### 代码风格

#### React 组件

```jsx
// ✅ 推荐
export const MyComponent = ({ prop1, prop2 }) => {
  const [state, setState] = useState(null);
  
  useEffect(() => {
    // 副作用逻辑
  }, []);
  
  return <div>{/* JSX */}</div>;
};

// ❌ 不推荐
export function MyComponent(props) {
  return <div>{props.text}</div>;
}
```

#### 函数定义

```javascript
// ✅ 推荐：使用箭头函数
const handleClick = () => {
  // 处理逻辑
};

// ✅ 推荐：使用 useCallback 优化
const handleClick = useCallback(() => {
  // 处理逻辑
}, [dependencies]);
```

#### 错误处理

```javascript
// ✅ 推荐：使用统一的错误处理
try {
  await someAsyncOperation();
} catch (error) {
  handleError(error, {
    context: 'functionName',
    type: ErrorType.NETWORK,
  });
}
```

### 注释规范

```javascript
/**
 * 函数功能描述
 * @param {Type} paramName - 参数说明
 * @returns {Type} 返回值说明
 */
export const myFunction = (paramName) => {
  // 实现
};
```

### 导入顺序

1. React 相关
2. 第三方库
3. 组件
4. Hooks
5. 工具函数
6. 常量
7. 类型定义
8. 样式文件

```javascript
// 1. React
import { useState, useEffect } from 'react';

// 2. 第三方库
import maplibregl from 'maplibre-gl';

// 3. 组件
import { ConfigPanel } from '../components/admin/ConfigPanel';

// 4. Hooks
import { usePhotoManagement } from '../hooks/usePhotoManagement';

// 5. 工具函数
import { handleError } from '../utils/errorHandler';

// 6. 常量
import { STORAGE_KEYS } from '../constants/storageKeys';

// 7. 样式
import '../App.css';
```

## 开发流程

### 1. 创建新功能

```bash
# 1. 创建功能分支
git checkout -b feature/new-feature

# 2. 开发功能
# ... 编写代码 ...

# 3. 测试功能
npm run dev

# 4. 提交代码
git add .
git commit -m "feat: 添加新功能"

# 5. 推送分支
git push origin feature/new-feature
```

### 2. 创建新组件

```bash
# 1. 在对应目录创建组件文件
touch src/components/MyComponent.jsx

# 2. 编写组件代码
# ... 

# 3. 导出组件
export const MyComponent = () => { ... };
```

### 3. 创建新 Hook

```bash
# 1. 在 hooks 目录创建文件
touch src/hooks/useMyHook.js

# 2. 编写 Hook 代码
export const useMyHook = () => {
  // Hook 逻辑
  return { ... };
};
```

## 调试技巧

### 1. React DevTools

安装 React DevTools 浏览器扩展，用于调试组件状态和 Props。

### 2. 浏览器控制台

```javascript
// 开发环境可以使用 console.log
console.log('Debug info:', data);

// 生产环境会自动移除 console.log
```

### 3. 网络请求调试

使用浏览器开发者工具的 Network 标签页：
- 查看 API 请求
- 检查请求/响应头
- 查看错误响应

### 4. 状态调试

```javascript
// 使用 React DevTools
// 或添加临时调试代码
useEffect(() => {
  console.log('State changed:', state);
}, [state]);
```

## 常见问题

### Q: 端口被占用？

```bash
# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:5173 | xargs kill -9
```

### Q: 依赖安装失败？

```bash
# 清除缓存
npm cache clean --force

# 删除 node_modules 重新安装
rm -rf node_modules package-lock.json
npm install
```

### Q: 热更新不工作？

```bash
# 重启开发服务器
# 或检查文件是否在正确的目录
```

### Q: 构建失败？

```bash
# 检查错误信息
npm run build

# 清理构建缓存
rm -rf dist
npm run build
```

## 测试

### 运行 Linter

```bash
npm run lint
```

### 类型检查（如果使用 TypeScript）

```bash
npx tsc --noEmit
```

## 性能优化

### 1. 代码分割

已配置在 `vite.config.js` 中：
- React 相关库单独打包
- 地图库单独打包
- 工具库单独打包

### 2. 懒加载

```javascript
// 使用 React.lazy
const LazyComponent = React.lazy(() => import('./LazyComponent'));
```

### 3. 图片优化

- 使用缩略图
- 懒加载图片
- WebP 格式支持

## 提交规范

使用 Conventional Commits：

- `feat:` - 新功能
- `fix:` - 修复 bug
- `docs:` - 文档更新
- `style:` - 代码格式
- `refactor:` - 重构
- `test:` - 测试
- `chore:` - 构建/工具

示例：
```bash
git commit -m "feat: 添加照片批量删除功能"
git commit -m "fix: 修复上传进度显示问题"
```

## 更多资源

- [React 文档](https://react.dev/)
- [Vite 文档](https://vite.dev/)
- [Supabase 文档](https://supabase.com/docs)
- [MapLibre GL 文档](https://maplibre.org/maplibre-gl-js-docs/)

---

**Happy Coding!** 🚀

