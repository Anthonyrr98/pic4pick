/**
 * Admin 页面工具函数
 */

import { StorageString, STORAGE_KEYS } from './storage';
import { UPLOAD_TYPES } from './upload';
import { handleError, ErrorType } from './errorHandler';

/**
 * 映射 Supabase 行数据到照片对象
 */
export const mapSupabaseRowToPhoto = (row) => ({
  id: row.id,
  title: row.title || '',
  location: row.location || '',
  country: row.country || '',
  category: row.category || 'featured',
  tags: row.tags || '',
  preview: row.thumbnail_url || row.image_url || '',
  image: row.image_url || '',
  latitude: row.latitude,
  longitude: row.longitude,
  altitude: row.altitude,
  focal: row.focal || '',
  aperture: row.aperture || '',
  shutter: row.shutter || '',
  iso: row.iso || '',
  camera: row.camera || '',
  lens: row.lens || '',
  rating: typeof row.rating === 'number' ? row.rating : null,
  shotDate: row.shot_date || null,
  createdAt: row.created_at,
  status: row.status || 'pending',
  hidden: row.hidden ?? false,
  thumbnail: row.thumbnail_url || null,
  reject_reason: row.reject_reason || null,
});

/**
 * 从照片对象构建 Supabase payload
 */
export const buildSupabasePayloadFromPhoto = (photo, statusOverride) => {
  const payload = {
    id: photo.id,
    title: photo.title || '',
    location: photo.location || '',
    country: photo.country || '',
    category: photo.category || 'featured',
    tags: photo.tags || '',
    image_url: photo.image || photo.preview || '',
    thumbnail_url: photo.thumbnail || photo.preview || '',
    latitude: photo.latitude ?? null,
    longitude: photo.longitude ?? null,
    altitude: photo.altitude ?? null,
    focal: photo.focal || '',
    aperture: photo.aperture || '',
    shutter: photo.shutter || '',
    iso: photo.iso || '',
    camera: photo.camera || '',
    lens: photo.lens || '',
    rating: photo.rating ?? null,
    shot_date: photo.shotDate || null,
    status: statusOverride || photo.status || 'pending',
    hidden: photo.hidden ?? false,
    reject_reason: photo.reject_reason || null,
  };
  return payload;
};

/**
 * 获取上传方式的中文名称
 */
export const getUploadTypeName = (type) => {
  const names = {
    [UPLOAD_TYPES.BASE64]: '本地存储',
    [UPLOAD_TYPES.API]: '后端 API',
    [UPLOAD_TYPES.CLOUDINARY]: 'Cloudinary',
    [UPLOAD_TYPES.SUPABASE]: 'Supabase',
    [UPLOAD_TYPES.ALIYUN_OSS]: '阿里云 OSS',
  };
  return names[type] || '本地存储';
};

/**
 * 获取高德地图 API URL（根据环境选择代理或直接调用）
 */
export const getAmapApiUrl = (path) => {
  const isProduction = import.meta.env.PROD || window.location.hostname !== 'localhost';
  if (isProduction) {
    return `https://restapi.amap.com${path}`;
  }
  return `/amap-api${path}`;
};

/**
 * 从 OSS URL 中提取文件名和路径信息
 */
export const extractOSSFileInfo = (url) => {
  if (!url || typeof url !== 'string') return null;
  
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // 先尝试匹配 pic4pick/ 前缀的路径
    let match = pathname.match(/pic4pick\/(.+)$/);
    if (match) {
      const fullPath = match[1];
      const parts = fullPath.split('/');
      const filename = parts[parts.length - 1];
      const subDir = parts.length > 1 ? parts[0] : null;
      return { filename, subDir, fullPath };
    }
    
    // 如果没有 pic4pick 前缀，直接匹配路径（服务器端上传的格式）
    // 路径格式：/origin/filename.jpg 或 /ore/filename.jpg
    match = pathname.match(/^\/(origin|ore)\/(.+)$/);
    if (match) {
      const subDir = match[1]; // origin 或 ore
      const filename = match[2];
      return { filename, subDir, fullPath: `${subDir}/${filename}` };
    }
    
    // 如果都不匹配，尝试直接取文件名
    const parts = pathname.split('/').filter(p => p);
    if (parts.length > 0) {
      const filename = parts[parts.length - 1];
      const subDir = parts.length > 1 ? parts[parts.length - 2] : null;
      return { filename, subDir, fullPath: subDir ? `${subDir}/${filename}` : filename };
    }
    
    return null;
  } catch (error) {
    handleError(error, {
      context: 'extractOSSFileInfo',
      type: ErrorType.PARSE,
      silent: true,
    });
    return null;
  }
};

/**
 * 删除 OSS 中的文件
 */
export const deleteOSSFile = async (url) => {
  if (!url || typeof url !== 'string') return;
  
  // 检查是否是 OSS URL
  if (!url.includes('.aliyuncs.com')) {
    return; // 不是 OSS URL，跳过
  }
  
  const fileInfo = extractOSSFileInfo(url);
  if (!fileInfo || !fileInfo.filename) {
    return;
  }
  
  try {
    const backendUrl = StorageString.get(STORAGE_KEYS.ALIYUN_OSS_BACKEND_URL, 'http://localhost:3002');
    
    // 尝试删除多个可能的路径
    const pathsToTry = [
      fileInfo.fullPath, // 完整路径
      `origin/${fileInfo.filename}`, // origin 目录
      `ore/${fileInfo.filename}`, // ore 目录
      `pic4pick/${fileInfo.fullPath}`, // 带 pic4pick 前缀
      `pic4pick/origin/${fileInfo.filename}`, // pic4pick/origin
      `pic4pick/ore/${fileInfo.filename}`, // pic4pick/ore
    ];
    
    for (const pathToDelete of pathsToTry) {
      try {
        const response = await fetch(`${backendUrl}/api/upload/oss/${encodeURIComponent(pathToDelete)}`, {
          method: 'DELETE',
        });
        
        if (response.ok) {
          // 删除成功，继续尝试下一个路径（以防有多个副本）
          continue;
        } else if (response.status === 404) {
          // 文件不存在，继续尝试下一个路径
          continue;
        } else {
          const errorText = await response.text();
          handleError(new Error(`OSS文件删除失败: ${response.status} - ${errorText}`), {
            context: 'deleteOSSFile',
            type: ErrorType.NETWORK,
            silent: true,
          });
        }
      } catch (err) {
        // 单个路径删除失败，继续尝试其他路径
        continue;
      }
    }
  } catch (error) {
    handleError(error, {
      context: 'deleteOSSFile',
      type: ErrorType.NETWORK,
      silent: true,
    });
  }
};

