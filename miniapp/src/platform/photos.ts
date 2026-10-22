import { PHOTO_SELECT_FIELDS } from '../../../packages/shared/photoFields'
import { mapSupabaseRowToGalleryPhoto } from '../../../packages/shared/photoMapper'
import { api, readTable } from './request'
export async function loadPhotos() {
  const params = { select: PHOTO_SELECT_FIELDS, status: 'eq.approved', order: 'created_at.desc', limit: '1000' }
  let rows: any[]
  try { rows = await readTable<any[]>('photos', params) }
  catch (error) {
    if (!/statement timeout/i.test((error as Error).message)) throw error
    const fallback = { select: params.select, status: params.status, limit: params.limit }
    rows = await readTable<any[]>('photos', fallback)
  }
  return rows.map(mapSupabaseRowToGalleryPhoto).filter(photo => !photo.hidden)
}
export async function likePhoto(id: string, delta: number) {
  return api<{ success: boolean; data: { id: string; likes: number } }>(`/api/photos/${encodeURIComponent(id)}/likes`, 'POST', { delta })
}
export async function loadBrand() {
  const rows = await readTable<any[]>('brand_settings', { select: 'logo_data,logo_url,site_title,site_subtitle,admin_title,admin_subtitle', id: 'eq.camarts_brand', limit: '1' })
  return rows[0] || null
}
