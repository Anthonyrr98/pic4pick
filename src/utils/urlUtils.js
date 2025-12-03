/**
 * URL 工具函数
 */

/**
 * 确保 URL 使用 HTTPS 协议
 * 如果 URL 是 HTTP，则转换为 HTTPS
 * 如果 URL 已经是 HTTPS 或相对路径，则保持不变
 * 
 * @param {string} url - 要转换的 URL
 * @returns {string} - 转换后的 URL
 */
export const ensureHttps = (url) => {
  if (!url || typeof url !== 'string') {
    return url || '';
  }

  // 如果是相对路径或 data URI，直接返回
  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || url.startsWith('data:')) {
    return url;
  }

  // 如果是 HTTP，转换为 HTTPS
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }

  // 如果已经是 HTTPS 或其他协议，保持不变
  return url;
};

/**
 * 批量确保多个 URL 使用 HTTPS
 * 
 * @param {Object} urls - 包含 URL 字段的对象
 * @param {string[]} urlFields - 需要转换的字段名数组
 * @returns {Object} - 转换后的对象
 */
export const ensureHttpsForFields = (urls, urlFields = ['url', 'image', 'imageUrl', 'image_url', 'thumbnail', 'thumbnailUrl', 'thumbnail_url', 'preview']) => {
  if (!urls || typeof urls !== 'object') {
    return urls;
  }

  const result = { ...urls };
  
  for (const field of urlFields) {
    if (result[field]) {
      result[field] = ensureHttps(result[field]);
    }
  }

  return result;
};

