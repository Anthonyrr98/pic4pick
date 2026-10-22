import test from 'node:test'
import assert from 'node:assert/strict'
import { apiUrl, parseResponse, publicReadUrl, publicReadHeaders } from '../src/platform/httpContract'
import { filterAndSortPhotos } from '../../packages/shared/photoFilterUtils'
import { calculateDistance } from '../../packages/shared/geoUtils'
import { mapSupabaseRowToGalleryPhoto } from '../../packages/shared/photoMapper'
import { toMapCoordinates, fromMapCoordinates } from '../src/platform/coordinates'

test('real HTTP errors and HTML gateway failures never become successful empty data', () => {
  assert.throws(() => parseResponse(200, '<html>gateway</html>'), /非 JSON/)
  assert.throws(() => parseResponse(401, { error: 'expired' }), /expired/)
  assert.throws(() => parseResponse(200, { success: false, error: 'failed' }), /failed/)
  assert.deepEqual(parseResponse(200, '[{"id":"real"}]'), [{ id: 'real' }])
})
test('URLs preserve the original API and public read conditions without duplicate api prefix', () => {
  assert.equal(apiUrl('https://api.example/api/', '/api/auth/login'), 'https://api.example/api/auth/login')
  assert.throws(() => apiUrl('', '/api/photos'), /HTTPS/)
  const url = new URL(publicReadUrl('https://read.example', 'photos', { select: 'id,title', status: 'eq.approved', limit: '1000' }))
  assert.equal(url.pathname, '/rest/v1/photos'); assert.equal(url.searchParams.get('status'), 'eq.approved')
})
test('public schema is explicit even when PostgREST defaults to graphql_public', () => {
  const legacy = publicReadHeaders('anon-key')
  assert.equal(legacy['Accept-Profile'], 'public'); assert.equal(legacy.Authorization, 'Bearer anon-key')
  const publishable = publicReadHeaders('sb_publishable_example')
  assert.equal(publishable['Accept-Profile'], 'public'); assert.equal(publishable.apikey, 'sb_publishable_example'); assert.equal(publishable.Authorization, undefined)
})
test('historical categories, film filtering and refused-location fallback retain website semantics', () => {
  const old = mapSupabaseRowToGalleryPhoto({ id: 'old', category: 'featured', shot_date: '2020-01-01', image_url: 'https://images.example/old.jpg' })
  const film = mapSupabaseRowToGalleryPhoto({ id: 'film', category: '胶片', shot_date: '2025-01-01' })
  assert.equal(old.category, 'latest')
  assert.deepEqual(filterAndSortPhotos([old, film], 'film', null, calculateDistance).map(photo => photo.id), ['film'])
  assert.deepEqual(filterAndSortPhotos([old, film], 'nearby', null, calculateDistance).map(photo => photo.id), ['film', 'old'])
})
test('map conversion never changes overseas coordinates and selected China points round trip to GPS', () => {
  assert.deepEqual(toMapCoordinates(48.85, 2.35), { latitude: 48.85, longitude: 2.35 })
  const mapped = toMapCoordinates(39.9, 116.4)
  assert.ok(Math.abs(mapped.longitude - 116.4) > .001)
  const restored = fromMapCoordinates(mapped.latitude, mapped.longitude)
  assert.ok(Math.abs(restored.latitude - 39.9) < .000001); assert.ok(Math.abs(restored.longitude - 116.4) < .000001)
})
