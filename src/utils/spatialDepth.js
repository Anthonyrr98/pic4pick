import { getEnvValue } from './envConfig';
import { getDirectMediaUrl } from './urlUtils';
import { getSupabaseClient } from './supabaseClient';
import { createPrecomputedSpatialDepthClient } from './precomputedSpatialDepth';

const depthClient = createPrecomputedSpatialDepthClient({
  async loadMetadata(photoId, signal) {
    const client = getSupabaseClient();
    if (!client) throw new Error('空间照片需要连接云端图库。');
    const { data, error } = await client.from('photo_spatial')
      .select('photo_id,generation,status,storage_backend,depth_path,width,height').eq('photo_id', photoId)
      .maybeSingle().abortSignal(AbortSignal.any([signal, AbortSignal.timeout(15_000)]));
    if (error) throw new Error('空间照片读取失败，请检查网络后重试。');
    return data;
  },
  async loadDepth(row, signal) {
    let data, error;
    if (row.storage_backend === 'oss') {
      const base = String(getEnvValue('VITE_API_BASE_URL', '')).trim().replace(/\/+$/, '').replace(/\/api$/, '');
      const response = await fetch(`${base}/api/photos/${encodeURIComponent(row.photo_id)}/spatial-depth`, {
        cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
      });
      if (!response.ok) throw new Error('空间照片读取失败，请稍后重试。');
      data = await response.json();
      if (data.generation !== row.generation) throw new Error('照片已更新，请重新打开空间效果。');
    } else {
      const client = getSupabaseClient();
      ({ data, error } = await client.storage.from('spatial-depth').createSignedUrl(row.depth_path, 300));
    }
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (error || !data?.signedUrl) throw new Error('空间照片读取失败，请稍后重试。');
    const image = await readSpatialImage(data.signedUrl, signal);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('浏览器暂不支持空间场景。');
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const values = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < values.length; i++) values[i] = pixels[i * 4];
    return { values, width: canvas.width, height: canvas.height };
  },
});

function decodeSpatialImage(src, signal) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    const clean = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      image.onload = null;
      image.onerror = null;
    };
    const abort = () => {
      clean();
      image.src = '';
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    image.onload = () => { clean(); resolve(image); };
    image.onerror = () => {
      clean();
      reject(new Error('这张照片暂时无法生成空间场景，图片服务需要允许跨域读取。'));
    };
    const timeout = setTimeout(() => {
      clean();
      image.src = '';
      reject(new Error('照片读取超时，请检查网络连接后重试。'));
    }, 20_000);
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    image.src = src;
  });
}

async function readSpatialImage(src, signal) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 20_000);
  let objectUrl;
  try {
    // A normal <img> may have cached an OSS response without CORS headers.
    // Fetch in CORS mode with revalidation before uploading pixels to WebGL.
    const response = await fetch(src, {
      mode: 'cors', cache: 'reload', signal: AbortSignal.any([signal, timeout.signal]),
    });
    if (!response.ok) throw new Error('照片读取失败，请稍后重试。');
    objectUrl = URL.createObjectURL(await response.blob());
    return await decodeSpatialImage(objectUrl, signal);
  } catch (error) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (timeout.signal.aborted) throw new Error('照片读取超时，请检查网络连接后重试。');
    throw error;
  } finally {
    clearTimeout(timer);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export async function loadSpatialImage(src, signal) {
  try {
    return await readSpatialImage(src, signal);
  } catch (error) {
    if (signal.aborted || src.includes('/api/media/proxy')) throw error;
    const direct = getDirectMediaUrl(src);
    const parsed = new URL(direct, window.location.origin);
    // Reuse the existing restricted OSS proxy, never send arbitrary external
    // image hosts through the backend. The displayed photograph stays unchanged.
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.aliyuncs.com')
      || !/^\/(?:origin|ore|pic4pick)\//.test(parsed.pathname)) throw error;
    const base = String(getEnvValue('VITE_API_BASE_URL', '')).trim().replace(/\/+$/, '').replace(/\/api$/, '');
    return readSpatialImage(`${base}/api/media/proxy?url=${encodeURIComponent(direct)}`, signal);
  }
}

export function loadPrecomputedSpatialDepth(photoId, onProgress, signal) {
  return depthClient.request(photoId, onProgress, signal);
}

export function prefetchPrecomputedSpatialDepth(photoId, signal) {
  return depthClient.prefetch(photoId, signal);
}

