import { useEffect, useState, useRef } from 'react'
import { useDidHide } from '@tarojs/taro'
import type { GalleryPhoto } from '../../../packages/shared/photoDataUtils'
import { resolveDetailGeo, type DetailGeo } from '../../../packages/shared/detailGeo'
import { createMetadataSession, loadDetailGeo } from './detailMetadata'

export function useDetailGeo(photo?: GalleryPhoto) {
  const [loaded, setLoaded] = useState<{ key: string; geo: DetailGeo } | null>(null)
  const sessionRef = useRef<ReturnType<typeof createMetadataSession> | null>(null)
  useDidHide(() => { sessionRef.current?.cancel() })
  const key = photo ? `${photo.id}:${photo.image}:${photo.latitude}:${photo.longitude}:${photo.altitude}` : ''
  useEffect(() => {
    if (!photo) return
    const session = createMetadataSession()
    sessionRef.current = session
    void loadDetailGeo(photo, session).then(geo => { if (!session.cancelled) setLoaded({ key, geo }) }).catch(() => {})
    return () => { session.cancel(); if (sessionRef.current === session) sessionRef.current = null }
  }, [key])
  return loaded?.key === key ? loaded.geo : resolveDetailGeo(photo || {})
}
