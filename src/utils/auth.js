// 认证工具（从 webdav-proxy 中提取的认证功能）

import { Storage, StorageString, STORAGE_KEYS } from './storage';
import { handleError, formatErrorMessage, ErrorType, safeAsync } from './errorHandler';

// 获取 JWT Token
export const getAuthToken = () => {
  return StorageString.get(STORAGE_KEYS.AUTH_TOKEN, '');
};

// 设置 JWT Token
export const setAuthToken = (token) => {
  StorageString.set(STORAGE_KEYS.AUTH_TOKEN, token);
};

// 清除 JWT Token
export const clearAuthToken = () => {
  Storage.remove(STORAGE_KEYS.AUTH_TOKEN);
};

// 用户登录
export const login = async (username, password) => {
  return safeAsync(async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    const rawBody = await response.text();

    let data = null;
    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch (parseError) {
        throw handleError(parseError, {
          context: 'login.parse',
          type: ErrorType.PARSE,
        });
      }
    }

    if (!data || typeof data !== 'object') {
      throw handleError(new Error('服务器未返回有效数据'), {
        context: 'login.validate',
        type: ErrorType.VALIDATION,
      });
    }

    if (!response.ok || !data.success) {
      throw handleError(new Error(data.error || '登录失败'), {
        context: 'login.response',
        type: ErrorType.PERMISSION,
      });
    }

    setAuthToken(data.token);
    return {
      success: true,
      token: data.token,
      username: data.username,
      expiresIn: data.expiresIn,
    };
  }, {
    context: 'login',
    throwError: true,
  });
};

// 验证 Token
export const verifyToken = async () => {
  const token = getAuthToken();
  if (!token) {
    return { success: false, authenticated: false };
  }

  return safeAsync(async () => {
    const response = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      clearAuthToken();
      return { success: false, authenticated: false };
    }

    return {
      success: true,
      authenticated: true,
      user: data.user,
    };
  }, {
    context: 'verifyToken',
    silent: true, // 验证失败不输出错误日志
    throwError: false,
    onError: () => {
      clearAuthToken();
    },
  }) || { success: false, authenticated: false };
};

// 登出
export const logout = () => {
  clearAuthToken();
};

// 检查是否已认证
export const isAuthenticated = () => {
  return !!getAuthToken();
};

