/**
 * 照片加载和点赞相关 Hooks
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Storage, STORAGE_KEYS } from '../../../utils/storage';
import { ensureHttps } from '../../../utils/urlUtils';
import { handleError, safeAsync, ErrorType } from '../../../utils/errorHandler';
import { getApiUrl } from '../../../utils/apiUrl';
import { GalleryPhoto } from '../utils/photoDataUtils';
import { normalizePhotoCategory } from '../../../utils/photoCategories';
import { getPublicPhotoSource, PUBLIC_PHOTOS_INVALIDATED_EVENT } from '../../../utils/galleryPhotoSource';
import { PUBLIC_PHOTO_CACHE_KEY, PUBLIC_PHOTO_REFRESH_INTERVAL_MS } from '../../../utils/publicPhotoData';



const updatePhotoLike = async (photoId: string, delta: number) => {
  const response = await fetch(getApiUrl(`/api/photos/${encodeURIComponent(photoId)}/likes`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ delta }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `点赞更新失败: ${response.status}`);
  }
};

// 从 localStorage 加载审核通过的作品
const loadApprovedPhotos = (): GalleryPhoto[] => {
  const photos = Storage.get(STORAGE_KEYS.APPROVED_PHOTOS, []);
  return (Array.isArray(photos) ? photos : []).map((photo: any) => ({
    ...photo,
    category: normalizePhotoCategory(photo.category),
    mood: photo.mood === '精选' ? '原创作品' : photo.mood,
    image: ensureHttps(photo.image || ''),
    thumbnail: ensureHttps(photo.thumbnail || photo.preview || ''),
    preview: ensureHttps(photo.preview || photo.thumbnail || ''),
  }));
};

// 映射 Supabase 数据到 Gallery 照片格式
export { mapSupabaseRowToGalleryPhoto } from '../../../../packages/shared/photoMapper';
import { mapSupabaseRowToGalleryPhoto } from '../../../../packages/shared/photoMapper';

// 加载照片数据
export const usePhotoData = (supabase: any) => {
  const source = supabase ? getPublicPhotoSource() : null;
  const [initialCache] = useState(() => source?.readCache());
  const [approvedPhotos, setApprovedPhotos] = useState<GalleryPhoto[]>(() => source
    ? (initialCache?.rows || []).map(mapSupabaseRowToGalleryPhoto) : loadApprovedPhotos());
  const [isPhotoDataLoading, setIsPhotoDataLoading] = useState(Boolean(supabase));
  const [lastPhotoDataLoadedAt, setLastPhotoDataLoadedAt] = useState<number | null>(initialCache?.fetchedAt || null);
  const [supabaseError, setSupabaseError] = useState('');
  const localApprovedPhotosSnapshotRef = useRef<string | null>(null);

  // 监听 localStorage 变化（非 Supabase 模式）
  useEffect(() => {
    if (supabase) return;

    const handleStorageChange = () => {
      const snapshot = window.localStorage.getItem(STORAGE_KEYS.APPROVED_PHOTOS) || '';
      if (snapshot === localApprovedPhotosSnapshotRef.current) return;

      localApprovedPhotosSnapshotRef.current = snapshot;
      const loaded = loadApprovedPhotos();
      setApprovedPhotos(loaded);
      setLastPhotoDataLoadedAt(Date.now());
      setIsPhotoDataLoading(false);
    };

    handleStorageChange();

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key && event.key !== STORAGE_KEYS.APPROVED_PHOTOS) return;
      handleStorageChange();
    };

    window.addEventListener('storage', handleStorageEvent);
    const interval = setInterval(handleStorageChange, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      clearInterval(interval);
    };
  }, [supabase]);

  // 从 Supabase 加载数据
  useEffect(() => {
    if (!source) return;

    let isMounted = true;
    let generation = 0;
    let appliedAt: number | null = null;
    const applyCache = () => {
      const cached = source.readCache();
      setApprovedPhotos((cached?.rows || []).map(mapSupabaseRowToGalleryPhoto));
      setLastPhotoDataLoadedAt(cached?.fetchedAt || null);
      appliedAt = cached?.fetchedAt || null;
    };
    applyCache();

    const fetchApprovedFromSupabase = async () => {
      const requestGeneration = ++generation;
      setIsPhotoDataLoading(true);
      try {
        const result = await source.load();
        if (isMounted && requestGeneration === generation) {
          // A focus event can reuse the same snapshot. Preserve optimistic likes.
          if (result.fetchedAt !== appliedAt) {
            setApprovedPhotos(result.rows.map(mapSupabaseRowToGalleryPhoto));
            appliedAt = result.fetchedAt;
          }
          setSupabaseError('');
          setLastPhotoDataLoadedAt(result.fetchedAt);
        }
      } catch (error) {
        if (!isMounted || requestGeneration !== generation) return;
        const appError = handleError(error, {
          context: 'fetchApprovedFromSupabase',
          type: ErrorType.NETWORK,
        });
        const cached = source.readCache();
        if (!cached || cached.fetchedAt !== appliedAt) applyCache();
        setSupabaseError(`加载云端作品失败: ${appError.message}`);
      } finally {
        if (isMounted && requestGeneration === generation) {
          setIsPhotoDataLoading(false);
        }
      }
    };

    fetchApprovedFromSupabase();

    const refreshWhenActive = () => {
      if (document.visibilityState === 'visible') {
        fetchApprovedFromSupabase();
      }
    };
    const handleInvalidation = () => { applyCache(); fetchApprovedFromSupabase(); };
    const handleCacheChange = (event: StorageEvent) => {
      if (event.key && event.key !== PUBLIC_PHOTO_CACHE_KEY) return;
      generation += 1;
      source.invalidate({ persist: false });
      applyCache();
      setIsPhotoDataLoading(false);
      setSupabaseError('');
      if (!event.newValue) fetchApprovedFromSupabase();
    };

    window.addEventListener('focus', refreshWhenActive);
    document.addEventListener('visibilitychange', refreshWhenActive);
    window.addEventListener(PUBLIC_PHOTOS_INVALIDATED_EVENT, handleInvalidation);
    window.addEventListener('storage', handleCacheChange);
    const timer = window.setInterval(refreshWhenActive, PUBLIC_PHOTO_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', refreshWhenActive);
      document.removeEventListener('visibilitychange', refreshWhenActive);
      window.removeEventListener(PUBLIC_PHOTOS_INVALIDATED_EVENT, handleInvalidation);
      window.removeEventListener('storage', handleCacheChange);
      window.clearInterval(timer);
    };
  }, [source]);

  return { approvedPhotos, setApprovedPhotos, isPhotoDataLoading, lastPhotoDataLoadedAt, supabaseError };
};

// 点赞功能
export const useLikePhoto = (supabase: any, setApprovedPhotos: React.Dispatch<React.SetStateAction<GalleryPhoto[]>>) => {
  const [likedPhotoIds, setLikedPhotoIds] = useState<string[]>(() => {
    return Storage.get(STORAGE_KEYS.LIKED_PHOTOS, []);
  });

  useEffect(() => {
    Storage.set(STORAGE_KEYS.LIKED_PHOTOS, likedPhotoIds);
  }, [likedPhotoIds]);

  const handleToggleLike = useCallback(
    async (photo: GalleryPhoto) => {
      if (!photo?.id || !supabase) return;

      const alreadyLiked = likedPhotoIds.includes(photo.id);
      const delta = alreadyLiked ? -1 : 1;

      // 本地乐观更新
      setApprovedPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id ? { ...p, likes: Math.max(0, (p.likes || 0) + delta) } : p
        )
      );

      setLikedPhotoIds((prev) =>
        alreadyLiked ? prev.filter((id) => id !== photo.id) : [...prev, photo.id]
      );

      await safeAsync(
        async () => {
          await updatePhotoLike(photo.id, delta);
        },
        {
          context: 'handleToggleLike',
          silent: true,
          throwError: false,
        }
      );
    },
    [likedPhotoIds, supabase, setApprovedPhotos]
  );

  return { likedPhotoIds, handleToggleLike };
};
