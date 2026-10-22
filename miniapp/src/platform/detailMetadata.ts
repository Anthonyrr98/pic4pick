import Taro from '@tarojs/taro'
import exifr from 'exifr'
import type { GalleryPhoto } from '../../../packages/shared/photoDataUtils'
import { resolveDetailGeo, type ExifGeo } from '../../../packages/shared/detailGeo'
import { getOriginalMediaUrl } from '../../../packages/shared/mediaUrls'
import { absoluteMedia } from './media'
import { request, type Cancellation } from './request'

const exifCache = new Map<string, ExifGeo | null>()
function active(session: Cancellation) { if (session.cancelled) throw new Error('拍摄信息读取已取消') }
export function createMetadataSession() {
  const session = { cancelled: false, aborts: [] as Array<() => void>, cancel() { this.cancelled = true; for (const abort of this.aborts.splice(0)) abort() } }
  return session
}
async function readExif(photo: GalleryPhoto, session: Cancellation): Promise<ExifGeo | null> {
  const url = absoluteMedia(getOriginalMediaUrl(photo))
  if (exifCache.has(url)) return exifCache.get(url) || null
  let path = '', abort: (() => void) | undefined
  const fs = Taro.getFileSystemManager()
  try {
    active(session)
    const task = Taro.downloadFile({ url, timeout: 30000 })
    abort = () => task.abort(); session.aborts.push(abort)
    const response = await task
    path = response.tempFilePath
    active(session)
    if (response.statusCode !== 200) throw new Error(`EXIF 原图读取失败 (${response.statusCode})`)
    const size = await new Promise<number>((resolve, reject) => fs.stat({ path, success: result => resolve((result.stats as { size: number }).size), fail: reject }))
    if (size > 100 * 1024 * 1024) throw new Error('EXIF 原图超过项目的 100 MB 限制')
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => fs.readFile({ filePath: path, success: result => resolve(result.data as ArrayBuffer), fail: reject }))
    active(session)
    const parsed = await exifr.parse(bytes, { gps: true })
    active(session)
    const geo = parsed ? { latitude: parsed.latitude, longitude: parsed.longitude,
      GPSAltitude: parsed.GPSAltitudeRef === 1 ? -Math.abs(parsed.GPSAltitude) : parsed.GPSAltitude } : null
    exifCache.set(url, geo)
    if (exifCache.size > 10) exifCache.delete(exifCache.keys().next().value!)
    return geo
  } finally {
    if (abort) session.aborts = session.aborts.filter(item => item !== abort)
    // Delete only the temporary file returned by this download; never touch saved originals.
    if (path) fs.unlink({ filePath: path, fail: () => {} })
  }
}
export async function loadDetailGeo(photo: GalleryPhoto, session: Cancellation) {
  let exif: ExifGeo | null = null
  try { exif = await readExif(photo, session) } catch { active(session) }
  const geo = resolveDetailGeo(photo, exif)
  if (geo.altitude != null || geo.latitude == null || geo.longitude == null) return geo
  try {
    const result = await request<{ elevation: number[] }>(`https://api.open-meteo.com/v1/elevation?latitude=${geo.latitude}&longitude=${geo.longitude}`, 'GET', undefined, {}, session)
    active(session)
    return resolveDetailGeo(photo, exif, result.elevation?.[0])
  } catch { active(session); return geo }
}
