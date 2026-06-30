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
const OSS_PREVIEW_IMAGE_EXT_RE = /\.(jpe?g|png|webp)$/i;

const parseMediaUrl = (url) => {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    return new URL(url, base);
  } catch {
    return null;
  }
};

const hasOssImageTransform = (url) => {
  const parsed = parseMediaUrl(getDirectMediaUrl(url));
  return Boolean(parsed?.searchParams.get('x-oss-process')?.startsWith('image/'));
};

const isLikelyOriginalOssImageUrl = (candidate, original) => {
  const parsedCandidate = parseMediaUrl(candidate);
  if (!parsedCandidate || !ALIYUN_OSS_HOST_RE.test(parsedCandidate.hostname)) return false;
  if (!OSS_PREVIEW_IMAGE_EXT_RE.test(parsedCandidate.pathname)) return false;
  if (hasOssImageTransform(candidate)) return false;

  const parsedOriginal = parseMediaUrl(original);
  if (
    parsedOriginal &&
    parsedCandidate.origin === parsedOriginal.origin &&
    parsedCandidate.pathname === parsedOriginal.pathname
  ) {
    return true;
  }

  return /\/(?:ore|origin)\//i.test(parsedCandidate.pathname);
};

const shouldPreferOriginalPreview = (url) => {
  const parsed = parseMediaUrl(url);
  if (!parsed || !ALIYUN_OSS_HOST_RE.test(parsed.hostname)) return false;
  if (!OSS_PREVIEW_IMAGE_EXT_RE.test(parsed.pathname)) return false;

  return /^\/origin\/\d{4}\/\d{2}\/\d{2}\//i.test(parsed.pathname);
};

const normalizeSrcSetWidths = (widths) => (
  [...new Set(
    (Array.isArray(widths) ? widths : [])
      .map((width) => Number(width))
      .filter((width) => Number.isFinite(width) && width >= 120)
      .map((width) => Math.round(width))
  )].sort((a, b) => a - b)
);

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
 * 默认直接使用阿里云 OSS 直链；设置 VITE_USE_OSS_MEDIA_PROXY=true 时才走后端代理。
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
 * Build a lightweight OSS image-processing URL when no stored thumbnail is available.
 */
export const buildOssImagePreviewUrl = (url, options = {}) => {
  const directUrl = getDirectMediaUrl(url);
  if (!directUrl) return '';

  const width = Number.isFinite(options.width) ? Math.max(120, Math.round(options.width)) : 1200;
  const quality = Number.isFinite(options.quality)
    ? Math.max(40, Math.min(95, Math.round(options.quality)))
    : 82;
  const requestedFormat =
    typeof options.format === 'string' ? options.format.trim().toLowerCase() : options.format;
  const format =
    requestedFormat === false || requestedFormat === ''
      ? ''
      : /^[a-z0-9]+$/.test(requestedFormat || '')
        ? requestedFormat
        : 'webp';

  try {
    const parsed = new URL(directUrl);
    if (!ALIYUN_OSS_HOST_RE.test(parsed.hostname)) return directUrl;
    if (!OSS_PREVIEW_IMAGE_EXT_RE.test(parsed.pathname)) return directUrl;

    parsed.searchParams.set(
      'x-oss-process',
      `image/resize,w_${width},m_lfit/quality,q_${quality}${format ? `/format,${format}` : ''}`
    );
    return parsed.toString();
  } catch {
    return directUrl;
  }
};

export const getPreviewMediaUrl = (media, options = {}) => {
  const source = typeof media === 'string' ? { image: media } : media || {};
  const originalDirectUrl = getDirectMediaUrl(source.image || source.image_url || source.url || '');
  const thumbnailDirectUrl = getDirectMediaUrl(source.thumbnail || source.thumbnail_url || '');
  const previewDirectUrl = getDirectMediaUrl(source.preview || source.preview_url || '');
  const storedPreviewUrl = [thumbnailDirectUrl, previewDirectUrl]
    .map((candidate) => {
      if (!candidate || candidate === originalDirectUrl) return '';
      if (isLikelyOriginalOssImageUrl(candidate, originalDirectUrl)) {
        if (shouldPreferOriginalPreview(originalDirectUrl)) return '';
        const previewUrl = buildOssImagePreviewUrl(candidate, options);
        return previewUrl && previewUrl !== candidate ? previewUrl : '';
      }
      return candidate;
    })
    .find(Boolean);
  const generatedPreviewUrl = buildOssImagePreviewUrl(originalDirectUrl, options);
  const previewUrl =
    storedPreviewUrl ||
    (generatedPreviewUrl && generatedPreviewUrl !== originalDirectUrl ? generatedPreviewUrl : '') ||
    originalDirectUrl ||
    thumbnailDirectUrl ||
    previewDirectUrl;

  return previewUrl ? resolveMediaUrl(previewUrl) : '';
};

export const getPreviewMediaSrcSet = (media, widths = [], options = {}) => {
  const candidates = normalizeSrcSetWidths(widths)
    .map((width) => ({
      width,
      url: getPreviewMediaUrl(media, { ...options, width }),
    }))
    .filter(({ url }) => Boolean(url));

  if (new Set(candidates.map(({ url }) => url)).size <= 1) {
    return '';
  }

  return candidates
    .map(({ url, width }) => `${url} ${width}w`)
    .join(', ');
};

export const getPreviewMediaFallbackUrls = (media, fallbackOptions = []) => {
  const source = typeof media === 'string' ? { image: media } : media || {};
  const originalDirectUrl = getDirectMediaUrl(source.image || source.image_url || source.url || '');
  const thumbnailDirectUrl = getDirectMediaUrl(source.thumbnail || source.thumbnail_url || '');
  const previewDirectUrl = getDirectMediaUrl(source.preview || source.preview_url || '');
  const sourceUrls = [...new Set([thumbnailDirectUrl, previewDirectUrl, originalDirectUrl].filter(Boolean))];
  if (!sourceUrls.length) return [];

  const urls = (Array.isArray(fallbackOptions) ? fallbackOptions : [])
    .flatMap((options) => sourceUrls.map((sourceUrl) => {
      const generatedPreviewUrl = buildOssImagePreviewUrl(sourceUrl, options || {});
      if (!generatedPreviewUrl || generatedPreviewUrl === sourceUrl) return '';
      return resolveMediaUrl(generatedPreviewUrl);
    }))
    .filter(Boolean);

  return [...new Set(urls)];
};

/**
 * Ensure URL-like fields use HTTPS.
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
