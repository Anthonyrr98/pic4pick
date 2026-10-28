export function photoAddressKey({ latitude, longitude, coordinateSystem = 'autonavi' }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    || !['gps', 'autonavi'].includes(coordinateSystem)) return null;
  return `${coordinateSystem}:${longitude.toFixed(6)},${latitude.toFixed(6)}`;
}

// AMap callbacks are not abortable. Each viewer can stop waiting independently;
// a shared request still finishes for other viewers and never caches failures.
export function createPhotoAddressResolver({ loadSdk, timeoutMs = 8000, maxCache = 100 }) {
  const cache = new Map(), pending = new Map();
  const request = (input) => new Promise(resolve => {
    let done = false;
    const finish = value => { if (done) return; done = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const run = async () => {
      const AMap = await loadSdk();
      if (done) return;
      let position = [input.longitude, input.latitude];
      // Only explicitly identified GPS coordinates are converted. Existing
      // database/map-picked coordinates keep the application's current datum.
      if (input.coordinateSystem === 'gps') {
        position = await new Promise(resolvePosition => AMap.convertFrom(position, 'gps', (status, result) => {
          const point = result?.locations?.[0];
          const longitude = point?.getLng?.() ?? point?.lng;
          const latitude = point?.getLat?.() ?? point?.lat;
          resolvePosition(status === 'complete' && photoAddressKey({ longitude, latitude }) ? [longitude, latitude] : null);
        }));
      }
      if (done) return;
      if (!position) { finish(null); return; }
      if (!AMap.Geocoder) await new Promise(resolvePlugin => AMap.plugin('AMap.Geocoder', resolvePlugin));
      if (done) return;
      const geocoder = new AMap.Geocoder({ radius: 200, extensions: 'base' });
      geocoder.getAddress(position, (status, result) => {
        const address = result?.regeocode?.formattedAddress;
        finish(status === 'complete' && typeof address === 'string' && address.trim()
          ? { address: address.trim(), longitude: position[0], latitude: position[1] } : null);
      });
    };
    void run().catch(() => finish(null));
  });
  return {
    async resolve(input, signal) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const key = photoAddressKey(input);
      if (!key) return null;
      if (cache.has(key)) {
        const result = cache.get(key); cache.delete(key); cache.set(key, result);
        return result;
      }
      if (!pending.has(key)) {
        const promise = request(input).then(result => {
          if (result) {
            cache.set(key, result);
            if (cache.size > maxCache) cache.delete(cache.keys().next().value);
          }
          return result;
        }).finally(() => pending.delete(key));
        pending.set(key, promise);
      }
      const promise = pending.get(key);
      if (!signal) return promise;
      return new Promise((resolve, reject) => {
        const abort = () => { signal.removeEventListener('abort', abort); reject(new DOMException('Cancelled', 'AbortError')); };
        signal.addEventListener('abort', abort, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
      });
    },
  };
}
