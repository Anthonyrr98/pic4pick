// 管理员受保护的 OSS 上传，保留原图、稳定提交 ID 和实际进度。

import { StorageString, STORAGE_KEYS } from './storage';
import { handleError, ErrorType, safeSync } from './errorHandler';
import { ensureHttps } from './urlUtils';
import { getAuthToken } from './auth';
import { getEnvValue } from './envConfig';
import { watchOssUploadProgress } from './ossUploadProgress';

// 上传方式类型
export const UPLOAD_TYPES = {
  ALIYUN_OSS: 'aliyun_oss',   // 阿里云 OSS
};

const BYTE_TRANSFER_PROGRESS_MAX = 92;
const SERVER_CONFIRM_PROGRESS = 94;
const RESPONSE_PROCESS_PROGRESS = 98;

const clampProgress = (progress) => {
  const numericProgress = Number(progress);
  if (!Number.isFinite(numericProgress)) return 0;
  return Math.min(100, Math.max(0, numericProgress));
};

const reportUploadProgress = (onProgress, progress, uploaded, total, status = {}) => {
  if (!onProgress) return;
  onProgress(clampProgress(progress), uploaded, total, status);
};

const createXhrProgressReporter = (file, onProgress) => {
  let uploadedBytes = 0;
  let totalBytes = file?.size || 0;
  let lastUpdateTime = 0;

  const getDoneBytes = () => totalBytes || uploadedBytes || file?.size || 0;

  const report = (progress, status, uploaded = uploadedBytes, total = totalBytes) => {
    reportUploadProgress(onProgress, progress, uploaded, total, status);
  };

  return {
    markPreparing() {
      report(2, { stage: 'preparing', label: '准备上传...' }, 0, totalBytes);
    },
    handleTransferProgress(e) {
      if (!e.lengthComputable) return;

      uploadedBytes = e.loaded;
      totalBytes = e.total;

      const now = Date.now();
      const isDone = e.loaded >= e.total;
      if (now - lastUpdateTime < 50 && !isDone) return;

      const transferRatio = e.total > 0 ? e.loaded / e.total : 0;
      const progress = Math.min(BYTE_TRANSFER_PROGRESS_MAX, transferRatio * BYTE_TRANSFER_PROGRESS_MAX);
      report(
        isDone ? BYTE_TRANSFER_PROGRESS_MAX : progress,
        isDone
          ? { stage: 'confirming', label: '文件已传完，等待服务器确认...' }
          : { stage: 'transferring', label: '上传文件中...' },
        e.loaded,
        e.total
      );
      lastUpdateTime = now;
    },
    markWaitingForServer() {
      const doneBytes = getDoneBytes();
      uploadedBytes = doneBytes;
      totalBytes = doneBytes;
      report(
        SERVER_CONFIRM_PROGRESS,
        { stage: 'confirming', label: '文件已传完，等待服务器确认...' },
        doneBytes,
        doneBytes
      );
    },
    markResponseReceived() {
      const doneBytes = getDoneBytes();
      report(
        RESPONSE_PROCESS_PROGRESS,
        { stage: 'finalizing', label: '服务器已响应，正在完成...' },
        doneBytes,
        doneBytes
      );
    },
    markComplete() {
      const doneBytes = getDoneBytes();
      report(100, { stage: 'complete', label: '上传完成' }, doneBytes, doneBytes);
    },
  };
};

// 获取当前上传方式
export const getUploadType = () => {
  return StorageString.get(STORAGE_KEYS.UPLOAD_TYPE, UPLOAD_TYPES.ALIYUN_OSS);
};

// 设置上传方式
export const setUploadType = (type) => {
  StorageString.set(STORAGE_KEYS.UPLOAD_TYPE, type);
};

// 通用上传函数
export const uploadImage = async (file, filename, onProgress, uploadTypeOverride, options = {}) => {
  const uploadType = uploadTypeOverride || getUploadType();
  const normalizeResult = (result) => {
    if (!result) {
      return { url: '', thumbnailUrl: null };
    }
    if (typeof result === 'string') {
      return { url: ensureHttps(result), thumbnailUrl: null };
    }
    // 已经是带 url / thumbnailUrl 的对象
    return {
      url: ensureHttps(result.url || result.imageUrl || result.fileUrl || ''),
      thumbnailUrl: result.thumbnailUrl ?? result.thumbnail_url ? ensureHttps(result.thumbnailUrl ?? result.thumbnail_url) : null,
      uploadId: result.uploadId || null,
    };
  };

  if (uploadType !== UPLOAD_TYPES.ALIYUN_OSS) {
    throw new Error('当前仅支持阿里云 OSS 上传，请在管理后台重新提交。');
  }
  const rawResult = await uploadToAliyunOSS(file, filename, onProgress, options);

  return normalizeResult(rawResult);
};











/** 解析 localStorage / 环境变量中的 OSS 上传后端地址（不含 Supabase Edge 回退） */
export const resolveOssBackendApiUrl = (path = '/api/upload/oss') => {
  const applyBase = (baseRaw) => {
    const base = typeof baseRaw === 'string' ? baseRaw.trim() : '';
    if (!base) return null;
    let normalizedBase = base.replace(/\/+$/, '');
    if (normalizedBase.includes('/functions/v1/upload-oss')) return normalizedBase;
    if (normalizedBase.endsWith(path)) return normalizedBase;
    if (normalizedBase.endsWith('/api') && path.startsWith('/api/')) {
      normalizedBase = normalizedBase.slice(0, -4);
    }
    return `${normalizedBase}${path}`;
  };

  const fromVite = applyBase(getEnvValue('VITE_ALIYUN_OSS_BACKEND_URL', ''));
  if (fromVite) return fromVite;

  const fromApiBase = applyBase(getEnvValue('VITE_API_BASE_URL', ''));
  if (fromApiBase) return fromApiBase;

  // Older deployments stored a separate URL that the current settings panel
  // cannot edit. Use it only when no current backend configuration exists.
  return applyBase(StorageString.get(STORAGE_KEYS.ALIYUN_OSS_BACKEND_URL, ''));
};

// 获取后端 API URL（根据环境自动选择）
const getBackendApiUrl = (path = '/api/upload/oss') => {
  const explicit = resolveOssBackendApiUrl(path);
  if (explicit) return explicit;

  const isProduction = import.meta.env.PROD || 
    (typeof window !== 'undefined' && 
     window.location.hostname !== 'localhost' && 
     window.location.hostname !== '127.0.0.1');

  if (isProduction) {
    return null;
  }

  // 开发环境：默认使用 localhost:3002
  return `http://localhost:3002${path}`;
};

const isSupabaseEdgeUploadUrl = (apiUrl) => {
  try {
    const parsed = new URL(apiUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return parsed.pathname.includes('/functions/v1/upload-oss');
  } catch {
    return false;
  }
};

// 阿里云 OSS 上传
const uploadToAliyunOSS = async (file, filename, onProgress, options) => {
  // 安全策略：OSS 上传只允许走后端（浏览器永远不持有 AccessKey）
  // 同时清理历史遗留的前端 OSS 长期密钥（如果用户曾经配置过）。
  safeSync(() => {
    StorageString.remove('aliyun_oss_access_key_id');
    StorageString.remove('aliyun_oss_access_key_secret');
    StorageString.remove('aliyun_oss_region');
    StorageString.remove('aliyun_oss_bucket');
    StorageString.remove('aliyun_oss_use_sign');
    StorageString.remove('aliyun_oss_use_backend');
  }, { context: 'uploadToAliyunOSS.clearLegacySecrets', silent: true });

  const apiUrl = getBackendApiUrl('/api/upload/oss');
  if (!apiUrl) {
    throw new Error('生产环境未配置受保护的 OSS 上传后端。请配置 VITE_API_BASE_URL 或 VITE_ALIYUN_OSS_BACKEND_URL 指向 server-enhanced.js 的 /api/upload/oss。');
  }
  if (isSupabaseEdgeUploadUrl(apiUrl)) {
    throw new Error('Supabase Edge OSS 签名直传已禁用。请改用带管理员 JWT 校验的后端 /api/upload/oss。');
  }

  const token = getAuthToken();
  if (!token) {
    throw new Error('未登录：请先登录管理后台再上传');
  }
  if (token.startsWith('pic4pick-static-admin:')) {
    throw new Error('当前是本地静态登录，后端上传接口无法验证该登录状态。请先配置后端 API Base URL 或同源 /api 反向代理，然后退出并重新登录。');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('filename', filename);

  if (options.uploadId) formData.append('uploadId', options.uploadId);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const progressReporter = createXhrProgressReporter(file, onProgress);
    let stopProgress = () => {};

    xhr.upload.addEventListener('progress', progressReporter.handleTransferProgress);
    xhr.upload.addEventListener('load', () => {
      progressReporter.markWaitingForServer();
      if (options.uploadId) {
        stopProgress();
        stopProgress = watchOssUploadProgress({ apiUrl, uploadId: options.uploadId, token, file, onProgress });
      }
    });
    xhr.addEventListener('loadend', () => stopProgress());

    xhr.addEventListener('load', () => {
      stopProgress();
      progressReporter.markResponseReceived();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (!data.success && !data.url) {
            reject(new Error(data.error || '上传失败：服务器未返回 URL'));
            return;
          }
          progressReporter.markComplete();
          resolve({
            url: data.url || data.imageUrl || data.fileUrl || '',
            thumbnailUrl: data.thumbnailUrl || data.thumbnail_url || null,
            uploadId: data.uploadId || null,
          });
        } catch (error) {
          reject(
            handleError(error, {
              context: 'uploadToAliyunOSS.proxy.parse',
              type: ErrorType.PARSE,
            })
          );
        }
      } else {
        let message = `上传失败: ${xhr.status} ${xhr.statusText || ''}`;
        try {
          const errorData = JSON.parse(xhr.responseText);
          message = errorData.error || errorData.message || message;
        } catch {
          const errorText = xhr.responseText?.trim();
          if (errorText) message = errorText;
        }
        if (xhr.status === 404) {
          message = `上传服务返回 404，请检查上传后端地址：${apiUrl}`;
        }
        reject(Object.assign(new Error(message), { status: xhr.status, requestUrl: apiUrl }));
      }
    });

    xhr.addEventListener('error', () => {
      const target = (() => {
        try {
          return new URL(apiUrl, window.location.origin).toString();
        } catch {
          return apiUrl;
        }
      })();
      reject(new Error(`网络错误，无法连接到后端（请求地址：${target}）。请确认后端已部署并可访问；如果前后端分域，请在配置中填写后端 API Base URL 或 OSS 上传后端 URL；如果使用同源 /api，请检查反向代理配置。`));
    });

    xhr.addEventListener('timeout', () => {
      reject(new Error('上传超时，请检查网络或文件大小'));
    });

    xhr.timeout = 5 * 60 * 1000;
    try {
      xhr.open('POST', apiUrl);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      progressReporter.markPreparing();
      xhr.send(formData);
    } catch (error) {
      reject(
        handleError(error, {
          context: 'uploadToAliyunOSS.proxy.send',
          type: ErrorType.NETWORK,
        })
      );
    }
  });
};
