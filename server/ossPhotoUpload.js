const MULTIPART_THRESHOLD = 4 * 1024 * 1024;
const PART_SIZE = 512 * 1024;

export const createUploadProgressStore = ({ now = Date.now } = {}) => {
  const entries = new Map();
  const lifetime = 15 * 60 * 1000;
  return {
    set(id, stage, fraction = 0) {
      if (!id) return;
      const current = now();
      for (const [key, entry] of entries) if (entry.expiresAt <= current) entries.delete(key);
      if (!entries.has(id) && entries.size >= 1000) entries.delete(entries.keys().next().value);
      entries.set(id, { stage, percent: Math.round(Math.max(0, Math.min(1, fraction)) * 100), expiresAt: current + lifetime });
    },
    get(id) {
      const entry = entries.get(id);
      if (!entry || entry.expiresAt <= now()) { entries.delete(id); return null; }
      return { stage: entry.stage, percent: entry.percent };
    },
  };
};

// Small requests avoid the overhead of multipart. Large originals use bounded
// requests so a slow inter-region connection does not stall one huge PUT.
export const uploadPhotoObject = async ({ client, key, buffer, timeout, headers, logger, onProgress = () => {} }) => {
  if (buffer.length < MULTIPART_THRESHOLD) {
    const result = await client.put(key, buffer, { timeout, headers });
    onProgress(1);
    return result;
  }

  let checkpoint;
  let lastReported = -1;
  const started = Date.now();
  try {
    const result = await client.multipartUpload(key, buffer, {
      partSize: PART_SIZE,
      parallel: 8,
      timeout: Math.min(timeout, 60_000),
      mime: headers['Content-Type'],
      headers,
      progress: (fraction, nextCheckpoint) => {
        if (nextCheckpoint) checkpoint = nextCheckpoint;
        onProgress(fraction);
        const percent = Math.floor(fraction * 100 / 10) * 10;
        if (percent > lastReported) {
          lastReported = percent;
          logger.info('OSS 原图分片上传进度', { key, percent, elapsedMs: Date.now() - started });
        }
      },
    });
    onProgress(1);
    return result;
  } catch (error) {
    // Deleting the final object does not remove unfinished multipart data.
    // Scope the abort to this file, leaving concurrent uploads untouched.
    if (checkpoint?.uploadId) {
      try {
        await client.abortMultipartUpload(key, checkpoint.uploadId, { timeout: 15_000 });
      } catch (abortError) {
        if (abortError.status !== 404 && abortError.code !== 'NoSuchUpload') {
          logger.warn('清理失败的 OSS 分片上传未完成', { key, uploadId: checkpoint.uploadId, code: abortError.code });
        }
      }
    }
    throw error;
  }
};
