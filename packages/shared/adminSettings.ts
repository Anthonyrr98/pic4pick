import { MAP_STYLE_PRESETS } from './mapStylePresets'
export const ENV_SETTING_FIELDS = [
  ['VITE_SUPABASE_URL', 'Supabase URL'], ['VITE_SUPABASE_ANON_KEY', 'Supabase 公开 Key'],
  ['VITE_API_BASE_URL', '后端 API 地址'], ['VITE_ALIYUN_OSS_BACKEND_URL', 'OSS 上传后端地址'],
  ['VITE_AMAP_WEB_KEY', '高德地图 Web Key'], ['VITE_AMAP_SECURITY_JS_CODE', '高德安全密钥'],
  ['VITE_AMAP_WEB_SERVICE_KEY', '高德 Web 服务 Key'],
] as const
export const DEFAULT_BRAND_TEXT = { site_title: 'CAMARTS', site_subtitle: 'PHOTOGRAPHY', admin_title: 'CAMARTS', admin_subtitle: 'ADMIN PANEL' }
export const MAP_DISPLAY_STORAGE_KEY = 'pic4pick_miniapp_map_display'
export const DEFAULT_MAP_DISPLAY = { satellite: false, traffic: false }
// Mini program runtimes do not consistently provide atob or Buffer.
function decodeJwtPayload(value: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const encoded = value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  if (!/^[A-Za-z0-9+/]*$/.test(encoded)) throw new Error('Invalid JWT payload')
  let bits = 0, count = 0, escaped = ''
  for (const character of encoded) {
    bits = (bits << 6) | alphabet.indexOf(character); count += 6
    if (count >= 8) {
      count -= 8
      escaped += `%${((bits >> count) & 255).toString(16).padStart(2, '0')}`
    }
  }
  return decodeURIComponent(escaped)
}
export function inferWebMapPreset(env: Record<string, any>): string {
  if (MAP_STYLE_PRESETS.some(preset => preset.id === env.VITE_MAP_STYLE_PRESET)) return env.VITE_MAP_STYLE_PRESET
  if (env.VITE_MAP_USE_AMAP_SDK === 'true') return MAP_STYLE_PRESETS.find(preset => preset.amapStyle === env.VITE_AMAP_MAP_STYLE)?.id || 'js_whitesmoke'
  return 'street'
}
export function mapPresetPatch(id: string) {
  const preset = MAP_STYLE_PRESETS.find(item => item.id === id) || MAP_STYLE_PRESETS[0]
  return { VITE_MAP_STYLE_PRESET: preset.id, VITE_GAODE_RASTER_STYLE: String(preset.rasterStyle ?? 8), VITE_MAP_USE_AMAP_SDK: preset.kind === 'amap-js' ? 'true' : '', VITE_AMAP_MAP_STYLE: preset.amapStyle ?? '' }
}
export function buildEnvSetting(original: Record<string, any>, fields: Record<string, string>, preset: string) {
  const next: Record<string, any> = { ...original, ...mapPresetPatch(preset) }
  for (const [key] of ENV_SETTING_FIELDS) next[key] = String(fields[key] || '').trim()
  const key = String(next.VITE_SUPABASE_ANON_KEY || '')
  if (/^sb_secret_/.test(key)) throw new Error('请使用 Supabase anon 或 publishable key')
  if (key.split('.').length === 3) {
    try {
      if (JSON.parse(decodeJwtPayload(key.split('.')[1])).role === 'service_role') throw new Error('客户端不能使用 service_role key')
    } catch (failure) { if (failure instanceof Error && failure.message.includes('service_role')) throw failure }
  }
  return next
}
