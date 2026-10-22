import Taro from '@tarojs/taro'
import { sha256 } from 'js-sha256'
import exifr from 'exifr'
import { api } from './request'
import { apiUrl, parseResponse } from './httpContract'
import { storage, STORAGE_KEYS } from './storage'
import { createPhotoSubmission } from '../../../packages/shared/photoSubmission'

export interface SelectedFile { path: string; name: string; size: number; id: string; metadata: Record<string, any> }
export const listAdminPhotos = async () => (await api<{ data: any[] }>('/api/admin/photos', 'GET', undefined, true)).data
export const updatePhoto = (id: string, patch: Record<string, any>) => api(`/api/admin/photos/${encodeURIComponent(id)}/update`, 'POST', patch, true)
export const deletePhoto = (id: string) => api<{ cleanup?: { pending?: boolean } }>(`/api/admin/photos/${encodeURIComponent(id)}`, 'DELETE', undefined, true)
export async function login(username: string, password: string) {
  const result = await api<{ token: string }>('/api/auth/login', 'POST', { username: username.trim(), password })
  if (!result.token) throw new Error('登录接口未返回 token')
  storage.set(STORAGE_KEYS.AUTH_TOKEN, result.token)
}
export async function verify() {
  if (!storage.get(STORAGE_KEYS.AUTH_TOKEN, '')) return false
  await api('/api/auth/verify', 'POST', undefined, true)
  return true
}
function fileBytes(path: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => Taro.getFileSystemManager().readFile({ filePath: path,
    success: result => resolve(result.data as ArrayBuffer), fail: reject }))
}
function fileSize(path: string): Promise<number> {
  return new Promise((resolve, reject) => Taro.getFileSystemManager().stat({ path, success: result => resolve((result.stats as { size: number }).size), fail: reject }))
}
async function uuid() {
  const { randomValues } = await Taro.getRandomValues({ length: 16 })
  const bytes = new Uint8Array(randomValues)
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export async function choosePhoto(): Promise<SelectedFile> {
  const result = await Taro.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['original'] })
  const selected = result.tempFiles[0]
  if (selected.size > 100 * 1024 * 1024) throw new Error('图片不能超过 100 MB，请先压缩后再上传')
  const info = await Taro.getImageInfo({ src: selected.tempFilePath })
  const ext = info.type.toLowerCase().replace('jpeg', 'jpg')
  if (!['jpg', 'png', 'webp'].includes(ext)) throw new Error('请上传 JPG、PNG 或 WEBP 图片')
  const id = await uuid()
  let metadata: Record<string, any> = {}
  // Read original bytes before applying the existing optimization strategy.
  const raw = await exifr.parse(await fileBytes(selected.tempFilePath)).catch(() => null)
  if (raw) {
    const shotDate = raw.DateTimeOriginal instanceof Date ? raw.DateTimeOriginal : null
    metadata = { camera: [raw.Make, raw.Model].filter(Boolean).join(' '), lens: raw.LensModel || '',
      focal: raw.FocalLength ? `${raw.FocalLength}mm` : '', aperture: raw.FNumber ? `f/${raw.FNumber}` : '',
      shutter: raw.ExposureTime ? (raw.ExposureTime < 1 ? `1/${Math.round(1 / raw.ExposureTime)}s` : `${raw.ExposureTime}s`) : '',
      iso: raw.ISO ? String(raw.ISO) : '', latitude: raw.latitude ?? null, longitude: raw.longitude ?? null,
      altitude: raw.GPSAltitude ?? null, shot_date: shotDate ? `${shotDate.getFullYear()}-${String(shotDate.getMonth() + 1).padStart(2, '0')}-${String(shotDate.getDate()).padStart(2, '0')}` : null }
  }
  return { path: selected.tempFilePath, name: `${id}.${ext}`, size: selected.size, id, metadata }
}
async function uploadImage(file: SelectedFile, filename: string, onProgress: any, _type: string, options: { uploadId?: string }) {
  let path = file.path
  let size = file.size
  if (size >= 6 * 1024 * 1024) {
    try {
      const info = await Taro.getImageInfo({ src: path })
      const ratio = Math.min(1, 2560 / Math.max(info.width, info.height))
      const optimized = await Taro.compressImage({ src: path, quality: 88, compressedWidth: Math.round(info.width * ratio), compressedHeight: Math.round(info.height * ratio) })
      const optimizedSize = await fileSize(optimized.tempFilePath)
      const optimizedInfo = await Taro.getImageInfo({ src: optimized.tempFilePath })
      if (optimizedInfo.type === info.type && optimizedSize > 0 && optimizedSize < size * .92) { path = optimized.tempFilePath; size = optimizedSize }
    } catch { /* Existing website policy falls back to original bytes on compression failure. */ }
  }
  return new Promise<any>((resolve, reject) => {
    const token = storage.get(STORAGE_KEYS.AUTH_TOKEN, '')
    if (!token) { reject(new Error('请先登录管理后台')); return }
    const task = Taro.uploadFile({ url: apiUrl(__PIC4PICK_CONFIG__.apiBaseUrl, '/api/upload/oss'), filePath: path, name: 'file',
      header: { Authorization: `Bearer ${token}` }, formData: { filename, uploadId: options.uploadId || '' }, timeout: 120000,
      success: response => { try { resolve(parseResponse(response.statusCode, response.data)) } catch (error) { reject(error) } }, fail: reject })
    task.onProgressUpdate(progress => onProgress?.(Math.min(98, progress.progress), progress.totalBytesSent, progress.totalBytesExpectedToSend, { stage: 'uploading' }))
  })
}
export function photoSubmission(file: SelectedFile) {
  return createPhotoSubmission({ uploadImage,
    createPhoto: async (photo: any, uploadId: string) => api('/api/admin/photos', 'POST', { ...photo, upload_id: uploadId }, true),
    storage: { get: (key: string) => storage.get(key, null), set: storage.set, remove: storage.remove },
    uuid: () => file.id as `${string}-${string}-${string}-${string}-${string}`, digest: async (selected: SelectedFile) => sha256(await fileBytes(selected.path)),
  })
}
