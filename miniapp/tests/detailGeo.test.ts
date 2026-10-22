import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveDetailGeo } from '../../packages/shared/detailGeo'
test('detail retains EXIF, persisted altitude and terrain priority including zero and below sea level', () => {
  const photo = { latitude: 40, longitude: 116, altitude: 0 }
  assert.deepEqual(resolveDetailGeo(photo, { latitude: 0, longitude: 0, GPSAltitude: -12 }, 100), { latitude: 0, longitude: 0, altitude: -12, altitudeSource: 'exif' })
  assert.equal(resolveDetailGeo(photo, null, 100).altitude, 0)
  assert.equal(resolveDetailGeo({ ...photo, altitude: null }, null, 100).altitudeSource, 'terrain')
})
test('invalid EXIF pairs do not mix with record coordinates or turn missing data into zero', () => {
  const record = { latitude: 39, longitude: 116, altitude: '20' }
  assert.equal(resolveDetailGeo(record, { latitude: 120, longitude: 39, GPSAltitude: NaN }).latitude, 39)
  assert.equal(resolveDetailGeo(record, { latitude: 0, longitude: null }).longitude, 116)
  assert.deepEqual(resolveDetailGeo({ latitude: null, longitude: '', altitude: null }), { latitude: null, longitude: null, altitude: null, altitudeSource: null })
})
