const MULTIPART_THRESHOLD = 4 * 1024 * 1024;
const PART_SIZE = 1024 * 1024;

// Small requests avoid the overhead of multipart. Large originals use bounded
// requests so a slow inter-region connection does not stall one huge PUT.
export const uploadPhotoObject = async ({ client, key, buffer, timeout, headers, logger }) => {
  if (buffer.length < MULTIPART_THRESHOLD) {
    return client.put(key, buffer, { timeout, headers });
  }

  let checkpoint;
  let lastReported = -1;
  const started = Date.now();
  try {
    return await client.multipartUpload(key, buffer, {
      partSize: PART_SIZE,
      parallel: 3,
      timeout: Math.min(timeout, 60_000),
      mime: headers['Content-Type'],
      headers,
      progress: (fraction, nextCheckpoint) => {
        if (nextCheckpoint) checkpoint = nextCheckpoint;
        const percent = Math.floor(fraction * 100 / 10) * 10;
        if (percent > lastReported) {
          lastReported = percent;
          logger.info('OSS 原图分片上传进度', { key, percent, elapsedMs: Date.now() - started });
        }
      },
    });
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
