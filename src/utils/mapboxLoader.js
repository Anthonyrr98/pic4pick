import { getEnvValue } from './envConfig';

export function getDiscoveryMapboxToken() {
  const token = String(getEnvValue('VITE_MAPBOX_PUBLIC_TOKEN')).trim();
  return /^pk\.[A-Za-z0-9._-]+$/.test(token) ? token : '';
}

export async function loadMapbox() {
  const [module] = await Promise.all([
    import('mapbox-gl'),
    import('mapbox-gl/dist/mapbox-gl.css'),
  ]);
  return module.default;
}
