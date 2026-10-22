import type { GalleryPhoto } from './photoDataUtils';
import { normalizePhotoCategory } from './photoCategories';
const ensureHttps = (url: string) => url.replace(/^http:\/\//, 'https://');
export const mapSupabaseRowToGalleryPhoto = (row: any): GalleryPhoto => {
  const imageUrl = row.image_url || '';
  const thumbnailUrl = row.thumbnail_url || row.thumbnail || '';
  const mood = row.tags?.split(',')[0]?.trim() || '原创作品';

  return {
    id: row.id,
    title: row.title || '',
    country: row.country || '',
    location: row.location || '',
    category: normalizePhotoCategory(row.category),
    image: ensureHttps(imageUrl),
    focal: row.focal || '50mm',
    aperture: row.aperture || 'f/2.8',
    shutter: row.shutter || '1/125s',
    iso: row.iso || '200',
    camera: row.camera || 'Unknown',
    lens: row.lens || 'Unknown',
    filmStock: row.film_stock || '',
    mood: mood === '精选' ? '原创作品' : mood,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    altitude: row.altitude ?? null,
    tags: row.tags || '',
    createdAt: row.created_at || row.createdAt || null,
    thumbnail: ensureHttps(thumbnailUrl),
    preview: thumbnailUrl ? ensureHttps(thumbnailUrl) : '',
    hidden: row.hidden ?? false,
    shotDate: row.shot_date || null,
    rating: typeof row.rating === 'number' ? row.rating : null,
    likes: typeof row.likes === 'number' ? row.likes : 0,
  };
};


