// 通用上传工具，支持多种存储方式

import { StorageString, STORAGE_KEYS } from './storage';
import { handleError, ErrorType, safeSync } from './errorHandler';
import { ensureHttps } from './urlUtils';
import { generateOSSPutSignature } from './ossSignature';

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
  return StorageString.get(STORAGE_KEYS.UPLOAD_TYPE, UPLOAD_TYPES.BASE64);
};

// 设置上传方式
export const setUploadType = (type) => {
  StorageString.set(STORAGE_KEYS.UPLOAD_TYPE, type);
};

// 通用上传函数
export const uploadImage = async (file, filename, onProgress) => {
  const uploadType = getUploadType();
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
        onProgress(percent);
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
          const data = JSON.parse(xhr.responseText);
          resolve(`${supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`);
        } catch (error) {
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

// 获取后端 API URL（根据环境自动选择）
const getBackendApiUrl = (path = '/api/upload/oss') => {
  // 优先使用用户配置的 URL
  const configuredUrl = StorageString.get(STORAGE_KEYS.ALIYUN_OSS_BACKEND_URL, '');
  if (configuredUrl) {
    // 如果配置的是完整 URL，直接使用
    if (configuredUrl.startsWith('http://') || configuredUrl.startsWith('https://')) {
      return configuredUrl.endsWith(path) ? configuredUrl : `${configuredUrl}${path}`;
    }
    // 如果配置的是相对路径，添加路径
    return configuredUrl.endsWith(path) ? configuredUrl : `${configuredUrl}${path}`;
  }
  
  // 检测是否为生产环境
  const isProduction = import.meta.env.PROD || 
    (typeof window !== 'undefined' && 
     window.location.hostname !== 'localhost' && 
     window.location.hostname !== '127.0.0.1');
  
  // 如果配置了 Supabase，尝试使用 Supabase Edge Functions
  if (isProduction) {
    const supabaseUrl = StorageString.get(STORAGE_KEYS.SUPABASE_URL, '') || 
                       (typeof window !== 'undefined' && import.meta.env.VITE_SUPABASE_URL) || '';
    
    if (supabaseUrl && supabaseUrl.includes('supabase.co')) {
      // 从 Supabase URL 构建 Edge Functions URL
      // 格式：https://<project-ref>.supabase.co/functions/v1/upload-oss
      try {
        const url = new URL(supabaseUrl);
        const functionsUrl = `${url.origin}/functions/v1/upload-oss`;
        console.log('[uploadToAliyunOSS] 检测到 Supabase，使用 Edge Functions:', functionsUrl);
        return functionsUrl;
      } catch (e) {
        console.warn('[uploadToAliyunOSS] 无法解析 Supabase URL:', e);
      }
    }
    
    // 生产环境：使用相对路径（假设后端和前端在同一域名下）
    // 或者用户需要在管理面板中配置完整的后端 URL
    return path;
  }
  
  // 开发环境：默认使用 localhost:3002
  return `http://localhost:3002${path}`;
};

// 阿里云 OSS 上传
const uploadToAliyunOSS = async (file, filename, onProgress) => {
  const region = StorageString.get(STORAGE_KEYS.ALIYUN_OSS_REGION, '');
  const bucket = StorageString.get(STORAGE_KEYS.ALIYUN_OSS_BUCKET, '');
  const accessKeyId = StorageString.get(STORAGE_KEYS.ALIYUN_OSS_ACCESS_KEY_ID, '');
  const accessKeySecret = StorageString.get(STORAGE_KEYS.ALIYUN_OSS_ACCESS_KEY_SECRET, '');
  // 默认使用后端代理模式（更安全），除非明确设置为 'false'
  const useBackend = StorageString.get('aliyun_oss_use_backend') !== 'false';
  
  console.log('[uploadToAliyunOSS] 配置检查:', {
    useBackend,
    region,
    bucket,
    hasAccessKeyId: !!accessKeyId,
    hasAccessKeySecret: !!accessKeySecret,
  });
  
  // 如果使用后端代理上传（默认），支持“签名直传”与“后端代理”双模式
  if (useBackend) {
    const useSign = StorageString.get('aliyun_oss_use_sign') !== 'false'; // 默认 true；设置为 'false' 退回代理

    if (!useSign) {
      // 走旧的后端代理模式：POST 文件到后端，再由后端转发到 OSS
    const apiUrl = getBackendApiUrl('/api/upload/oss');
      console.log('[uploadToAliyunOSS] 使用后端代理模式，API:', apiUrl);

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
            reject(new Error(`上传失败: ${xhr.status} ${xhr.statusText || ''}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('网络错误，无法连接到后端代理'));
        });

        xhr.addEventListener('timeout', () => {
          reject(new Error('上传超时，请检查网络或文件大小'));
        });

        xhr.timeout = 5 * 60 * 1000;
        try {
          xhr.open('POST', apiUrl);
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
    }

    // 默认：签名直传模式
    const signApiUrl = getBackendApiUrl('/api/upload/sign');
    console.log('[uploadToAliyunOSS] 使用签名直传模式，签名接口:', signApiUrl);
    
    // 在生产环境中，如果使用相对路径但后端可能不在同一域名，给出提示
    const isProduction = import.meta.env.PROD || 
      (typeof window !== 'undefined' && 
       window.location.hostname !== 'localhost' && 
       window.location.hostname !== '127.0.0.1');
    
    if (isProduction && !signApiUrl.startsWith('http://') && !signApiUrl.startsWith('https://')) {
      const configuredUrl = StorageString.get(STORAGE_KEYS.ALIYUN_OSS_BACKEND_URL, '');
      if (!configuredUrl) {
        const currentDomain = typeof window !== 'undefined' ? window.location.origin : '';
        console.warn(
          `[uploadToAliyunOSS] 警告：生产环境使用相对路径 (${signApiUrl})，但未配置后端 URL。\n` +
          `当前前端域名: ${currentDomain}\n` +
          `如果后端不在同一域名，请在浏览器控制台执行：\n` +
          `localStorage.setItem('aliyun_oss_backend_url', 'https://your-backend-server.com/api/upload/oss');`
        );
      }
    }
    
    // 1) 请求签名
    const signResponse = await fetch(signApiUrl, {
          method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename,
        contentType: file.type || 'application/octet-stream',
      }),
    });
        
    if (!signResponse.ok) {
      const errorText = await signResponse.text().catch(() => '');
      throw new Error(errorText || '获取上传签名失败');
        }
        
    const signData = await signResponse.json();
    if (!signData.success || !signData.uploadUrl) {
      throw new Error(signData.error || '签名接口未返回 uploadUrl');
    }

    // 2) 直传 OSS
    const putResponse = await fetch(signData.uploadUrl, {
      method: 'PUT',
      headers: signData.headers || { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });

    if (!putResponse.ok) {
      const errorText = await putResponse.text().catch(() => '');
      throw new Error(errorText || `上传失败：${putResponse.status} ${putResponse.statusText}`);
    }

    if (onProgress) {
      onProgress(100, file.size, file.size);
            }

    return {
      url: ensureHttps(signData.publicUrl || signData.uploadUrl),
      thumbnailUrl: signData.thumbnailUrl ? ensureHttps(signData.thumbnailUrl) : null,
    };
  }
  
  // 前端直传（需要 AccessKey，不安全，仅用于开发测试）
  // ⚠️ 安全警告：前端直传会将 AccessKey 暴露在浏览器中，生产环境强烈不推荐！
  console.log('[uploadToAliyunOSS] 使用前端直传');
  
  if (!region || !bucket || !accessKeyId || !accessKeySecret) {
    const missing = [];
    if (!region) missing.push('地域（Region）');
    if (!bucket) missing.push('Bucket 名称');
    if (!accessKeyId) missing.push('AccessKey ID');
    if (!accessKeySecret) missing.push('AccessKey Secret');
    throw new Error(`阿里云 OSS 配置不完整，缺少：${missing.join('、')}。请检查配置或使用后端代理上传。`);
  }
  
  // 构建 OSS 上传 URL
  // 处理 region 格式（如果用户输入的是 cn-beijing，需要转换为 oss-cn-beijing）
  let ossRegion = region.trim();
  if (!ossRegion.startsWith('oss-')) {
    ossRegion = `oss-${ossRegion}`;
  }
  
  const endpoint = `https://${bucket}.${ossRegion}.aliyuncs.com`;
  const objectKey = `pic4pick/${filename}`;
  const url = `${endpoint}/${objectKey}`;
  
  try {
    // 生成 OSS 签名
    console.log('[uploadToAliyunOSS] 生成 OSS 签名...');
    const { authorization, date } = await generateOSSPutSignature({
      accessKeyId,
      accessKeySecret,
      bucket,
      objectKey,
      contentType: file.type || 'application/octet-stream',
      acl: 'public-read'
    });
    
    // 使用 XMLHttpRequest 支持进度跟踪
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // 进度跟踪
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 100;
            onProgress(percent, e.loaded, e.total);
          }
        });
      }
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log('[uploadToAliyunOSS] 前端直传成功:', url);
          resolve({
            url: url,
            thumbnailUrl: null, // 前端直传不生成缩略图
          });
        } else {
          const errorText = xhr.responseText || '';
          let errorData;
          try {
            // 尝试解析 XML 错误响应
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(errorText, 'text/xml');
            const code = xmlDoc.querySelector('Code')?.textContent || '';
            const message = xmlDoc.querySelector('Message')?.textContent || '';
            errorData = { code, message: message || xhr.statusText };
          } catch {
            errorData = { message: errorText || xhr.statusText };
          }
          
          const appError = handleError(
            new Error(`OSS 上传失败: ${errorData.message || xhr.statusText} (${xhr.status}${errorData.code ? ` - ${errorData.code}` : ''})`),
            {
              context: 'uploadToAliyunOSS.direct',
              type: ErrorType.NETWORK,
            }
          );
          reject(appError);
        }
      });
      
      xhr.addEventListener('error', () => {
        const appError = handleError(new Error('网络错误，无法连接到 OSS 服务器'), {
          context: 'uploadToAliyunOSS.direct',
          type: ErrorType.NETWORK,
        });
        reject(appError);
      });
      
      xhr.addEventListener('abort', () => {
        reject(new Error('上传已取消'));
      });
      
      // 设置超时（5分钟）
      xhr.timeout = 5 * 60 * 1000;
      xhr.addEventListener('timeout', () => {
        reject(new Error('上传超时，请检查网络连接或文件大小'));
      });
      
      // 打开连接
      xhr.open('PUT', url);
      
      // 设置请求头
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('Date', date);
      xhr.setRequestHeader('Authorization', authorization);
      xhr.setRequestHeader('x-oss-object-acl', 'public-read');
      
      // 发送文件
      xhr.send(file);
    });
  } catch (error) {
    console.error('[uploadToAliyunOSS] 前端直传错误:', error);
    const appError = handleError(error, {
      context: 'uploadToAliyunOSS.direct',
      type: ErrorType.NETWORK,
    });
    throw new Error(`前端直传失败: ${appError.message}。建议使用后端代理上传模式（更安全）。`);
  }
};

