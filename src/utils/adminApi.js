import { getAuthToken } from './auth';
import { getEnvValue } from './envConfig';

const getApiUrl = (path) => {
  const rawBase = getEnvValue('VITE_API_BASE_URL', '').trim();
  if (!rawBase) return path;

  const base = rawBase.replace(/\/+$/, '').replace(/\/api$/, '');
  return `${base}${path}`;
};

export const requestAdminApi = async (path, options = {}) => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('未登录：请先登录管理后台');
  }

  const response = await fetch(getApiUrl(path), {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const rawBody = await response.text();
  let payload = null;
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = { error: rawBody };
    }
  }

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || payload?.message || `管理端 API 请求失败: ${response.status}`);
  }

  return payload;
};

export const fetchAdminPhotos = async () => {
  const payload = await requestAdminApi('/api/admin/photos');
  return payload.data || [];
};

export const fetchAdminPhoto = async (id, select) => {
  const query = select ? `?select=${encodeURIComponent(select)}` : '';
  const payload = await requestAdminApi(`/api/admin/photos/${encodeURIComponent(id)}${query}`);
  return payload.data || null;
};

export const createAdminPhoto = async (photo) => {
  const payload = await requestAdminApi('/api/admin/photos', {
    method: 'POST',
    body: photo,
  });
  return payload.data;
};

export const upsertAdminPhoto = async (photo) => {
  const payload = await requestAdminApi('/api/admin/photos/upsert', {
    method: 'POST',
    body: photo,
  });
  return payload.data;
};

export const updateAdminPhoto = async (id, patch) => {
  const payload = await requestAdminApi(`/api/admin/photos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
  });
  return payload.data;
};

export const deleteAdminPhoto = async (id) => {
  const payload = await requestAdminApi(`/api/admin/photos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return payload.data;
};

export const fetchAdminSetting = async (id) => {
  const payload = await requestAdminApi(`/api/admin/app-settings/${encodeURIComponent(id)}`);
  return payload.data || null;
};

export const upsertAdminSetting = async (id, data) => {
  const payload = await requestAdminApi(`/api/admin/app-settings/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: { data },
  });
  return payload.data;
};

export const upsertBrandSettings = async (id, patch) => {
  const payload = await requestAdminApi(`/api/admin/brand-settings/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: patch,
  });
  return payload.data;
};

export const deleteBrandSettings = async (id) => {
  const payload = await requestAdminApi(`/api/admin/brand-settings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return payload.data;
};

export const upsertGearPreset = async (type, name) => {
  const payload = await requestAdminApi('/api/admin/gear-presets', {
    method: 'POST',
    body: { type, name },
  });
  return payload.data;
};
