import { useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { Map, ScrollView, Text, View, Button } from '@tarojs/components'
import type { GalleryPhoto, LocationGroup } from '../../../packages/shared/photoDataUtils'
import { buildCityPhotoMap, buildCurationGroups, buildPhotosByLocation } from '../../../packages/shared/photoDataUtils'
import { toMapCoordinates } from '../platform/coordinates'
import PhotoImage from './PhotoImage'
import { storage } from '../platform/storage'
import { MAP_DISPLAY_STORAGE_KEY, DEFAULT_MAP_DISPLAY } from '../../../packages/shared/adminSettings'
import { EXPLORE_MARKER_COLORS, EXPLORE_MARKER_TARGET_SIZE } from '../../../packages/shared/exploreMarkerStyle'
export default function ExploreView({ photos, onOpen }: { photos: GalleryPhoto[]; onOpen: (photo: GalleryPhoto) => void }) {
  const groups = useMemo(() => buildPhotosByLocation(photos.filter(photo => photo.latitude != null && photo.longitude != null)), [photos])
  const cities = useMemo(() => buildCurationGroups(buildCityPhotoMap(photos)), [photos])
  const [selected, setSelected] = useState<LocationGroup | null>(null)
  const [cityPhotos, setCityPhotos] = useState<GalleryPhoto[]>([])
  const [citiesExpanded, setCitiesExpanded] = useState(false)
  const [center, setCenter] = useState({ latitude: 35, longitude: 105 })
  const [scale, setScale] = useState(4)
  const [mapDisplay, setMapDisplay] = useState(storage.get(MAP_DISPLAY_STORAGE_KEY, DEFAULT_MAP_DISPLAY))
  useEffect(() => { const update = () => setMapDisplay(storage.get(MAP_DISPLAY_STORAGE_KEY, DEFAULT_MAP_DISPLAY)); Taro.eventCenter.on('pic4pick:map-display', update); return () => { Taro.eventCenter.off('pic4pick:map-display', update) } }, [])
  const markers = groups.map((group, index) => ({ id: index + 1, ...toMapCoordinates(group.lat, group.lng), width: EXPLORE_MARKER_TARGET_SIZE, height: EXPLORE_MARKER_TARGET_SIZE, anchor: { x: 0.5, y: 0.5 },
    iconPath: `/assets/map-dots/${EXPLORE_MARKER_COLORS[index % EXPLORE_MARKER_COLORS.length].slice(1)}.png`, callout: { content: `${group.location || group.country} · ${group.photos.length} 张`, display: 'BYCLICK' as const, padding: 10, borderRadius: 10,
      color: '#344b5a', fontSize: 12, anchorX: 0, anchorY: 0, borderWidth: 1, borderColor: '#bccbd5', bgColor: '#f2f5f8', textAlign: 'center' as const } }))
  const openMarker = (id: number) => { const group = groups[id - 1]; if (group) { setSelected(group); setCityPhotos([]); setCitiesExpanded(false); setCenter(toMapCoordinates(group.lat, group.lng)); setScale(12) } }
  const displayed = selected?.photos || cityPhotos
  return <View className='explore'>
    <Map id='explore-map' className='explore-map' latitude={center.latitude} longitude={center.longitude} scale={scale} markers={markers} showLocation {...(__PIC4PICK_CONFIG__.tencentMapStyle || {})} enableSatellite={mapDisplay.satellite} enableTraffic={mapDisplay.traffic} onError={() => { void Taro.showToast({ title: '地图加载失败，请检查网络与地图权限', icon: 'none' }) }}
      onAbilityFailed={event => { if (__PIC4PICK_CONFIG__.tencentMapStyle && event.detail.ability === 'layer-style') void Taro.showToast({ title: '地图样式未生效，请联系管理员', icon: 'none' }) }}
      onMarkerTap={event => openMarker(Number(event.detail.markerId))} onCalloutTap={event => openMarker(Number(event.detail.markerId))} />
    {!groups.length && <View className='explore-empty muted'>暂无带坐标的公开作品</View>}
    <View className='city-drawer'>
      <Button id='cities-toggle' className='city-drawer-toggle' ariaLabel={citiesExpanded ? '收起城市列表' : '展开城市列表'} onClick={() => setCitiesExpanded(!citiesExpanded)}><View><Text className='drawer-title'>照片足迹</Text><Text className='muted drawer-subtitle'>点击地图标记，或按城市浏览</Text></View><Text className='drawer-action'>{citiesExpanded ? '收起⌄' : '展开⌃'}</Text></Button>
      {citiesExpanded && <><ScrollView scrollY className='city-panel'>
      {cities.map(group => <View key={group.id}><View className='section-title'>{group.title} <Text className='muted'>{group.totalCount}</Text></View><View className='city-grid'>
        {group.items.map(city => <View className='city-card' key={city.id} onClick={() => { setSelected(null); setCityPhotos(city.photos); setCitiesExpanded(false); if (city.lat != null && city.lng != null) { setCenter(toMapCoordinates(city.lat, city.lng)); setScale(10) } }}>
          {city.photos[0] && <PhotoImage photo={city.photos[0]} />}<View className='city-caption'><Text>{city.label}</Text><Text>{city.photoCount} 张作品</Text></View>
        </View>)}
      </View></View>)}
      </ScrollView><Button className='explore-admin muted' onClick={() => Taro.navigateTo({ url: '/admin/pages/index' })}>Light of Anthony · 管理</Button></>}
    </View>
    {!!displayed.length && <View className='location-panel'><View className='row'><Text className='location-title'>{selected?.location || displayed[0].location || '地点作品'}</Text><Button id='location-close' ariaLabel='关闭地点作品' onClick={() => { setSelected(null); setCityPhotos([]) }}>×</Button></View><ScrollView scrollX className='location-photos'>{displayed.map(photo => <View className='location-photo' key={photo.id} onClick={() => onOpen(photo)}><PhotoImage photo={photo} /><Text>{photo.title}</Text></View>)}</ScrollView></View>}
  </View>
}
