/** @returns {Error} */
const cancelled = () => new DOMException('Cancelled', 'AbortError');
function wait(ms, signal, createCancelled) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(createCancelled());
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(createCancelled()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export function createPrecomputedSpatialDepthClient({ loadMetadata, loadDepth, pollMs = 3000, timeoutMs = 30_000, createCancelled = cancelled }) {
  const cache = new Map();
  const request = async (photoId, onProgress, signal, { poll = true } = {}) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (signal.aborted) throw createCancelled();
      const row = await loadMetadata(photoId, signal);
      if (signal.aborted) throw createCancelled();
      if (row?.status === 'ready') {
        if (!row.depth_path || !Number.isInteger(row.width) || !Number.isInteger(row.height) || row.width < 1 || row.height < 1 || row.width > 1024 || row.height > 1024) {
          throw new Error('空间照片数据异常，请稍后重试。');
        }
        const key = `${photoId}:${row.generation}`;
        if (cache.has(key)) {
          const depth = cache.get(key);
          cache.delete(key);
          if (depth.width === row.width && depth.height === row.height) {
            cache.set(key, depth);
            return depth;
          }
        }
        onProgress({ stage: 'reading' });
        const depth = await loadDepth(row, signal);
        if (signal.aborted) throw createCancelled();
        if (depth.width !== row.width || depth.height !== row.height || depth.values.length !== row.width * row.height) {
          throw new Error('空间照片数据异常，请稍后重试。');
        }
        cache.set(key, depth);
        if (cache.size > 3) cache.delete(cache.keys().next().value);
        return depth;
      }
      if (row?.status === 'failed') throw new Error('这张照片的空间效果暂未生成成功，请稍后再试。');
      // Background preparation checks once; only a user click starts polling.
      if (!poll) return null;
      onProgress({ stage: 'pending' });
      if (Date.now() >= deadline) throw new Error('空间照片正在后台准备，请稍后再试。');
      await wait(Math.min(pollMs, Math.max(0, deadline - Date.now())), signal, createCancelled);
    }
  };
  return {
    request,
    clearCache: () => cache.clear(),
    prefetch: (photoId, signal) => request(photoId, () => {}, signal, { poll: false }),
  };
}
