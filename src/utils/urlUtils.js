import { createMediaUrlHelpers } from '../../packages/shared/mediaUrls.js';

export const { getDirectMediaUrl, ensureHttps, resolveMediaUrl, getOriginalMediaUrl, buildOssImagePreviewUrl, getPreviewMediaUrl, getPreviewMediaSrcSet, getPreviewMediaFallbackUrls } = createMediaUrlHelpers({
  useProxy: () => import.meta.env.VITE_USE_OSS_MEDIA_PROXY === 'true',
});
