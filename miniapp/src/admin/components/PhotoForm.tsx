import Taro from '@tarojs/taro'
import { Button, Input, Picker, Text, View } from '@tarojs/components'
import { PHOTO_CATEGORIES } from '../../../../packages/shared/photoCategories'
import { fromMapCoordinates } from '../../platform/coordinates'
export const emptyForm: Record<string, any> = {
  title: '', country: '', location: '', category: 'latest', tags: '', shot_date: '',
  camera: '', lens: '', focal: '', aperture: '', shutter: '', iso: '', film_stock: '',
  latitude: '', longitude: '', altitude: '', rating: '',
}
const fields = [['title', '标题'], ['country', '国家 / 省份'], ['location', '地点'], ['tags', '标签'], ['camera', '相机'], ['lens', '镜头'],
  ['focal', '焦距'], ['aperture', '光圈'], ['shutter', '快门'], ['iso', 'ISO'], ['film_stock', '胶卷'], ['latitude', '纬度'], ['longitude', '经度'], ['altitude', '海拔'], ['rating', '评分']]
export function formPayload(form: Record<string, any>) {
  const payload = { ...form }
  for (const field of ['latitude', 'longitude', 'altitude', 'rating']) {
    payload[field] = form[field] === '' || form[field] == null ? null : Number(form[field])
    if (payload[field] != null && !Number.isFinite(payload[field])) throw new Error(`${fields.find(([key]) => key === field)?.[1]}格式不正确`)
  }
  if (payload.latitude != null && Math.abs(payload.latitude) > 90) throw new Error('纬度须在 -90 到 90 之间')
  if (payload.longitude != null && Math.abs(payload.longitude) > 180) throw new Error('经度须在 -180 到 180 之间')
  if (payload.rating != null && (payload.rating < 0 || payload.rating > 5)) throw new Error('评分须在 0 到 5 之间')
  payload.shot_date = form.shot_date || null
  payload.film_stock = form.film_stock || null
  return payload
}
export default function PhotoForm({ value, onChange, gear = [] }: { value: Record<string, any>; onChange: (value: Record<string, any>) => void; gear?: any[] }) {
  const change = (field: string, next: any) => onChange({ ...value, [field]: next })
  const chooseLocation = async () => {
    try {
      const selected = await Taro.chooseLocation({})
      const coordinates = fromMapCoordinates(selected.latitude, selected.longitude)
      onChange({ ...value, ...coordinates, location: selected.name || selected.address || value.location })
    } catch (error) { if (!/cancel/.test((error as any).errMsg || '')) void Taro.showToast({ title: (error as any).errMsg || '选点失败', icon: 'none' }) }
  }
  return <View className='photo-form'>
    {fields.map(([field, label]) => <View className='form-field' key={field}><Text>{label}</Text><Input value={String(value[field] ?? '')} placeholder={label} onInput={event => change(field, event.detail.value)} />
      {['camera', 'lens'].includes(field) && gear.some(item => item.type === field) && <Picker mode='selector' range={gear.filter(item => item.type === field).map(item => item.name)} onChange={event => change(field, gear.filter(item => item.type === field)[Number(event.detail.value)].name)}><Text className='muted'>选择常用{label}</Text></Picker>}
    </View>)}
    <View className='form-field'><Text>分类</Text><Picker mode='selector' range={PHOTO_CATEGORIES.map(item => item.label)} value={Math.max(0, PHOTO_CATEGORIES.findIndex(item => item.id === value.category))} onChange={event => change('category', PHOTO_CATEGORIES[Number(event.detail.value)].id)}><View className='picker-value'>{PHOTO_CATEGORIES.find(item => item.id === value.category)?.label || value.category}</View></Picker></View>
    <View className='form-field'><Text>拍摄日期</Text><Picker mode='date' value={value.shot_date || ''} onChange={event => change('shot_date', event.detail.value)}><View className='picker-value'>{value.shot_date || '选择日期'}</View></Picker><Button onClick={() => change('shot_date', '')}>清空日期</Button></View>
    <Button onClick={() => void chooseLocation()}>地图搜索 / 选点</Button>
  </View>
}
