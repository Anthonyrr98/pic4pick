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
const ALIYUN_OSS_HOST_RE = /\.aliyuncs\.com$/i;
const MEDIA_PROXY_PATH = '/api/media/proxy';

/** 从代理 URL 还原为原始 OSS/直链地址（兼容历史 localStorage 中的代理 URL） */
export const getDirectMediaUrl = (url) => {
  const httpsUrl = ensureHttps(url);
  if (!httpsUrl) return '';

  const tryUnwrap = (candidate) => {
    try {
      const base =
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
      const parsed = new URL(candidate, base);
      if (!parsed.pathname.endsWith(MEDIA_PROXY_PATH)) return null;
      const inner = parsed.searchParams.get('url');
      return inner ? ensureHttps(decodeURIComponent(inner)) : null;
    } catch {
      return null;
    }
  };

  if (httpsUrl.startsWith(MEDIA_PROXY_PATH)) {
    const inner = tryUnwrap(httpsUrl);
    if (inner) return inner;
  }

  if (httpsUrl.includes(`${MEDIA_PROXY_PATH}?`)) {
    const inner = tryUnwrap(httpsUrl);
    if (inner) return inner;
  }

  return httpsUrl;
};

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
 * 将阿里云 OSS 直链改为经后端代理（解决浏览器无法直连 OSS 时的 ERR_CONNECTION_CLOSED）
 * 设置 VITE_USE_OSS_MEDIA_PROXY=false 可关闭
 */
export const resolveMediaUrl = (url) => {
  const httpsUrl = getDirectMediaUrl(url);
  if (!httpsUrl) return '';

  if (import.meta.env.VITE_USE_OSS_MEDIA_PROXY !== 'true') {
    return httpsUrl;
  }

  try {
    const parsed = new URL(httpsUrl);
    if (!ALIYUN_OSS_HOST_RE.test(parsed.hostname)) {
      return httpsUrl;
    }
    return `/api/media/proxy?url=${encodeURIComponent(httpsUrl)}`;
  } catch {
    return httpsUrl;
  }
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
