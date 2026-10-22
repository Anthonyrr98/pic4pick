import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEnvSetting, inferWebMapPreset, mapPresetPatch } from '../../packages/shared/adminSettings'
test('editing visible configuration fields preserves unknown and legacy settings', () => {
  const next = buildEnvSetting({ future_setting: true, VITE_AMAP_KEY: 'legacy' }, { VITE_API_BASE_URL: ' https://api.example ' }, 'satellite_roads')
  assert.equal(next.future_setting, true); assert.equal(next.VITE_AMAP_KEY, 'legacy')
  assert.equal(next.VITE_API_BASE_URL, 'https://api.example'); assert.equal(next.VITE_GAODE_RASTER_STYLE, '7')
})
test('web map selection preserves the original high-level provider contract', () => {
  assert.equal(inferWebMapPreset({ VITE_MAP_USE_AMAP_SDK: 'true', VITE_AMAP_MAP_STYLE: 'amap://styles/fresh' }), 'js_fresh')
  assert.equal(mapPresetPatch('js_dark').VITE_MAP_USE_AMAP_SDK, 'true')
  assert.equal(mapPresetPatch('street').VITE_MAP_USE_AMAP_SDK, '')
})
test('client settings reject both secret and service_role key formats', () => {
  assert.throws(() => buildEnvSetting({}, { VITE_SUPABASE_ANON_KEY: 'sb_secret_private' }, 'street'), /公开|anon/)
  const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')
  assert.throws(() => buildEnvSetting({}, { VITE_SUPABASE_ANON_KEY: `header.${payload}.signature` }, 'street'), /service_role/)
})

test('JWT role validation works without browser atob in the mini program runtime', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'atob')
  try {
    Object.defineProperty(globalThis, 'atob', { value: undefined, configurable: true })
    const payload = Buffer.from(JSON.stringify({ role: 'service_role', note: '中文' })).toString('base64url')
    assert.throws(() => buildEnvSetting({}, { VITE_SUPABASE_ANON_KEY: `header.${payload}.signature` }, 'street'), /service_role/)
    const publicPayload = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')
    assert.equal(buildEnvSetting({}, { VITE_SUPABASE_ANON_KEY: `header.${publicPayload}.signature` }, 'street').VITE_SUPABASE_ANON_KEY, `header.${publicPayload}.signature`)
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'atob', descriptor)
    else Reflect.deleteProperty(globalThis, 'atob')
  }
})
