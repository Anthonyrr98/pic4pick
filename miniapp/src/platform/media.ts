import Taro from '@tarojs/taro'
import { getOriginalMediaUrl, getPreviewMediaUrl, getPreviewMediaFallbackUrls } from '../../../packages/shared/mediaUrls'
import type { GalleryPhoto } from '../../../packages/shared/photoDataUtils'
import { apiUrl } from './httpContract'
export const absoluteMedia = (value: string): string => {
  if (!value) return ''
  if (/^https:\/\//.test(value) || value.startsWith('data:')) return value
  if (value.startsWith('/')) return apiUrl(__PIC4PICK_CONFIG__.mediaBaseUrl || __PIC4PICK_CONFIG__.apiBaseUrl, value)
  throw new Error('图片地址不是有效的 HTTPS 地址')
}
export const preview = (photo: GalleryPhoto, detail = false) => absoluteMedia(getPreviewMediaUrl(photo, { width: detail ? 2000 : 900, quality: detail ? 92 : 90, preferOriginal: detail }))
export const fallbacks = (photo: GalleryPhoto, detail = false) => getPreviewMediaFallbackUrls(photo,
  [{ width: detail ? 1600 : 900, quality: 90 }, { width: detail ? 1080 : 720, quality: 88, format: false }]).map(absoluteMedia)
export async function saveOriginal(photo: GalleryPhoto) {
  const result = await Taro.downloadFile({ url: absoluteMedia(getOriginalMediaUrl(photo)) })
  if (result.statusCode !== 200) throw new Error(`原图下载失败 (${result.statusCode})`)
  try { await Taro.saveImageToPhotosAlbum({ filePath: result.tempFilePath }) }
  catch (error) {
    if (/auth|deny/i.test((error as { errMsg?: string }).errMsg || '')) {
      const answer = await Taro.showModal({ title: '需要相册权限', content: '请在设置中允许保存照片到相册。', confirmText: '打开设置' })
      if (answer.confirm) await Taro.openSetting()
    }
    throw error
  }
}
