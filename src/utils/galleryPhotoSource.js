import { getEnvValue } from './envConfig';
import { createPublicPhotoSource } from './publicPhotoData';

export const PUBLIC_PHOTOS_INVALIDATED_EVENT = 'pic4pick:public-photos-invalidated';
let activeSource;
let activeUrl;
let activeKey;

export function getPublicPhotoSource() {
  const url = getEnvValue('VITE_SUPABASE_URL', '').trim();
  const key = getEnvValue('VITE_SUPABASE_ANON_KEY', '').trim();
  if (!url || !key) return null;
  if (!activeSource || activeUrl !== url || activeKey !== key) {
    activeSource?.invalidate({ persist: false });
    let storage;
    try { storage = window.localStorage; } catch { /* Storage may be disabled. */ }
    activeSource = createPublicPhotoSource({ url, key, storage });
    activeUrl = url;
    activeKey = key;
  }
  return activeSource;
}

export function prefetchPublicPhotos() {
  return getPublicPhotoSource()?.load().catch(() => {});
}

export function invalidatePublicPhotoCache() {
  getPublicPhotoSource()?.invalidate();
  window.dispatchEvent(new Event(PUBLIC_PHOTOS_INVALIDATED_EVENT));
}
