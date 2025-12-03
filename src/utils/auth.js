// 认证工具（从 webdav-proxy 中提取的认证功能）

import { Storage, StorageString, STORAGE_KEYS } from './storage';

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

// 清除 JWT Token
export const clearAuthToken = () => {
  Storage.remove(STORAGE_KEYS.AUTH_TOKEN);
};

// 用户登录
export const login = async (username, password) => {
  try {
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
        console.error('Login response parse error:', parseError);
        throw new Error('服务器返回了无法解析的内容');
      }
    }

    if (!data || typeof data !== 'object') {
      throw new Error('服务器未返回有效数据');
    }

    if (!response.ok || !data.success) {
      throw new Error(data.error || '登录失败');
    }

    setAuthToken(data.token);
    return {
      success: true,
      token: data.token,
      username: data.username,
      expiresIn: data.expiresIn,
    };
  } catch (error) {
    console.error('Login error:', error);
    throw new Error(`登录失败: ${error.message}`);
  }
};

// 验证 Token
export const verifyToken = async () => {
  const token = getAuthToken();
  if (!token) {
    return { success: false, authenticated: false };
  }

  try {
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
  } catch (error) {
    console.error('Token verification error:', error);
    clearAuthToken();
    return { success: false, authenticated: false };
  }
};

// 登出
export const logout = () => {
  clearAuthToken();
};

// 检查是否已认证
export const isAuthenticated = () => {
  return !!getAuthToken();
};

