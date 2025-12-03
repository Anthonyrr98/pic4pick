// 通用上传工具，支持多种存储方式

// 上传方式类型
export const UPLOAD_TYPES = {
  BASE64: 'base64',           // 本地 base64（默认）
  WEBDAV: 'webdav',           // WebDAV
  API: 'api',                 // 后端 API
  CLOUDINARY: 'cloudinary',    // Cloudinary
  SUPABASE: 'supabase',        // Supabase Storage
  ALIYUN_OSS: 'aliyun_oss',   // 阿里云 OSS
};

// 获取当前上传方式
export const getUploadType = () => {
  return localStorage.getItem('upload_type') || UPLOAD_TYPES.BASE64;
};

// 设置上传方式
export const setUploadType = (type) => {
  localStorage.setItem('upload_type', type);
};

// 通用上传函数
export const uploadImage = async (file, filename) => {
  const uploadType = getUploadType();
  const normalizeResult = (result) => {
    if (!result) {
      return { url: '', thumbnailUrl: null };
    }
    if (typeof result === 'string') {
      return { url: result, thumbnailUrl: null };
    }
    // 已经是带 url / thumbnailUrl 的对象
    return {
      url: result.url || result.imageUrl || result.fileUrl || '',
      thumbnailUrl: result.thumbnailUrl ?? result.thumbnail_url ?? null,
    };
  };

  let rawResult;
  
  switch (uploadType) {
    case UPLOAD_TYPES.WEBDAV:
      rawResult = await uploadToWebDAV(file, filename);
      break;
    
    case UPLOAD_TYPES.API:
      rawResult = await uploadToAPI(file, filename);
      break;
    
    case UPLOAD_TYPES.CLOUDINARY:
      rawResult = await uploadToCloudinary(file, filename);
      break;
    
    case UPLOAD_TYPES.SUPABASE:
      rawResult = await uploadToSupabase(file, filename);
      break;
    
    case UPLOAD_TYPES.ALIYUN_OSS:
      console.log('[uploadImage] 使用阿里云 OSS 上传');
      rawResult = await uploadToAliyunOSS(file, filename);
      break;
    
    case UPLOAD_TYPES.BASE64:
    default:
      console.log('[uploadImage] 使用 Base64 本地存储');
      rawResult = await uploadToBase64(file);
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
const uploadToBase64 = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result?.toString() || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// WebDAV 上传
const uploadToWebDAV = async (file, filename) => {
  const { uploadToWebDAV: upload } = await import('./webdav');
  return await upload(file, filename);
};

// 后端 API 上传
const uploadToAPI = async (file, filename) => {
  const apiUrl = localStorage.getItem('api_upload_url') || '/api/upload';
  const formData = new FormData();
  formData.append('file', file);
  formData.append('filename', filename);
  // 可选：启用图片优化
  if (localStorage.getItem('api_optimize') === 'true') {
    formData.append('optimize', 'true');
  }
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `上传失败: ${response.statusText}`);
  }
  
  const data = await response.json();
  if (!data.success && !data.url) {
    throw new Error(data.error || '上传失败');
  }
  
  return data.url || data.imageUrl || data.fileUrl;
};

// Cloudinary 上传
const uploadToCloudinary = async (file, filename) => {
  const cloudName = localStorage.getItem('cloudinary_cloud_name') || '';
  const uploadPreset = localStorage.getItem('cloudinary_upload_preset') || '';
  
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary 配置不完整');
  }
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', 'pic4pick');
  
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error(`Cloudinary 上传失败: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.secure_url || data.url;
};

// Supabase Storage 上传
const uploadToSupabase = async (file, filename) => {
  const supabaseUrl = localStorage.getItem('supabase_url') || '';
  const supabaseKey = localStorage.getItem('supabase_anon_key') || '';
  const bucket = localStorage.getItem('supabase_bucket') || 'pic4pick';
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase 配置不完整');
  }
  
  const filePath = `pic4pick/${filename}`;
  
  // 上传文件
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${filePath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': file.type,
    },
    body: file,
  });
  
  if (!response.ok) {
    throw new Error(`Supabase 上传失败: ${response.statusText}`);
  }
  
  // 获取公共 URL
  const { data } = await response.json();
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`;
};

// 阿里云 OSS 上传
const uploadToAliyunOSS = async (file, filename) => {
  const region = localStorage.getItem('aliyun_oss_region') || '';
  const bucket = localStorage.getItem('aliyun_oss_bucket') || '';
  const accessKeyId = localStorage.getItem('aliyun_oss_access_key_id') || '';
  const accessKeySecret = localStorage.getItem('aliyun_oss_access_key_secret') || '';
  // 默认使用后端代理模式（更安全），除非明确设置为 'false'
  const useBackend = localStorage.getItem('aliyun_oss_use_backend') !== 'false';
  
  console.log('[uploadToAliyunOSS] 配置检查:', {
    useBackend,
    region,
    bucket,
    hasAccessKeyId: !!accessKeyId,
    hasAccessKeySecret: !!accessKeySecret,
  });
  
  // 如果使用后端代理上传（推荐，默认模式）
  if (useBackend) {
    // 默认使用完整 URL，如果前后端在同一端口可通过代理配置覆盖
    const apiUrl = localStorage.getItem('aliyun_oss_backend_url') || 'http://localhost:3002/api/upload/oss';
    console.log('[uploadToAliyunOSS] 使用后端代理，API 地址:', apiUrl);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', filename);
    
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      });
      
      console.log('[uploadToAliyunOSS] 后端响应状态:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[uploadToAliyunOSS] 后端错误响应:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: errorText };
        }
        throw new Error(errorData.error || `上传失败: ${response.statusText} (${response.status})`);
      }
      
      const data = await response.json();
      console.log('[uploadToAliyunOSS] 后端返回数据:', data);
      
      if (!data.success && !data.url) {
        throw new Error(data.error || '上传失败：服务器未返回有效的 URL');
      }
      
      // 返回包含原图和缩略图的对象，供上层统一处理
      return {
        url: data.url || data.imageUrl || data.fileUrl || '',
        thumbnailUrl: data.thumbnailUrl || data.thumbnail_url || null,
      };
    } catch (error) {
      console.error('[uploadToAliyunOSS] 后端代理上传失败:', error);
      throw error;
    }
  }
  
  // 前端直传（需要 AccessKey，不安全，仅用于开发测试）
  // 注意：前端直传到 OSS 需要签名，这里简化处理，实际生产环境应该使用后端代理或 STS
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
  const endpoint = `https://${bucket}.${region}.aliyuncs.com`;
  const objectKey = `pic4pick/${filename}`;
  const url = `${endpoint}/${objectKey}`;
  
  console.log('[uploadToAliyunOSS] 上传到:', url);
  console.warn('[uploadToAliyunOSS] ⚠️ 警告：前端直传需要签名，当前实现可能无法正常工作。建议使用后端代理上传。');
  
  // 注意：前端直传到 OSS 需要签名，这里仅作示例
  // 实际应该从后端获取签名或使用 STS 临时凭证
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
        'x-oss-object-acl': 'public-read',
      },
      body: file,
    });
    
    console.log('[uploadToAliyunOSS] OSS 响应状态:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[uploadToAliyunOSS] OSS 错误响应:', errorText);
      throw new Error(`OSS 上传失败: ${response.statusText} (${response.status}) - ${errorText.substring(0, 200)}`);
    }
    
    console.log('[uploadToAliyunOSS] 上传成功，URL:', url);
    return url;
  } catch (error) {
    console.error('[uploadToAliyunOSS] 前端直传失败:', error);
    throw new Error(`前端直传失败: ${error.message}。建议使用后端代理上传模式。`);
  }
};

