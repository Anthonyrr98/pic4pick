const MODEL = 'onnx-community/depth-anything-v2-small';
const REVISION = '0d8d94ea44f483e26c9c33dad1a97c453ef9b80c';
const depthCache = new Map();

function readSpatialImage(src, signal) {
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

export function estimateSpatialDepth(image, key, onProgress, signal) {
  if (signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
  if (depthCache.has(key)) return Promise.resolve(depthCache.get(key));
  // Keep input/output memory bounded, including when the original is very large.
  const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight));
  const input = document.createElement('canvas');
  input.width = Math.max(1, Math.round(image.naturalWidth * scale));
  input.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = input.getContext('2d', { willReadFrequently: true });
  if (!context) return Promise.reject(new Error('浏览器暂不支持空间场景。'));
  context.drawImage(image, 0, 0, input.width, input.height);
  const pixels = context.getImageData(0, 0, input.width, input.height).data;

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./spatialDepth.worker.js', import.meta.url), { type: 'module' });
    const clean = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      clean();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timeout = setTimeout(() => {
      clean();
      reject(new Error('空间场景生成超时，请检查网络连接后重试。'));
    }, 120_000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') return onProgress(data);
      clean();
      if (data.type !== 'result') return reject(new Error(data.message || '空间场景生成失败，请重试。'));
      depthCache.set(key, data);
      if (depthCache.size > 3) depthCache.delete(depthCache.keys().next().value);
      resolve(data);
    };
    worker.onerror = () => {
      clean();
      reject(new Error('空间场景组件加载失败，请检查网络连接后重试。'));
    };
    onProgress({ stage: 'loading' });
    worker.postMessage({ pixels: pixels.buffer, width: input.width, height: input.height, model: MODEL, revision: REVISION }, [pixels.buffer]);
  });
}
import { getEnvValue } from './envConfig';
import { getDirectMediaUrl } from './urlUtils';

