/**
 * 错误处理工具使用示例
 * 
 * 这个文件展示了如何使用统一的错误处理工具
 */

import {
  handleError,
  formatErrorMessage,
  safeAsync,
  safeSync,
  withErrorHandling,
  ErrorType,
  ErrorSeverity,
  createError,
  isNetworkError,
  isPermissionError,
} from './errorHandler';

// ===== 示例 1: 使用 handleError 处理错误 =====
async function example1() {
  try {
    const response = await fetch('/api/data');
    const data = await response.json();
    return data;
  } catch (error) {
    // 统一错误处理
    const appError = handleError(error, {
      context: 'example1.fetchData',
      silent: false,
    });
    
    // 显示用户友好的错误消息
    alert(formatErrorMessage(appError));
    throw appError;
  }
}

// ===== 示例 2: 使用 safeAsync 自动处理错误 =====
async function example2() {
  // 自动捕获和处理错误
  const result = await safeAsync(async () => {
    const response = await fetch('/api/data');
    if (!response.ok) {
      throw new Error('请求失败');
    }
    return await response.json();
  }, {
    context: 'example2.fetchData',
    throwError: false, // 不抛出错误，返回 { error } 对象
  });
  
  if (result.error) {
    console.error('操作失败:', formatErrorMessage(result.error));
    return null;
  }
  
  return result;
}

// ===== 示例 3: 使用 safeSync 处理同步函数 =====
function example3() {
  const result = safeSync(() => {
    const data = JSON.parse(localStorage.getItem('data'));
    return data;
  }, {
    context: 'example3.parseData',
    throwError: false,
  });
  
  if (result.error) {
    console.error('解析失败:', formatErrorMessage(result.error));
    return null;
  }
  
  return result;
}

// ===== 示例 4: 使用 withErrorHandling 包装函数 =====
const fetchUserData = withErrorHandling(async (userId) => {
  const response = await fetch(`/api/users/${userId}`);
  if (!response.ok) {
    throw new Error('获取用户数据失败');
  }
  return await response.json();
}, {
  context: 'fetchUserData',
  throwError: true,
});

// 使用包装后的函数
async function example4() {
  try {
    const userData = await fetchUserData(123);
    console.log('用户数据:', userData);
  } catch (error) {
    console.error('错误:', formatErrorMessage(error));
  }
}

// ===== 示例 5: 创建自定义错误 =====
function example5() {
  try {
    // 验证输入
    const input = '';
    if (!input) {
      throw createError('输入不能为空', ErrorType.VALIDATION, ErrorSeverity.MEDIUM);
    }
  } catch (error) {
    const appError = handleError(error, {
      context: 'example5.validateInput',
    });
    console.error(appError.getUserMessage());
  }
}

// ===== 示例 6: 检查错误类型 =====
async function example6() {
  try {
    await fetch('/api/data');
  } catch (error) {
    if (isNetworkError(error)) {
      // 处理网络错误
      console.error('网络连接失败');
    } else if (isPermissionError(error)) {
      // 处理权限错误
      console.error('权限不足');
    } else {
      // 处理其他错误
      handleError(error, { context: 'example6' });
    }
  }
}

// ===== 示例 7: 在 React 组件中使用 =====
/*
import { useState } from 'react';
import { safeAsync, formatErrorMessage } from '../utils/errorHandler';

function MyComponent() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    
    const result = await safeAsync(async () => {
      const response = await fetch('/api/submit', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      });
      
      if (!response.ok) {
        throw new Error('提交失败');
      }
      
      return await response.json();
    }, {
      context: 'MyComponent.handleSubmit',
      throwError: false,
    });
    
    if (result.error) {
      setError(formatErrorMessage(result.error));
    } else {
      console.log('成功:', result);
    }
    
    setLoading(false);
  };
  
  return (
    <div>
      {error && <div className="error">{error}</div>}
      <button onClick={handleSubmit} disabled={loading}>
        {loading ? '提交中...' : '提交'}
      </button>
    </div>
  );
}
*/

export {
  example1,
  example2,
  example3,
  example4,
  example5,
  example6,
};

