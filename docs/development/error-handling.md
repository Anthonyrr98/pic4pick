# 错误处理约定

运行实现位于 `src/utils/errorHandler.js`，页面异常边界位于 `src/components/ErrorBoundary.jsx`。示例只作为文档，不再放入业务源码目录。

## 保留业务上下文

```js
import { handleError, formatErrorMessage, ErrorType } from '../../src/utils/errorHandler.js';

try {
  await savePhoto(); // 调用方提供的实际业务操作
} catch (error) {
  const appError = handleError(error, { context: 'savePhoto', type: ErrorType.NETWORK });
  showMessage(formatErrorMessage(appError)); // 调用方提供的界面提示
}
```

已知错误类型可显式传入 `type`；只有需要特殊日志级别时再传 `severity`。`context`、`silent`、`onError`、`type`、`severity` 均为可选项。

## 异步及同步边界

```js
import { safeAsync, safeSync } from '../../src/utils/errorHandler.js';

const result = await safeAsync(() => loadPhotos(), {
  context: 'loadPhotos', throwError: true,
});

safeSync(() => localStorage.removeItem('obsolete-key'), {
  context: 'clearObsoleteKey', silent: true,
});
```

`loadPhotos` 是调用方提供的业务函数。需要由上层决定回滚或重试时使用 `throwError: true`；静默失败只适用于允许降级的操作，不应把保存失败显示为成功。`onError` 用于调用方自己的状态恢复，不统一吞掉所有异常。

渲染异常由 App 中实际使用的 ErrorBoundary 处理；请求失败仍由对应操作负责。原 `withErrorHandling`、`isNetworkError`、`isPermissionError` 只被旧示例消费，已移除；不再推荐为同一操作叠加多套包装。
