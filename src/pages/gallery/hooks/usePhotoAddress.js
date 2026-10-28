import { useEffect, useState } from 'react';
import { ensureAMapLoaded } from '../../../utils/amapLoader';
import { getEnvValue } from '../../../utils/envConfig';
import { createPhotoAddressResolver, photoAddressKey } from '../../../utils/photoAddress.js';

const resolver = createPhotoAddressResolver({
  async loadSdk() {
    const key = getEnvValue('VITE_AMAP_WEB_KEY', getEnvValue('VITE_AMAP_KEY', ''));
    if (!key) throw new Error('AMap is not configured');
    await ensureAMapLoaded(key);
    return window.AMap;
  },
});

export function usePhotoAddress(latitude, longitude, coordinateSystem, enabled) {
  const [result, setResult] = useState(null);
  const key = enabled ? photoAddressKey({ latitude, longitude, coordinateSystem }) : null;
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    void resolver.resolve({ latitude, longitude, coordinateSystem }, controller.signal).then(value => {
      if (!controller.signal.aborted) setResult({ key, value });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, value: null });
    });
    return () => controller.abort();
  }, [key, latitude, longitude, coordinateSystem]);
  const current = key && result?.key === key ? result : null;
  return { value: current?.value ?? null, loading: Boolean(key && !current) };
}
