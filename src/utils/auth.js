import { Storage, StorageString, STORAGE_KEYS } from './storage';
import { safeAsync } from './errorHandler';
import { getEnvValue } from './envConfig';

const STATIC_AUTH_TOKEN_PREFIX = 'pic4pick-static-admin:';
const LEGACY_ADMIN_AUTHED_KEY = 'admin_authed';

const isStaticAuthToken = (token) => {
  return typeof token === 'string' && token.startsWith(STATIC_AUTH_TOKEN_PREFIX);
};

const getApiUrl = (path) => {
  const rawBase = getEnvValue('VITE_API_BASE_URL', '').trim();
  if (!rawBase) return path;

  const base = rawBase.replace(/\/+$/, '').replace(/\/api$/, '');
  return `${base}${path}`;
};

const createAuthApiUnavailableError = (message) => {
  const error = new Error(message);
  error.authApiUnavailable = true;
  return error;
};

const parseAuthResponse = async (response) => {
  const rawBody = await response.text();

  if ([404, 405, 501, 502, 503, 504].includes(response.status)) {
    throw createAuthApiUnavailableError('后台登录接口不可用');
  }

  let data = null;
  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch {
      throw createAuthApiUnavailableError('后台登录接口返回了非 JSON 响应');
    }
  }

  if (!data || typeof data !== 'object') {
    throw new Error('服务器未返回有效数据');
  }

  return data;
};

const loginWithApi = async (username, password) => {
  const response = await fetch(getApiUrl('/api/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  const data = await parseAuthResponse(response);

  if (!response.ok || !data.success) {
    throw new Error(data.error || '登录失败');
  }

  setAuthToken(data.token);
  return {
    success: true,
    token: data.token,
    username: data.username,
    expiresIn: data.expiresIn,
    mode: 'api',
  };
};

export const getAuthToken = () => {
  return StorageString.get(STORAGE_KEYS.AUTH_TOKEN, '');
};

export const setAuthToken = (token) => {
  StorageString.set(STORAGE_KEYS.AUTH_TOKEN, token);
};

export const clearAuthToken = () => {
  Storage.remove(STORAGE_KEYS.AUTH_TOKEN);
  Storage.remove(LEGACY_ADMIN_AUTHED_KEY);
};

export const login = async (username, password) => {
  return safeAsync(async () => {
    return await loginWithApi(username.trim(), password);
  }, {
    context: 'login',
    throwError: true,
  });
};

export const verifyToken = async () => {
  const token = getAuthToken();
  if (!token) {
    return { success: false, authenticated: false };
  }

  if (isStaticAuthToken(token)) {
    clearAuthToken();
    return { success: false, authenticated: false };
  }

  return safeAsync(async () => {
    const response = await fetch(getApiUrl('/api/auth/verify'), {
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
    silent: true,
    throwError: false,
    onError: () => {
      clearAuthToken();
    },
  }) || { success: false, authenticated: false };
};

export const logout = () => {
  clearAuthToken();
};

export const isAuthenticated = () => {
  return !!getAuthToken();
};
