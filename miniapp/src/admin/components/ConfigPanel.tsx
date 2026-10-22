import { useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Input, Switch, Text, View } from '@tarojs/components'
import { api } from '../../platform/request'
import { storage } from '../../platform/storage'
import { DEFAULT_BRAND_TEXT, DEFAULT_MAP_DISPLAY, ENV_SETTING_FIELDS, MAP_DISPLAY_STORAGE_KEY, buildEnvSetting, inferWebMapPreset } from '../../../../packages/shared/adminSettings'
import { MAP_STYLE_PRESETS } from '../../../../packages/shared/mapStylePresets'

export default function ConfigPanel({ brand, gear, onRefresh }: { brand: any; gear: any[]; onRefresh: () => Promise<void> }) {
  const [section, setSection] = useState('env')
  const [textForm, setTextForm] = useState<Record<string, string>>({ ...DEFAULT_BRAND_TEXT, ...brand })
  const [logoUrl, setLogoUrl] = useState(brand?.logo_url || '')
  const [logoPreview, setLogoPreview] = useState(brand?.logo_data || brand?.logo_url || '')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [envLoaded, setEnvLoaded] = useState(false)
  const [originalEnv, setOriginalEnv] = useState<Record<string, any>>({})
  const [envForm, setEnvForm] = useState<Record<string, string>>({})
  const [webMapPreset, setWebMapPreset] = useState('street')
  const [mapDisplay, setMapDisplay] = useState(storage.get(MAP_DISPLAY_STORAGE_KEY, DEFAULT_MAP_DISPLAY))
  const [gearType, setGearType] = useState('camera')
  const [gearName, setGearName] = useState('')
  const operationLock = useRef(false)
  const loadEnv = async () => {
    const result = await api<{ data: { data?: Record<string, any> } | null }>('/api/admin/app-settings/env_config', 'GET', undefined, true)
    const env = result.data?.data || {}
    setOriginalEnv(env)
    setEnvForm(Object.fromEntries(ENV_SETTING_FIELDS.map(([key]) => [key, String(env[key] || (key === 'VITE_AMAP_WEB_KEY' || key === 'VITE_AMAP_WEB_SERVICE_KEY' ? env.VITE_AMAP_KEY || '' : ''))])))
    setWebMapPreset(inferWebMapPreset(env)); setEnvLoaded(true)
  }
  useEffect(() => { let cancelled = false; loadEnv().catch(failure => { if (!cancelled) setMessage(`配置读取失败：${failure.message}`) }); return () => { cancelled = true } }, [])
  const work = async (action: () => Promise<string>, refreshBrand = false) => {
    if (operationLock.current) return
    operationLock.current = true; setBusy(true); setMessage('')
    try {
      const result = await action()
      if (refreshBrand) { try { await onRefresh() } catch (failure) { setMessage(`${result}；列表刷新失败：${(failure as Error).message}`); return } }
      setMessage(result)
    } catch (failure) { setMessage((failure as any).message || (failure as any).errMsg || '操作失败') }
    finally { operationLock.current = false; setBusy(false) }
  }
  const saveEnv = async () => {
    if (!envLoaded) throw new Error('请先成功读取云端配置')
    const data = buildEnvSetting(originalEnv, envForm, webMapPreset)
    await api('/api/admin/app-settings/env_config', 'PUT', { data }, true)
    setOriginalEnv(data)
    return '网页环境和地图配置已保存。网页重新读取配置后生效。'
  }
  const chooseLogo = async () => {
    const result = await Taro.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album'], sizeType: ['original'] })
    const selected = result.tempFiles[0]
    if (selected.size > 1024 * 1024) throw new Error('Logo 文件不能超过 1 MB')
    const info = await Taro.getImageInfo({ src: selected.tempFilePath })
    const type = info.type.toLowerCase().replace('jpg', 'jpeg')
    if (!['jpeg', 'png', 'webp'].includes(type)) throw new Error('请选择 JPG、PNG 或 WEBP Logo')
    const encoded = await new Promise<string>((resolve, reject) => Taro.getFileSystemManager().readFile({ filePath: selected.tempFilePath, encoding: 'base64', success: file => resolve(file.data as string), fail: reject }))
    const dataUrl = `data:image/${type};base64,${encoded}`
    await api('/api/admin/brand-settings/camarts_brand', 'PUT', { logo_data: dataUrl, logo_mime: `image/${type}` }, true)
    setLogoPreview(dataUrl)
    return 'Logo 已上传并同步到云端'
  }
  const resetEnv = async () => {
    const answer = await Taro.showModal({ title: '重置网页配置', content: '恢复网页默认服务配置和地图样式？', confirmText: '重置' })
    if (!answer.confirm) return '已取消重置'
    await api('/api/admin/app-settings/env_config', 'PUT', { data: {} }, true)
    setOriginalEnv({}); setEnvForm({}); setWebMapPreset('street')
    return '网页配置已重置为默认值'
  }
  return <View className='config-panel'>
    <View className='settings-tabs'>{[['env', '环境变量'], ['map-style', '地图样式'], ['logo', '品牌 Logo'], ['brand-text', '品牌标题'], ['gear', '常用器材']].map(([value, label]) => <Button key={value} disabled={busy} className={section === value ? 'primary' : ''} onClick={() => setSection(value)}>{label}</Button>)}</View>
    {message && <View className='admin-message'>{message}</View>}
    {section === 'env' && <View className='settings-card'><Text className='section-title'>环境变量配置</Text><Text className='muted'>管理网页已有的服务配置。小程序当前访问地址由构建配置指定，保存这里不会切换小程序连接。</Text>
      {!envLoaded && <Button disabled={busy} onClick={() => void work(async () => { await loadEnv(); return '云端配置已读取' })}>读取云端配置</Button>}
      {ENV_SETTING_FIELDS.map(([key, label]) => <View className='form-field' key={key}><Text>{label}</Text><Input disabled={!envLoaded || busy} value={envForm[key] || ''} onInput={event => setEnvForm({ ...envForm, [key]: event.detail.value })} /></View>)}
      <View className='row'><Button className='primary' disabled={busy || !envLoaded} onClick={() => void work(saveEnv)}>保存配置</Button><Button disabled={busy || !envLoaded} onClick={() => void work(resetEnv)}>重置为默认</Button></View>
    </View>}
    {section === 'map-style' && <View className='settings-card'><Text className='section-title'>网页地图样式</Text><Text className='muted'>以下样式供网页高德 / MapLibre 使用。保存“远山黛”不会更改微信原生底图。</Text><View className='map-style-grid'>
      {MAP_STYLE_PRESETS.map(preset => <View key={preset.id} className={`map-style-option ${webMapPreset === preset.id ? 'selected' : ''}`} onClick={() => { if (!busy) setWebMapPreset(preset.id) }}><Image className='map-style-preview' src={preset.kind === 'amap-js' ? `/assets/map-presets/${preset.id}.png` : preset.thumbnail} mode='aspectFill' /><Text>{preset.label}{preset.kind === 'amap-js' ? ' · JS' : ''}</Text><Text className='muted'>{preset.description}</Text></View>)}
    </View><Button className='primary' disabled={busy || !envLoaded} onClick={() => void work(saveEnv)}>保存网页地图样式</Button>
      <Text className='section-title'>本设备微信地图</Text>
      <Text className='muted'>{__PIC4PICK_CONFIG__.tencentMapStyle ? `已配置个性化样式编号 ${__PIC4PICK_CONFIG__.tencentMapStyle.layerStyle}；实际生效需微信平台授权及手机验证。` : '当前采用微信默认底图，地点标记沿用网页四色圆点；气泡和地图面板为远山黛灰蓝配色，道路与水域仍使用微信默认颜色。此方案无需开通地图个性化样式。'}</Text>
      <Text className='muted'>个性化样式用于普通底图；开启卫星底图会切换为卫星影像。</Text>
      <View className='native-map-row'><Text>卫星底图</Text><Switch checked={mapDisplay.satellite} onChange={event => setMapDisplay({ ...mapDisplay, satellite: event.detail.value })} /></View><View className='native-map-row'><Text>实时路况</Text><Switch checked={mapDisplay.traffic} onChange={event => setMapDisplay({ ...mapDisplay, traffic: event.detail.value })} /></View>
      <Button disabled={busy} onClick={() => { storage.set(MAP_DISPLAY_STORAGE_KEY, mapDisplay); Taro.eventCenter.trigger('pic4pick:map-display'); setMessage('本设备微信地图显示已保存') }}>保存本设备地图显示</Button>
    </View>}
    {section === 'logo' && <View className='settings-card'><Text className='section-title'>品牌 Logo</Text><Text className='muted'>沿用同一份品牌 Logo，文件最大 1 MB。</Text>{logoPreview ? <Image className='logo-preview' src={logoPreview} mode='aspectFit' /> : <View className='default-logo-preview' />}
      <Button className='primary' disabled={busy} onClick={() => void work(chooseLogo, true)}>选择并上传 Logo</Button>
      <View className='form-field'><Text>Logo HTTPS 地址</Text><Input value={logoUrl} onInput={event => setLogoUrl(event.detail.value)} /></View><Button disabled={busy || !/^https:\/\//.test(logoUrl.trim())} onClick={() => void work(async () => { await api('/api/admin/brand-settings/camarts_brand', 'PUT', { logo_url: logoUrl.trim(), logo_data: null, logo_mime: null }, true); setLogoPreview(logoUrl.trim()); return 'Logo 地址已保存' }, true)}>保存 Logo 地址</Button>
      <Button disabled={busy} onClick={() => void work(async () => { await api('/api/admin/brand-settings/camarts_brand', 'PUT', { logo_data: null, logo_url: null, logo_mime: null }, true); setLogoPreview(''); setLogoUrl(''); return '已恢复默认圆环 Logo，品牌标题保留' }, true)}>恢复默认 Logo</Button>
    </View>}
    {section === 'brand-text' && <View className='settings-card'><Text className='section-title'>品牌标题文案</Text>{[['site_title', '图库标题'], ['site_subtitle', '图库副标题'], ['admin_title', '管理标题'], ['admin_subtitle', '管理副标题']].map(([key, label]) => <View className='form-field' key={key}><Text>{label}</Text><Input value={textForm[key] || ''} onInput={event => setTextForm({ ...textForm, [key]: event.detail.value })} /></View>)}<View className='row'><Button disabled={busy} onClick={() => setTextForm({ ...DEFAULT_BRAND_TEXT })}>恢复默认</Button><Button disabled={busy} className='primary' onClick={() => void work(async () => { await api('/api/admin/brand-settings/camarts_brand', 'PUT', Object.fromEntries(Object.keys(DEFAULT_BRAND_TEXT).map(key => [key, textForm[key] || ''])), true); return '品牌标题已保存' }, true)}>保存标题</Button></View></View>}
    {section === 'gear' && <View className='settings-card'><Text className='section-title'>常用器材</Text><Text>{gear.map(item => `${item.type === 'camera' ? '相机' : '镜头'}：${item.name}`).join(' / ')}</Text><View className='row'><Button onClick={() => setGearType('camera')} className={gearType === 'camera' ? 'primary' : ''}>相机</Button><Button onClick={() => setGearType('lens')} className={gearType === 'lens' ? 'primary' : ''}>镜头</Button></View><Input className='search-input' placeholder='器材名称' value={gearName} onInput={event => setGearName(event.detail.value)} /><Button disabled={busy || !gearName.trim()} onClick={() => void work(async () => { await api('/api/admin/gear-presets', 'POST', { type: gearType, name: gearName.trim() }, true); setGearName(''); return '常用器材已保存' }, true)}>保存器材</Button></View>}
  </View>
}
