import { deleteUnreferencedOssAsset } from './ossAssets.js';

const UPLOAD_PREFIX = 'photo_upload:';
const RETENTION_MS = 48 * 60 * 60 * 1000;
const fail = (message, status) => Object.assign(new Error(message), { status });

// Persist the exact object paths before writing OSS. Failed/abandoned uploads
// survive a process restart and can be reclaimed without relying on the browser.
export const createPhotoUploadService = ({ db, deleteObject, bucket, logger, now = Date.now }) => {
  const active = new Set();
  const paramsFor = (id) => new URLSearchParams({ id: `eq.${UPLOAD_PREFIX}${id}` });
  const readJob = async (id) => (await db('app_settings', paramsFor(id)))?.[0];
  const readPhoto = async (id) => (await db('photos', new URLSearchParams({
    select: '*', id: `eq.${id}`, limit: '1',
  })))?.[0];
  const writeJob = (job) => db('app_settings', new URLSearchParams({ on_conflict: 'id' }), {
    method: 'POST', body: job, prefer: 'resolution=merge-duplicates',
  });
  const removeJob = (id) => db('app_settings', paramsFor(id), { method: 'DELETE' });
  const renew = (job) => ({ ...job, updated_at: new Date(now()).toISOString(), data: {
    ...job.data, expiresAt: new Date(now() + RETENTION_MS).toISOString(),
  } });
  const withLock = async (id, operation) => {
    if (active.has(id)) throw fail('作品正在处理，请稍后重试', 409);
    active.add(id);
    try { return await operation(); } finally { active.delete(id); }
  };

  const cleanup = async (job) => {
    const id = job.data.photoId;
    try {
      // A save whose HTTP response was lost still owns its files.
      if (!await readPhoto(id)) {
        for (const asset of job.data.assets) {
          await deleteUnreferencedOssAsset({ asset, db, deleteObject, bucket,
            mismatchMessage: '上传清理任务与当前 OSS 配置不匹配' });
        }
      }
      await removeJob(id);
      return true;
    } catch (error) {
      logger.warn('上传遗留图片清理失败，将自动重试', { photoId: id, message: error.message });
      return false;
    }
  };

  const upload = ({ id, fingerprint, assets, result, writeObjects }) => withLock(id, async () => {
    let job = await readJob(id);
    const photo = await readPhoto(id);
    if (photo) {
      if (photo.image_url !== result.url && !job?.data.assets.some(({ url }) => url === photo.image_url)) {
        throw fail('作品 ID 已被其他图片使用，请重新选择照片', 409);
      }
      return { url: photo.image_url, thumbnailUrl: photo.thumbnail_url, uploadId: id };
    }
    if (job && job.data.fingerprint !== fingerprint) throw fail('上传 ID 与照片内容不匹配', 409);
    if (job?.data.ready) {
      await writeJob(renew(job));
      return job.data.result;
    }
    // Reuse the originally chosen paths even when retrying across midnight.
    job = renew(job || { id: `${UPLOAD_PREFIX}${id}`, data: {
      photoId: id, fingerprint, assets, result: { ...result, uploadId: id }, ready: false,
    } });
    await writeJob(job); // Abort before any object is written if persistence fails.
    try {
      await writeObjects(job.data.assets);
      job = renew({ ...job, data: { ...job.data, ready: true } });
      await writeJob(job);
      return job.data.result;
    } catch (error) {
      // Include writes that timed out after OSS had already accepted the bytes.
      const failedJob = { ...job, data: { ...job.data, ready: false, expiresAt: new Date(now()).toISOString() } };
      try { await writeJob(failedJob); } catch (queueError) {
        logger.warn('上传清理任务更新时间失败，原任务仍保留', { message: queueError.message });
      }
      await cleanup(failedJob);
      throw error;
    }
  });

  const createPhoto = (photo, uploadId) => withLock(photo.id, async () => {
    if (uploadId && uploadId !== photo.id) throw fail('上传 ID 与作品 ID 不匹配', 400);
    let saved = await readPhoto(photo.id);
    if (!saved) {
      if (uploadId) {
        const job = await readJob(uploadId);
        if (!job?.data.ready) throw fail('上传缓存已过期，请再次提交以重新上传照片', 410);
        if (job.data.result.url !== photo.image_url || (job.data.result.thumbnailUrl || job.data.result.url) !== (photo.thumbnail_url || photo.image_url)) {
          throw fail('作品图片与上传结果不匹配', 409);
        }
        await writeJob(renew(job));
      }
      // Duplicate submissions must not overwrite a later edit or review decision.
      await db('photos', new URLSearchParams({ on_conflict: 'id' }), {
        method: 'POST', body: photo, prefer: 'resolution=ignore-duplicates,return=representation',
      });
      saved = await readPhoto(photo.id);
      if (!saved) throw fail('作品保存结果无法确认，请重试', 503);
    }
    if (saved.image_url !== photo.image_url) throw fail('作品 ID 已被其他图片使用', 409);
    if (uploadId) {
      try { await removeJob(uploadId); } catch (error) {
        // The worker will retire this job after confirming the record exists.
        logger.warn('作品已保存，上传任务稍后清理', { photoId: photo.id, message: error.message });
      }
    }
    return [saved];
  });

  let retrying = false;
  const retryPending = async () => {
    if (retrying) return;
    retrying = true;
    try {
      const jobs = await db('app_settings', new URLSearchParams({
        select: 'id,data', id: `like.${UPLOAD_PREFIX}*`,
        'data->>expiresAt': `lte.${new Date(now()).toISOString()}`, order: 'updated_at.asc', limit: '20',
      }));
      for (const job of jobs || []) {
        const id = job.data?.photoId;
        if (!id || !Array.isArray(job.data.assets) || active.has(id)) continue;
        await withLock(id, async () => {
          // Re-read after acquiring the lock; an intervening retry may renew it.
          const current = await readJob(id);
          if (!current || Date.parse(current.data.expiresAt) > now()) return;
          if (!await cleanup(current)) await db('app_settings', paramsFor(id), {
            method: 'PATCH', body: { updated_at: new Date(now()).toISOString() },
          });
        });
      }
    } catch (error) {
      logger.warn('读取上传清理任务失败，将稍后重试', { message: error.message });
    } finally { retrying = false; }
  };

  return { upload, createPhoto, retryPending };
};
