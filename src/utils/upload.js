// 通用上传工具，支持多种存储方式

import { StorageString, STORAGE_KEYS } from './storage';
import { handleError, ErrorType, safeSync } from './errorHandler';
import { ensureHttps } from './urlUtils';
import { getAuthToken } from './auth';
import { getEnvValue } from './envConfig';

// 上传方式类型
export const UPLOAD_TYPES = {
  BASE64: 'base64',           // 本地 base64（默认）
  API: 'api',                 // 后端 API
  CLOUDINARY: 'cloudinary',    // Cloudinary
  SUPABASE: 'supabase',        // Supabase Storage
  ALIYUN_OSS: 'aliyun_oss',   // 阿里云 OSS
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
export const uploadImage = async (file, filename, onProgress, uploadTypeOverride) => {
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
    };
  };

  let rawResult;
  
  switch (uploadType) {
    case UPLOAD_TYPES.API:
      rawResult = await uploadToAPI(file, filename, onProgress);
      break;
    
    case UPLOAD_TYPES.CLOUDINARY:
      rawResult = await uploadToCloudinary(file, filename, onProgress);
      break;
    
    case UPLOAD_TYPES.SUPABASE:
      rawResult = await uploadToSupabase(file, filename, onProgress);
      break;
    
    case UPLOAD_TYPES.ALIYUN_OSS:
      console.log('[uploadImage] 使用阿里云 OSS 上传');
      rawResult = await uploadToAliyunOSS(file, filename, onProgress);
      break;
    
    case UPLOAD_TYPES.BASE64:
    default:
      console.log('[uploadImage] 使用 Base64 本地存储');
      rawResult = await uploadToBase64(file, onProgress);
      break;
  }

  return normalizeResult(rawResult);
};

// 客户端图片压缩工具，用于生成较小的缩略图文件
export const compressImage = (file, options = {}) => {
  const { maxWidth = 2560, maxHeight = 2560, quality = 0.85 } = options;

  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Canvas 不支持'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = file.type || 'image/jpeg';
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) {
              reject(new Error('图片压缩失败'));
              return;
            }
            const compressedFile = new File([blob], file.name, { type: mimeType });
            resolve(compressedFile);
          },
          mimeType,
          quality
        );
      };

      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };

      img.src = url;
    } catch (error) {
      reject(error);
    }
  });
};

// Base64 上传（本地存储）
const uploadToBase64 = async (file, onProgress) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    // 模拟进度（Base64 转换很快，但为了用户体验还是显示进度）
    if (onProgress) {
      onProgress(10);
      setTimeout(() => onProgress(50), 50);
      setTimeout(() => onProgress(90), 100);
    }
    
    reader.onload = () => {
      if (onProgress) onProgress(100);
      resolve(reader.result?.toString() || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// 后端 API 上传
const uploadToAPI = async (file, filename, onProgress) => {
  const apiUrl = StorageString.get(STORAGE_KEYS.API_UPLOAD_URL, '/api/upload');
  const formData = new FormData();
  formData.append('file', file);
  formData.append('filename', filename);
  // 可选：启用图片优化
  if (StorageString.get(STORAGE_KEYS.API_OPTIMIZE) === 'true') {
    formData.append('optimize', 'true');
  }
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = (e.loaded / e.total) * 100;
        onProgress(percent, e.loaded, e.total);
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (!data.success && !data.url) {
            reject(new Error(data.error || '上传失败'));
            return;
          }
          resolve(data.url || data.imageUrl || data.fileUrl);
        } catch (error) {
          const appError = handleError(error, {
            context: 'uploadToAPI.parse',
            type: ErrorType.PARSE,
          });
          reject(appError);
        }
      } else {
        try {
          const errorData = JSON.parse(xhr.responseText);
          reject(new Error(errorData.error || `上传失败: ${xhr.statusText}`));
        } catch {
          reject(new Error(`上传失败: ${xhr.statusText}`));
        }
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('网络错误'));
    });
    
    xhr.addEventListener('abort', () => {
      reject(new Error('上传已取消'));
    });
    
    xhr.open('POST', apiUrl);
    xhr.send(formData);
  });
};

// Cloudinary 上传
const uploadToCloudinary = async (file, filename, onProgress) => {
  const cloudName = StorageString.get(STORAGE_KEYS.CLOUDINARY_CLOUD_NAME, '');
  const uploadPreset = StorageString.get(STORAGE_KEYS.CLOUDINARY_UPLOAD_PRESET, '');
  
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary 配置不完整');
  }
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', 'pic4pick');
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    let lastUpdateTime = 0;
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const now = Date.now();
        if (now - lastUpdateTime >= 50 || e.loaded === e.total) {
          const percent = (e.loaded / e.total) * 100;
          onProgress(percent, e.loaded, e.total);
          lastUpdateTime = now;
        }
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.secure_url || data.url);
        } catch (error) {
          const appError = handleError(error, {
            context: 'uploadToAPI.parse',
            type: ErrorType.PARSE,
          });
          reject(appError);
        }
      } else {
        reject(new Error(`Cloudinary 上传失败: ${xhr.statusText}`));
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('网络错误'));
    });
    
    xhr.addEventListener('abort', () => {
      reject(new Error('上传已取消'));
    });
    
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
    xhr.send(formData);
  });
};

// Supabase Storage 上传
const uploadToSupabase = async (file, filename, onProgress) => {
  const supabaseUrl = StorageString.get(STORAGE_KEYS.SUPABASE_URL, '');
  const supabaseKey = StorageString.get(STORAGE_KEYS.SUPABASE_ANON_KEY, '');
  const bucket = StorageString.get(STORAGE_KEYS.SUPABASE_BUCKET, 'pic4pick');
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase 配置不完整');
  }
  
  const filePath = `pic4pick/${filename}`;
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    let lastUpdateTime = 0;
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const now = Date.now();
        if (now - lastUpdateTime >= 50 || e.loaded === e.total) {
          const percent = (e.loaded / e.total) * 100;
          onProgress(percent, e.loaded, e.total);
          lastUpdateTime = now;
        }
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          JSON.parse(xhr.responseText);
          resolve(`${supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`);
        } catch {
          resolve(`${supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`);
        }
      } else {
        reject(new Error(`Supabase 上传失败: ${xhr.statusText}`));
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('网络错误'));
    });
    
    xhr.addEventListener('abort', () => {
      reject(new Error('上传已取消'));
    });
    
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${bucket}/${filePath}`);
    xhr.setRequestHeader('Authorization', `Bearer ${supabaseKey}`);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
};

/** 解析 localStorage / 环境变量中的 OSS 上传后端地址（不含 Supabase Edge 回退） */
export const resolveOssBackendApiUrl = (path = '/api/upload/oss') => {
  const applyBase = (baseRaw) => {
    const base = typeof baseRaw === 'string' ? baseRaw.trim() : '';
    if (!base) return null;
    if (base.endsWith(path)) return base;
    return `${base.replace(/\/+$/, '')}${path}`;
  };

  const fromStorage = applyBase(StorageString.get(STORAGE_KEYS.ALIYUN_OSS_BACKEND_URL, ''));
  if (fromStorage) return fromStorage;

  const fromVite = applyBase(getEnvValue('VITE_ALIYUN_OSS_BACKEND_URL', ''));
  if (fromVite) return fromVite;

  return null;
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
    return path;
  }
  
  // 开发环境：默认使用 localhost:3002
  return `http://localhost:3002${path}`;
};

// 阿里云 OSS 上传
const uploadToAliyunOSS = async (file, filename, onProgress) => {
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

  const token = getAuthToken();
  if (!token) {
    throw new Error('未登录：请先登录管理后台再上传');
  }

  const apiUrl = getBackendApiUrl('/api/upload/oss');
  const formData = new FormData();
  formData.append('file', file);
  formData.append('filename', filename);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    let lastUpdateTime = 0;
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const now = Date.now();
        if (now - lastUpdateTime >= 50 || e.loaded === e.total) {
          const percent = (e.loaded / e.total) * 100;
          onProgress(percent, e.loaded, e.total);
          lastUpdateTime = now;
        }
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (!data.success && !data.url) {
            reject(new Error(data.error || '上传失败：服务器未返回 URL'));
            return;
          }
          resolve({
            url: data.url || data.imageUrl || data.fileUrl || '',
            thumbnailUrl: data.thumbnailUrl || data.thumbnail_url || null,
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
        reject(new Error(message));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('网络错误，无法连接到后端'));
    });

    xhr.addEventListener('timeout', () => {
      reject(new Error('上传超时，请检查网络或文件大小'));
    });

    xhr.timeout = 5 * 60 * 1000;
    try {
      xhr.open('POST', apiUrl);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
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
