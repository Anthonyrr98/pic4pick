// WebDAV 后端代理工具（解决 CORS 问题）

// 获取 JWT Token
const getAuthToken = () => {
  return localStorage.getItem('auth_token') || '';
};

// 设置 JWT Token
const setAuthToken = (token) => {
  localStorage.setItem('auth_token', token);
};

// 清除 JWT Token
const clearAuthToken = () => {
  localStorage.removeItem('auth_token');
};

// 获取 WebDAV 配置
const getConfig = () => {
  return {
    url: localStorage.getItem('webdav_url') || '',
    username: localStorage.getItem('webdav_username') || '',
    password: localStorage.getItem('webdav_password') || '',
  };
};

// 保存 WebDAV 配置
export const saveWebDAVConfig = (url, username, password) => {
  localStorage.setItem('webdav_url', url);
  localStorage.setItem('webdav_username', username);
  localStorage.setItem('webdav_password', password);
};

// 获取 WebDAV 配置
export const getWebDAVConfig = () => {
  return getConfig();
};

// === 认证 API ===

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

// === WebDAV 代理 API ===

// 测试 WebDAV 连接（通过后端代理）
export const testWebDAVConnection = async () => {
  try {
    const config = getConfig();
    const token = getAuthToken();

    if (!config.url || !config.username || !config.password) {
      return {
        success: false,
        message:
          '请先登录并填写完整的 WebDAV 配置信息（服务器地址、用户名、密码）',
      };
    }

    const response = await fetch('/api/webdav/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        url: config.url,
        username: config.username,
        password: config.password,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return { success: false, message: data.error || '连接测试失败' };
    }

    return {
      success: true,
      message: data.message || '连接成功',
      server: data.server,
    };
  } catch (error) {
    console.error('WebDAV test error:', error);
    return {
      success: false,
      message: `连接测试失败: ${error.message}`,
    };
  }
};

// 上传文件到 WebDAV（通过后端代理）
export const uploadToWebDAV = async (file, filename) => {
  try {
    const config = getConfig();
    const token = getAuthToken();

    if (!config.url || !config.username || !config.password) {
      throw new Error('WebDAV 配置不完整，请检查配置');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', filename || file.name);
    formData.append('webdavUrl', config.url);
    formData.append('username', config.username);
    formData.append('password', config.password);
    formData.append('remotePath', 'pic4pick');

    const response = await fetch('/api/webdav/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'WebDAV 上传失败');
    }

    return {
      success: true,
      url: data.url,
      filename: data.filename,
      originalName: data.originalName,
      size: data.size,
      remotePath: data.remotePath,
    };
  } catch (error) {
    console.error('WebDAV upload error:', error);
    throw new Error(`上传失败: ${error.message}`);
  }
};

// 从 WebDAV 删除文件（通过后端代理）
export const deleteFromWebDAV = async (remotePath) => {
  try {
    const config = getConfig();
    const token = getAuthToken();

    if (!config.url || !config.username || !config.password) {
      throw new Error('WebDAV 配置不完整');
    }

    const response = await fetch('/api/webdav/delete', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        webdavUrl: config.url,
        username: config.username,
        password: config.password,
        remotePath: remotePath,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || '删除失败');
    }

    return {
      success: true,
      message: data.message,
      remotePath: data.remotePath,
    };
  } catch (error) {
    console.error('WebDAV delete error:', error);
    throw new Error(`删除失败: ${error.message}`);
  }
};

// 检查是否已认证
export const isAuthenticated = () => {
  return !!getAuthToken();
};

// 获取存储使用统计（通过后端代理）
export const getStorageStats = async () => {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/storage/stats', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('获取存储统计失败');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Storage stats error:', error);
    return null;
  }
};

// 列出 WebDAV 目录内容（通过后端代理）
export const listWebDAVDirectory = async (path = '/pic4pick') => {
  try {
    const config = getConfig();
    const token = getAuthToken();

    const response = await fetch('/api/webdav/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        webdavUrl: config.url,
        username: config.username,
        password: config.password,
        path: path,
      }),
    });

    if (!response.ok) {
      throw new Error('获取目录内容失败');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('WebDAV list error:', error);
    throw new Error(`获取目录内容失败: ${error.message}`);
  }
};