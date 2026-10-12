export function createPhotoLikeHandler({ db, notifications, logger, sendError }) {
  return async (req, res) => {
    try {
      const delta = Number(req.body?.delta);
      if (![-1, 1].includes(delta)) {
        return res.status(400).json({ error: 'delta 只能是 1 或 -1' });
      }

      const updated = await db('rpc/update_public_photo_likes', new URLSearchParams(), {
        method: 'POST',
        body: { photo_id: req.params.id, like_delta: delta },
      });
      const result = Array.isArray(updated) ? updated[0] || null : updated;
      if (!result) {
        return res.status(404).json({ error: '照片不存在或不可公开点赞' });
      }
      res.json({ success: true, data: result });
      if (delta === 1) {
        // SMTP latency or failure must never turn a committed like into an API error.
        void Promise.resolve().then(() => notifications.notify(result)).catch((error) => {
          logger.warn('点赞邮件任务失败', { photoId: result.id, code: error.code || 'UNKNOWN' });
        });
      }
    } catch (error) {
      sendError(res, error, '点赞更新失败');
    }
  };
}
