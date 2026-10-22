import { getPhotoOssAssets, deleteUnreferencedOssAsset } from './ossAssets.js';
export { getPhotoOssAssets } from './ossAssets.js';

// Persist cleanup intent before deleting a record. The worker never removes an
// object while its photo record (or another photo using that URL) still exists.
const CLEANUP_PREFIX = 'oss_cleanup:';

export const createPhotoDeletionService = ({ db, deleteObject, bucket, logger }) => {
  const activeJobs = new Set();
  const jobParams = (id) => new URLSearchParams({ id: `eq.${CLEANUP_PREFIX}${id}` });
  const findPhoto = async (id) => {
    const rows = await db('photos', new URLSearchParams({
      select: 'id,image_url,thumbnail_url', id: `eq.${id}`, limit: '1',
    }));
    return rows?.[0] || null;
  };

  const cleanup = async (job) => {
    const { photoId, assets } = job.data;
    try {
      // A failed/ambiguous database delete must leave all image bytes intact.
      if (await findPhoto(photoId)) return { pending: true };
      for (const { key, url } of assets) {
        await deleteUnreferencedOssAsset({ asset: { key, url }, db, deleteObject, bucket,
          mismatchMessage: '清理任务的 OSS 路径与当前存储配置不匹配' });
      }
      await db('app_settings', jobParams(photoId), { method: 'DELETE' });
      return { pending: false };
    } catch (error) {
      logger.warn('作品已删除，OSS 清理任务将重试', { photoId, message: error.message });
      return { pending: true };
    }
  };

  const removePhoto = async (id) => {
    if (activeJobs.has(id)) {
      const error = new Error('作品正在删除，请稍后重试');
      error.status = 409;
      throw error;
    }
    activeJobs.add(id);
    try {
      const photo = await findPhoto(id);
      let job;
      if (photo) {
        const assets = getPhotoOssAssets(photo, bucket);
        if (assets.length) {
          job = { id: `${CLEANUP_PREFIX}${id}`, data: { photoId: id, assets }, updated_at: new Date().toISOString() };
          // If the durable queue cannot be written, abort before deleting anything.
          await db('app_settings', new URLSearchParams({ on_conflict: 'id' }), {
            method: 'POST', body: job, prefer: 'resolution=merge-duplicates',
          });
        }
      } else {
        const jobs = await db('app_settings', jobParams(id));
        job = jobs?.[0];
      }
      const data = photo ? await db('photos', new URLSearchParams({ id: `eq.${id}`, select: 'id' }), {
        method: 'DELETE', prefer: 'return=representation',
      }) : [];
      if (photo && await findPhoto(id)) {
        const error = new Error('删除未完成，作品记录仍存在，请重试');
        error.status = 409;
        throw error;
      }
      const result = job ? await cleanup(job) : { pending: false };
      return { data: data || [], cleanup: result };
    } finally {
      activeJobs.delete(id);
    }
  };

  let isRetrying = false;
  const retryPending = async () => {
    if (isRetrying) return;
    isRetrying = true;
    try {
      const jobs = await db('app_settings', new URLSearchParams({
        select: 'id,data', id: `like.${CLEANUP_PREFIX}*`, order: 'updated_at.asc', limit: '20',
      }));
      for (const job of jobs || []) {
        const id = job.data?.photoId;
        if (!id || !Array.isArray(job.data.assets) || activeJobs.has(id)) continue;
        activeJobs.add(id);
        try {
          const result = await cleanup(job);
          // Rotate failed/blocked jobs so they do not starve the rest of the queue.
          if (result.pending) await db('app_settings', jobParams(id), {
            method: 'PATCH', body: { updated_at: new Date().toISOString() },
          });
        } finally {
          activeJobs.delete(id);
        }
      }
    } catch (error) {
      logger.warn('读取 OSS 清理任务失败，将稍后重试', { message: error.message });
    } finally {
      isRetrying = false;
    }
  };

  return { removePhoto, retryPending };
};
