import type { GalleryPhoto } from './photoDataUtils'
import { PHOTO_CATEGORIES } from './photoCategories'
export function formatPhotoBadge(photo: GalleryPhoto) {
  const mood = String(photo.mood || '').trim()
  const categoryLabel = PHOTO_CATEGORIES.find(category => category.id === String(photo.category || '').trim())?.label || ''
  if (mood.toLowerCase().startsWith('film_stock:')) return mood.slice('film_stock:'.length).trim() || categoryLabel || '胶片'
  if (mood && mood !== '未分类' && mood !== '原创作品') return mood
  return categoryLabel || '未分类'
}
