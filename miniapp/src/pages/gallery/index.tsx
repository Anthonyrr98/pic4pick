import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Taro, { useLoad, usePullDownRefresh, useReachBottom, useShareAppMessage, useDidShow, useDidHide } from '@tarojs/taro'
import { Button, Image, ScrollView, Text, View, type ITouchEvent } from '@tarojs/components'
import type { GalleryPhoto } from '../../../../packages/shared/photoDataUtils'
import { filterAndSortPhotos, type FilterType } from '../../../../packages/shared/photoFilterUtils'
import { calculateDistance, decimalToDMS } from '../../../../packages/shared/geoUtils'
import { getShotTimeInfo } from '../../../../packages/shared/timeUtils'
import { PHOTO_CATEGORIES } from '../../../../packages/shared/photoCategories'
import { formatPhotoBadge } from '../../../../packages/shared/photoBadge'
import PhotoImage from '../../components/PhotoImage'
import ExploreView from '../../components/ExploreView'
import SpatialScene from '../../components/SpatialScene'
import { loadBrand, loadPhotos, likePhoto } from '../../platform/photos'
import { saveOriginal, preview } from '../../platform/media'
import { storage, STORAGE_KEYS } from '../../platform/storage'
import { useDetailGeo } from '../../platform/useDetailGeo'
import { createSpatialSession, prefetchSpatialDepth, type SpatialSession } from '../../platform/spatial'
import './index.scss'

function navigationBottom() {
  try {
    return Math.max(Taro.getMenuButtonBoundingClientRect().bottom, (Taro.getWindowInfo().statusBarHeight || 0) + 44)
  } catch { return 64 }
}

export default function Gallery() {
  const [navigationInset, setNavigationInset] = useState(navigationBottom)
  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState('')
  const [brand, setBrand] = useState<any>(null)
  const [filter, setFilter] = useState<FilterType>('latest')
  const [view, setView] = useState(storage.get(STORAGE_KEYS.ACTIVE_VIEW, 'gallery-view'))
  const [theme, setTheme] = useState(storage.get(STORAGE_KEYS.THEME, 'paper'))
  const [themeMenu, setThemeMenu] = useState(false)
  const [developmentPreview] = useState(() => { try { return Taro.getAccountInfoSync().miniProgram.envVersion === 'develop' } catch { return false } })
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null)
  const [limit, setLimit] = useState(24)
  const [detailId, setDetailId] = useState('')
  const [spatial, setSpatial] = useState(false)
  const [foreground, setForeground] = useState(true)
  const prefetchSession = useRef<SpatialSession | null>(null)
  const [liked, setLiked] = useState<string[]>(storage.get(STORAGE_KEYS.LIKED_PHOTOS, []))
  const pendingLikes = useRef(new Set<string>())
  const shareId = useRef('')
  const lastFetch = useRef(0)
  const fetchGeneration = useRef(0)
  const swipeStart = useRef(0)
  const notify = (message: string) => Taro.showToast({ title: message, icon: 'none', duration: 3000 })
  const reload = useCallback(async () => {
    const generation = ++fetchGeneration.current
    setLoading(true); setError('')
    try {
      const data = await loadPhotos()
      if (generation !== fetchGeneration.current) return
      setPhotos(data); setHasLoaded(true); lastFetch.current = Date.now()
      if (shareId.current) {
        if (data.some(photo => photo.id === shareId.current)) setDetailId(shareId.current)
        else setError('分享的作品不存在或尚未公开')
        shareId.current = ''
      }
      try { const record = await loadBrand(); if (generation === fetchGeneration.current) setBrand(record) }
      catch (brandError) { if (generation === fetchGeneration.current) setError(`品牌读取失败：${(brandError as Error).message}`) }
    } catch (failure) { if (generation === fetchGeneration.current) setError((failure as Error).message) }
    finally { if (generation === fetchGeneration.current) setLoading(false); Taro.stopPullDownRefresh() }
  }, [])
  useLoad(query => { shareId.current = query.photoId || '' })
  useEffect(() => { void reload(); return () => { fetchGeneration.current += 1 } }, [reload])
  useEffect(() => { const update = () => setNavigationInset(navigationBottom()); Taro.onWindowResize(update); return () => Taro.offWindowResize(update) }, [])
  useDidShow(() => { setForeground(true); if (lastFetch.current && Date.now() - lastFetch.current >= 60000) void reload() })
  useDidHide(() => { prefetchSession.current?.cancel(); setForeground(false); setSpatial(false) })
  usePullDownRefresh(() => { void reload() })
  useReachBottom(() => setLimit(previous => previous + 24))
  const sorted = useMemo(() => filterAndSortPhotos(photos, filter, location, calculateDistance), [photos, filter, location])
  const detail = photos.find(photo => photo.id === detailId)
  useEffect(() => {
    if (!detail || !foreground) return
    const session = createSpatialSession()
    prefetchSession.current = session
    void prefetchSpatialDepth(detail.id, session).catch(() => {})
    return () => { session.cancel(); if (prefetchSession.current === session) prefetchSession.current = null }
  }, [detailId, foreground])
  const geo = useDetailGeo(foreground ? detail : undefined)
  const distance = geo.latitude != null && geo.longitude != null ? calculateDistance(location?.lat ?? 39.9042, location?.lon ?? 116.4074, geo.latitude, geo.longitude) : null
  useShareAppMessage(() => ({
    title: detail?.title || brand?.site_title || 'Light of Anthony',
    path: `/pages/gallery/index${detail ? `?photoId=${encodeURIComponent(detail.id)}` : ''}`,
    imageUrl: detail ? preview(detail) : undefined,
  }))
  const chooseFilter = async (value: FilterType) => {
    setFilter(value); setLimit(24)
    if ((value === 'nearby' || value === 'far') && !location) {
      try { const position = await Taro.getLocation({ type: 'wgs84' }); setLocation({ lat: position.latitude, lon: position.longitude }) }
      catch { void notify('未获得定位，按最新作品展示') }
    }
  }
  const toggleLike = async (photo: GalleryPhoto) => {
    if (pendingLikes.current.has(photo.id)) return
    pendingLikes.current.add(photo.id)
    const wasLiked = liked.includes(photo.id)
    try {
      const result = await likePhoto(photo.id, wasLiked ? -1 : 1)
      setPhotos(previous => previous.map(item => item.id === photo.id ? { ...item, likes: result.data.likes } : item))
      setLiked(previous => { const next = wasLiked ? previous.filter(id => id !== photo.id) : [...previous, photo.id]; storage.set(STORAGE_KEYS.LIKED_PHOTOS, next); return next })
    } catch (failure) { void notify((failure as Error).message) }
    finally { pendingLikes.current.delete(photo.id) }
  }
  const adjacent = (direction: number) => {
    setSpatial(false)
    const sequence = sorted.some(photo => photo.id === detailId) ? sorted : photos
    const index = sequence.findIndex(photo => photo.id === detailId)
    if (sequence.length) setDetailId(sequence[(index + direction + sequence.length) % sequence.length].id)
  }
  return <View className={`page-shell theme-${theme}${view === 'explore-view' ? ' gallery-explore' : ''}`} style={{ '--navigation-bottom': `${navigationInset}px` } as CSSProperties}>
    <View className='app-header'>
      <View className='brand' onLongPress={() => Taro.navigateTo({ url: '/admin/pages/index' })}>
        {brand?.logo_data || brand?.logo_url ? <Image className='brand-logo' src={brand.logo_data || brand.logo_url} mode='aspectFit' /> : <View className='logo-mark' />}
        <Image className='brand-wordmark' src='/assets/loa-cropped.png' mode='aspectFit' />
      </View>
      <View className='row header-actions'>
        <Button className='theme-button' onClick={() => setThemeMenu(!themeMenu)}>◐</Button>
        <View className='view-toggle'>{[['gallery-view', '图库'], ['explore-view', '发现']].map(([value, label]) => <Text id={`view-${value}`} key={value} className={view === value ? 'active' : ''} onClick={() => { setView(value); storage.set(STORAGE_KEYS.ACTIVE_VIEW, value) }}>{label}</Text>)}</View>
      </View>
    </View>
    {themeMenu && <View className='theme-menu'>{[['paper', '纸白画廊', 'PAPER GALLERY'], ['film', '暖调胶片', 'WARM ANALOG']].map(([value, name, english]) => <View id={`theme-${value}`} className={`theme-choice ${theme === value ? 'selected' : ''}`} key={value} onClick={() => { setTheme(value); storage.set(STORAGE_KEYS.THEME, value); setThemeMenu(false) }}><Text>{name}</Text><Text className='muted'>{english}</Text></View>)}</View>}
    {error && <View className='error-message'><Text>{/url not in domain list/i.test(error) ? '微信尚未允许访问作品服务，请检查服务器域名配置。' : error}</Text>{developmentPreview && /url not in domain list/i.test(error) && <Text className='preview-network-hint'>开发预览可在右上角菜单打开调试后重新进入。</Text>}<Button onClick={() => void reload()}>重试</Button></View>}
    {view === 'gallery-view' ? <>
      <View className='tab-strip'>{PHOTO_CATEGORIES.map(tab => <Text id={`filter-${tab.id}`} key={tab.id} className={`tab ${filter === tab.id ? 'active' : ''}`} onClick={() => void chooseFilter(tab.id as FilterType)}>{tab.label}</Text>)}</View>
      <Text className='gallery-count muted'>{hasLoaded ? `${sorted.length} 张作品` : '作品尚未加载'}</Text>
      {loading && !photos.length ? <View className='status'>正在加载作品…</View> : !hasLoaded ? <View className='status'>作品加载失败，请重试</View> : !sorted.length ? <View className='status'>暂无公开作品</View> : <View className='gallery-grid'>{sorted.slice(0, limit).map(photo => <View className='photo-card' key={photo.id} onClick={() => setDetailId(photo.id)}>
        <PhotoImage photo={photo} />
        <Text className='badge'>{formatPhotoBadge(photo)}</Text>
        <View className='caption'><Text className='photo-title'>{photo.title}</Text><Text>{[photo.country, photo.location].filter(Boolean).join(' · ')}</Text></View>
        <View className={`like-badge ${liked.includes(photo.id) ? 'liked' : ''}`} onClick={event => { event.stopPropagation(); void toggleLike(photo) }}><Text>{liked.includes(photo.id) ? '♥' : '♡'} {photo.likes}</Text></View>
      </View>)}</View>}
      {limit < sorted.length && <Button className='load-more' onClick={() => setLimit(limit + 24)}>加载更多</Button>}
    </> : hasLoaded ? <ExploreView photos={photos} onOpen={photo => setDetailId(photo.id)} /> : <View className='status'>{loading ? '正在加载作品…' : '作品加载失败，请重试'}</View>}
    {view === 'gallery-view' && <View className='gallery-footer muted' onClick={() => Taro.navigateTo({ url: '/admin/pages/index' })}><Text>Light of Anthony · 管理</Text></View>}
    {detail && <View className='lightbox' catchMove onTouchStart={rawEvent => { const event = rawEvent as ITouchEvent; swipeStart.current = event.touches[0]?.clientX || 0 }} onTouchEnd={rawEvent => { const event = rawEvent as ITouchEvent; const distance = (event.changedTouches[0]?.clientX || 0) - swipeStart.current; if (Math.abs(distance) > 80) adjacent(distance < 0 ? 1 : -1) }}>
      <View className='lightbox-toolbar'><Button id='detail-close' onClick={() => { setDetailId(''); setSpatial(false) }}>×</Button><Button id='detail-spatial' onClick={() => setSpatial(!spatial)}>空间效果</Button><Button onClick={() => void saveOriginal(detail).then(() => notify('已保存原图')).catch(failure => notify(failure.message || failure.errMsg || '保存失败'))}>保存原图</Button><Button openType='share'>分享</Button></View>
      <View className='lightbox-media'><PhotoImage key={detail.id} photo={detail} detail />{spatial && <SpatialScene key={detail.id} photo={detail} onClose={() => setSpatial(false)} />}</View>
      <View className='lightbox-navigation'><Button id='detail-previous' onClick={() => adjacent(-1)}>‹</Button><Text>{detail.title}</Text><Button id='detail-next' onClick={() => adjacent(1)}>›</Button></View>
      <ScrollView scrollY className='lightbox-meta'>
        <Text className='serif detail-title'>{detail.title}</Text><Text className='detail-location'>{[detail.country, detail.location].filter(Boolean).join(' · ')}</Text>
        <View className='meta-grid'>{[['相机', detail.camera], ['镜头', detail.lens], ['焦距', detail.focal], ['光圈', detail.aperture], ['快门', detail.shutter], ['ISO', detail.iso], ['胶卷', detail.filmStock], ['拍摄日期', getShotTimeInfo(detail.shotDate).dateText], ['经纬度', geo.latitude != null && geo.longitude != null ? `${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)}` : '未设置'], ['方位', geo.latitude != null && geo.longitude != null ? `${decimalToDMS(geo.latitude, true)} ${decimalToDMS(geo.longitude, false)}` : '未设置'], ['海拔', geo.altitude != null ? `${geo.altitude.toFixed(0)} m` : '未设置'], [location ? '距当前位置' : '距北京', distance != null ? `${distance.toLocaleString()} km` : '未设置']].map(([label, value]) => <View key={label}><Text className='muted'>{label}</Text><Text>{value || '未设置'}</Text></View>)}</View>
        {geo.altitudeSource === 'terrain' && <Text className='terrain-source muted'>地形海拔参考：Open-Meteo / Copernicus DEM</Text>}
        <Button onClick={() => void toggleLike(detail)}>{liked.includes(detail.id) ? '♥ 已喜欢' : '♡ 喜欢'} · {detail.likes}</Button>
      </ScrollView>
    </View>}
  </View>
}
