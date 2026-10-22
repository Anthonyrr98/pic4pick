import { useState } from 'react'
import { Image, Text, View } from '@tarojs/components'
import type { GalleryPhoto } from '../../../packages/shared/photoDataUtils'
import { preview, fallbacks } from '../platform/media'
export default function PhotoImage({ photo, detail = false }: { photo: GalleryPhoto; detail?: boolean }) {
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  let urls: string[] = []
  try { urls = [...new Set([preview(photo, detail), ...fallbacks(photo, detail)].filter(Boolean))] } catch { /* Render the real missing-source error. */ }
  if (!urls[index]) return <View className='image-failure'><Text>图片加载失败</Text></View>
  return <Image className={`photo-image ${loaded ? 'loaded' : ''}`} src={urls[index]} mode={detail ? 'aspectFit' : 'aspectFill'} lazyLoad={!detail}
    onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setIndex(index + 1) }} />
}
