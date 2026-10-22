import { PHOTO_SELECT_FIELDS } from './photoFields.js';

export const PUBLIC_PHOTO_CACHE_KEY = 'pic4pick_public_photos_v1';
export const PUBLIC_PHOTO_CACHE_MAX_AGE_MS = 5 * 60_000;
export const PUBLIC_PHOTO_REFRESH_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const PUBLIC_FIELDS = PHOTO_SELECT_FIELDS.split(',').filter(field => field !== 'reject_reason');

const validRows = rows => Array.isArray(rows) && rows.every(row => row &&
  typeof row.id === 'string' && typeof row.image_url === 'string');
const isPublic = row => row.status === 'approved' && row.hidden === false;

// Cache metadata only. Requests use the public key and the existing anonymous RLS policy.
export function createPublicPhotoSource({ url, key, storage, fetcher = fetch, now = Date.now,
  timeoutMs = REQUEST_TIMEOUT_MS }) {
  const source = url.replace(/\/+$/, '');
  let memory = null;
  let pending = null;
  let controller = null;
  let generation = 0;

  const usable = record => record?.version === 1 && record.source === source &&
    Number.isFinite(record.fetchedAt) && record.fetchedAt <= now() &&
    now() - record.fetchedAt < PUBLIC_PHOTO_CACHE_MAX_AGE_MS &&
    validRows(record.rows) && record.rows.every(isPublic);

  const readCache = () => {
    if (usable(memory)) return memory;
    memory = null;
    try {
      const cached = JSON.parse(storage?.getItem(PUBLIC_PHOTO_CACHE_KEY) || 'null');
      if (usable(cached)) return cached;
      // Another project's cache is never used or deleted on a configuration switch.
      if (cached?.source === source) storage?.removeItem(PUBLIC_PHOTO_CACHE_KEY);
    } catch { /* Private browsing, full storage and corrupt JSON must not block the gallery. */ }
    return null;
  };

  const load = () => {
    if (pending) return pending;
    // The bootstrap and React mount share one result, including StrictMode remounts.
    if (usable(memory) && now() - memory.fetchedAt < PUBLIC_PHOTO_REFRESH_INTERVAL_MS) {
      return Promise.resolve(memory);
    }
    const requestGeneration = generation;
    const requestController = new AbortController();
    controller = requestController;
    const timer = setTimeout(() => requestController.abort(), timeoutMs);

    const query = async ordered => {
      const params = new URLSearchParams({ select: PUBLIC_FIELDS.join(','), status: 'eq.approved',
        hidden: 'eq.false', limit: '1000', ...(ordered ? { order: 'created_at.desc' } : {}) });
      const response = await fetcher(`${source}/rest/v1/photos?${params}`, {
        headers: { apikey: key, 'Accept-Profile': 'public',
          ...(!key.startsWith('sb_publishable_') ? { Authorization: `Bearer ${key}` } : {}) },
        signal: requestController.signal,
      });
      const body = await response.json();
      if (!response.ok) {
        const error = new Error(body?.message || `作品列表读取失败 (${response.status})`);
        error.code = body?.code;
        throw error;
      }
      if (!validRows(body)) throw new Error('作品列表格式无效');
      return body.filter(isPublic).map(row => Object.fromEntries(
        PUBLIC_FIELDS.filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]])
      ));
    };

    const task = (async () => {
      try {
        let rows;
        try { rows = await query(true); }
        catch (error) {
          if (requestController.signal.aborted ||
            !(error.code === '57014' || /statement timeout/i.test(error.message))) throw error;
          rows = await query(false);
        }
        // An admin write may invalidate a read that was already in flight.
        if (requestGeneration !== generation) throw new DOMException('作品列表已更新', 'AbortError');
        memory = { version: 1, source, fetchedAt: now(), rows };
        try { storage?.setItem(PUBLIC_PHOTO_CACHE_KEY, JSON.stringify(memory)); }
        catch { /* Keep the successful in-memory result if persistence is unavailable. */ }
        return memory;
      } catch (error) {
        if (requestController.signal.aborted && requestGeneration === generation) {
          throw new Error('作品列表请求超时，请检查网络后重试');
        }
        throw error;
      } finally {
        clearTimeout(timer);
        if (requestGeneration === generation) { pending = null; controller = null; }
      }
    })();
    pending = task;
    return task;
  };

  const invalidate = ({ persist = true } = {}) => {
    generation += 1;
    controller?.abort();
    controller = null;
    pending = null;
    memory = null;
    if (persist) {
      try { storage?.removeItem(PUBLIC_PHOTO_CACHE_KEY); } catch { /* Optional cache. */ }
    }
  };

  return { readCache, load, invalidate };
}
