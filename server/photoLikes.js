import { isIP } from 'node:net';

export function getLikeClientIp(req) {
  const raw = req.ip || req.socket?.remoteAddress || '';
  const normalized = raw.startsWith('::ffff:') && isIP(raw.slice(7)) === 4 ? raw.slice(7) : raw;
  return isIP(normalized) ? normalized : null;
}

export function createPhotoLikeHandler({ db, notifications, logger, sendError }) {
  return async (req, res) => {
    try {
      const delta = Number(req.body?.delta);
      if (![-1, 1].includes(delta)) {
        return res.status(400).json({ error: 'delta 只能是 1 或 -1' });
      }

      const clientIp = getLikeClientIp(req);
      const updated = await db('rpc/update_public_photo_likes_with_ip', new URLSearchParams(), {
        method: 'POST',
        body: { photo_id: req.params.id, like_delta: delta, client_ip: clientIp },
      });
      const result = Array.isArray(updated) ? updated[0] || null : updated;
      if (!result) {
        return res.status(404).json({ error: '照片不存在或不可公开点赞' });
      }
      res.json({ success: true, data: { id: result.id, likes: result.likes } });
      if (delta === 1) {
        // SMTP latency or failure must never turn a committed like into an API error.
        void Promise.resolve().then(() => notifications.notify({ ...result, clientIp })).catch((error) => {
          logger.warn('点赞邮件任务失败', { photoId: result.id, code: error.code || 'UNKNOWN' });
        });
      }
    } catch (error) {
      sendError(res, error, '点赞更新失败');
    }
  };
}

export function createLikeEventsHandler({ db, sendError }) {
  return async (req, res) => {
    const photoId = req.query.photoId;
    if (photoId && (typeof photoId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photoId))) {
      return res.status(400).json({ error: '照片 ID 无效' });
    }
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100
      || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
      return res.status(400).json({ error: 'limit 应为 1–100，offset 应为 0–10000 的整数' });
    }
    try {
      const data = await db('photo_like_events', new URLSearchParams({
        select: 'id,photo_id,ip,created_at', order: 'created_at.desc,id.desc',
        limit: String(limit), offset: String(offset),
        ...(photoId ? { photo_id: `eq.${photoId}` } : {}),
      }));
      res.json({ success: true, data });
    } catch (error) {
      sendError(res, error, '点赞记录读取失败');
    }
  };
}
