/**
 * 照片加载和点赞相关 Hooks
 */

import { useEffect, useState, useCallback } from 'react';
import { Storage, STORAGE_KEYS } from '../../../utils/storage';
import { ensureHttps } from '../../../utils/urlUtils';
import { handleError, safeAsync, ErrorType } from '../../../utils/errorHandler';
import { GalleryPhoto } from '../utils/photoDataUtils';

// 从 localStorage 加载审核通过的作品
const loadApprovedPhotos = (): GalleryPhoto[] => {
  const photos = Storage.get(STORAGE_KEYS.APPROVED_PHOTOS, []);
  return photos.map((photo: any) => ({
    ...photo,
    image: ensureHttps(photo.image || ''),
    thumbnail: ensureHttps(photo.thumbnail || photo.preview || ''),
    preview: ensureHttps(photo.preview || photo.thumbnail || ''),
  }));
};

// 映射 Supabase 数据到 Gallery 照片格式
const mapSupabaseRowToGalleryPhoto = (row: any): GalleryPhoto => {
  const imageUrl = row.image_url || '';
  const thumbnailUrl = row.thumbnail_url || row.thumbnail || '';

  return {
    id: row.id,
    title: row.title || '',
    country: row.country || '',
    location: row.location || '',
    category: row.category || 'featured',
    image: ensureHttps(imageUrl),
    focal: row.focal || '50mm',
    aperture: row.aperture || 'f/2.8',
    shutter: row.shutter || '1/125s',
    iso: row.iso || '200',
    camera: row.camera || 'Unknown',
    lens: row.lens || 'Unknown',
    mood: row.tags?.split(',')[0]?.trim() || '原创作品',
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    altitude: row.altitude ?? null,
    tags: row.tags || '',
    createdAt: row.created_at || row.createdAt || null,
    thumbnail: ensureHttps(thumbnailUrl),
    hidden: row.hidden ?? false,
    shotDate: row.shot_date || null,
    rating: typeof row.rating === 'number' ? row.rating : null,
    likes: typeof row.likes === 'number' ? row.likes : 0,
  };
};

// 加载照片数据
export const usePhotoData = (supabase: any) => {
  const isSupabaseReady = Boolean(supabase);
  const [approvedPhotos, setApprovedPhotos] = useState<GalleryPhoto[]>(() =>
    isSupabaseReady ? [] : loadApprovedPhotos()
  );
  const [supabaseError, setSupabaseError] = useState('');

  // 监听 localStorage 变化（非 Supabase 模式）
  useEffect(() => {
    if (supabase) return;

    const handleStorageChange = () => {
      const loaded = loadApprovedPhotos();
      console.log('加载审核通过的照片:', loaded);
      setApprovedPhotos(loaded);
    };

    handleStorageChange();
    window.addEventListener('storage', handleStorageChange);
    const interval = setInterval(handleStorageChange, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [supabase]);

  // 从 Supabase 加载数据
  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;

    const fetchApprovedFromSupabase = async () => {
      try {
        const { data, error } = await supabase
          .from('photos')
          .select('*')
          .eq('status', 'approved')
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        if (isMounted) {
          const mapped = (data || []).map(mapSupabaseRowToGalleryPhoto);
          console.log(`从 Supabase 加载了 ${mapped.length} 张已审核通过的照片`);
          setApprovedPhotos(mapped);
          setSupabaseError('');
        }
      } catch (error) {
        const appError = handleError(error, {
          context: 'fetchApprovedFromSupabase',
          type: ErrorType.NETWORK,
        });
        if (isMounted) {
          setSupabaseError(`加载云端作品失败: ${appError.message}`);
        }
      }
    };

    fetchApprovedFromSupabase();
    const intervalId = setInterval(fetchApprovedFromSupabase, 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [supabase]);

  return { approvedPhotos, setApprovedPhotos, supabaseError };
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
          const newLikes = Math.max(0, (photo.likes || 0) + delta);
          const { error } = await supabase
            .from('photos')
            .update({ likes: newLikes })
            .eq('id', photo.id);

          if (error) {
            throw handleError(error, {
              context: 'handleToggleLike.updateLikes',
              type: ErrorType.NETWORK,
            });
          }
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
