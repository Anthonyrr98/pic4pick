export function photoAddressKey({ latitude, longitude, coordinateSystem = 'autonavi' }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    || !['gps', 'autonavi'].includes(coordinateSystem)) return null;
  return `${coordinateSystem}:${longitude.toFixed(6)},${latitude.toFixed(6)}`;
}

const addressText = value => typeof value === 'string' ? value.trim() : '';
const placeName = value => addressText(value) || addressText(value?.name);

export function compactPhotoAddress(regeocode) {
  const full = addressText(regeocode?.formattedAddress);
  const component = regeocode?.addressComponent || {};
  // Only an area containing the point may be presented as its location. A
  // nearby business or an adjacent park is not the same as the photographed site.
  const containingAreas = (Array.isArray(regeocode?.aois) ? regeocode.aois : [])
    .filter(area => placeName(area) && (typeof area.distance === 'number' || addressText(area.distance))
      && Number.isFinite(Number(area.distance)) && Number(area.distance) === 0)
    .sort((a, b) => (Number(a.area) > 0 ? Number(a.area) : Infinity) - (Number(b.area) > 0 ? Number(b.area) : Infinity));
  if (containingAreas.length) return placeName(containingAreas[0]);

  const neighborhood = placeName(component.neighborhood);
  const building = placeName(component.building);
  if (building && building.length <= 24) {
    const numberedBuilding = /^[A-Za-z0-9一二三四五六七八九十零〇-]+(?:号楼|栋|座|单元|楼)$/.test(building);
    if (!numberedBuilding) return building;
    if (neighborhood) return `${neighborhood} · ${building}`;
  }
  if (neighborhood && neighborhood.length <= 24) return neighborhood;

  let local = full;
  for (const part of [component.country, component.province, component.city, component.district, component.township]) {
    const prefix = addressText(part);
    if (prefix && local.startsWith(prefix)) local = local.slice(prefix.length).trim();
  }
  // AMap sometimes concatenates a park, sub-site and the park's repeated name.
  // Keep the named parent before its hierarchy separator; preserve the full
  // provider response separately rather than trying to invent abbreviations.
  const parent = local.split(/[-—|｜]/u)[0].trim();
  if (local.length > 24 && parent !== local && parent.length >= 4 && parent.length <= 24 && /[\u3400-\u9fff]/u.test(parent)) return parent;
  const street = addressText(component.street) || addressText(component.streetNumber?.street);
  const number = addressText(component.streetNumber?.number) || addressText(component.streetNumber);
  if (street) return number && !street.endsWith(number) ? `${street}${number}` : street;
  return local || full;
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
      const geocoder = new AMap.Geocoder({ radius: 200, extensions: 'all' });
      geocoder.getAddress(position, (status, result) => {
        const address = result?.regeocode?.formattedAddress;
        finish(status === 'complete' && typeof address === 'string' && address.trim()
          ? { address: address.trim(), label: compactPhotoAddress(result.regeocode), longitude: position[0], latitude: position[1] } : null);
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
