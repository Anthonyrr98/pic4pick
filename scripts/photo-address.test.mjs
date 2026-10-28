import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoAddressResolver, photoAddressKey } from '../src/utils/photoAddress.js';

const point = { longitude: 116.379311, latitude: 40.024718 };
const sdkFixture = ({ deferred = false, pluginRequired = false, failConversion = false } = {}) => {
  const calls = [], callbacks = [], conversions = [];
  class Geocoder {
    getAddress(position, callback) {
      calls.push([...position]);
      if (deferred) callbacks.push(callback);
      else queueMicrotask(() => callback('complete', { regeocode: { formattedAddress: `北京市测试街道${position[0]}` } }));
    }
  }
  const sdk = {
    convertFrom(position, type, callback) {
      conversions.push({ position: [...position], type });
      queueMicrotask(() => callback(failConversion ? 'error' : 'complete', { locations: [{ getLng: () => 116.3855, getLat: () => 40.026 }] }));
    },
    plugin(name, ready) { assert.equal(name, 'AMap.Geocoder'); sdk.Geocoder = Geocoder; queueMicrotask(ready); },
    ...(pluginRequired ? {} : { Geocoder }),
  };
  return { sdk, calls, callbacks, conversions };
};

test('invalid or missing coordinates do not load AMap or query an address', async () => {
  const resolver = createPhotoAddressResolver({ loadSdk() { throw new Error('Must not load'); } });
  for (const input of [{}, { latitude: null, longitude: 0 }, { latitude: 91, longitude: 116 }, { latitude: 40, longitude: Infinity }, { ...point, coordinateSystem: 'unknown' }]) {
    assert.equal(photoAddressKey(input), null);
    assert.equal(await resolver.resolve(input), null);
  }
  assert.ok(photoAddressKey({ latitude: 0, longitude: 0 }), 'Zero is a valid coordinate');
});

test('loads the geocoder lazily, deduplicates lookups and keeps different photo addresses separate', async () => {
  const { sdk, calls } = sdkFixture({ pluginRequired: true });
  let loaded = 0;
  const resolver = createPhotoAddressResolver({ loadSdk: async () => { loaded++; return sdk; } });
  const [first, second] = await Promise.all([resolver.resolve(point), resolver.resolve(point)]);
  assert.deepEqual(first, second); assert.equal(calls.length, 1); assert.equal(loaded, 1);
  assert.equal(first.address, `北京市测试街道${point.longitude}`);
  assert.deepEqual(calls[0], [point.longitude, point.latitude]);
  await resolver.resolve(point); assert.equal(calls.length, 1);
  const other = await resolver.resolve({ ...point, longitude: 116.5 });
  assert.notEqual(other.address, first.address); assert.equal(calls.length, 2);
});

test('known GPS coordinates are converted once and the address carries the same position for its map marker', async () => {
  const { sdk, calls, conversions } = sdkFixture();
  const resolver = createPhotoAddressResolver({ loadSdk: async () => sdk });
  const result = await resolver.resolve({ ...point, coordinateSystem: 'gps' });
  assert.deepEqual(conversions, [{ position: [point.longitude, point.latitude], type: 'gps' }]);
  assert.deepEqual(calls, [[116.3855, 40.026]]);
  assert.deepEqual([result.longitude, result.latitude], calls[0]);
  await resolver.resolve(point);
  assert.equal(conversions.length, 1, 'Map-picked/database coordinates must not be converted twice');
  const failed = sdkFixture({ failConversion: true });
  assert.equal(await createPhotoAddressResolver({ loadSdk: async () => failed.sdk }).resolve({ ...point, coordinateSystem: 'gps' }), null);
  assert.equal(failed.calls.length, 0, 'Do not geocode an unconverted point after a GPS conversion failure');
});

test('closing one viewer cancels its wait without cancelling another viewer of the same photo', async () => {
  const { sdk, calls, callbacks } = sdkFixture({ deferred: true });
  const resolver = createPhotoAddressResolver({ loadSdk: async () => sdk });
  const firstController = new AbortController();
  const first = resolver.resolve(point, firstController.signal);
  const second = resolver.resolve(point);
  firstController.abort();
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal(calls.length, 1);
  callbacks[0]('complete', { regeocode: { formattedAddress: '北京市海淀区测试地址' } });
  assert.equal((await second).address, '北京市海淀区测试地址');
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(resolver.resolve(point, aborted.signal), { name: 'AbortError' });
});

test('failures and empty addresses fall back without poisoning later retries', async () => {
  let attempts = 0;
  const { sdk } = sdkFixture();
  const resolver = createPhotoAddressResolver({ loadSdk: async () => { if (++attempts === 1) throw new Error('Offline'); return sdk; } });
  assert.equal(await resolver.resolve(point), null);
  assert.ok((await resolver.resolve(point)).address);
  for (const result of [{}, { regeocode: { formattedAddress: [] } }, { regeocode: { formattedAddress: ' ' } }]) {
    const emptySdk = { Geocoder: class { getAddress(_position, callback) { callback('complete', result); } } };
    assert.equal(await createPhotoAddressResolver({ loadSdk: async () => emptySdk }).resolve(point), null);
  }
});

test('timeout prevents late SDK loads from starting new work; successful address cache stays bounded', async () => {
  let ready;
  const { sdk, calls } = sdkFixture();
  const delayed = createPhotoAddressResolver({ loadSdk: () => new Promise(resolve => { ready = resolve; }), timeoutMs: 5 });
  assert.equal(await delayed.resolve(point), null);
  ready(sdk);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 0);
  const bounded = createPhotoAddressResolver({ loadSdk: async () => sdk, maxCache: 1 });
  await bounded.resolve(point);
  await bounded.resolve({ ...point, longitude: 116.5 });
  await bounded.resolve(point);
  assert.equal(calls.length, 3);
});
