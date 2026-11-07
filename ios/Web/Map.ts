import * as maplibre from 'maplibre-gl';
import { MAP_STYLE_PRESETS } from '../../packages/shared/mapStylePresets';
import { buildGaodeRasterMaplibreStyle } from '../../src/utils/gaodeMapStyle';
import { createPhotoAddressResolver } from '../../src/utils/photoAddress';
import { EXPLORE_MARKER_COLORS } from '../../packages/shared/exploreMarkerStyle';
import { inferWebMapPreset } from '../../packages/shared/adminSettings';

declare const __WORKER_SOURCE__: string;
const post = (type: string, extra: Record<string, unknown> = {}) => {
  (window as any).webkit?.messageHandlers?.pic4pickMap?.postMessage({ type, ...extra });
  window.dispatchEvent(new CustomEvent('pic4pick-map-event', { detail: { type, ...extra } }));
};
let map: any = null, provider = '', fingerprint = '', markers: any[] = [], payload: any = null, ticket = 0;
let configured: any = {}, focusID = '', geocodeID = '', sdkTask: Promise<any> | null = null;
let ready = false, markerKey = '';
let panelPadding = 0;
const workerURL = URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: 'text/javascript' }));
maplibre.setWorkerUrl(workerURL);

const discoveryColors = ['#72583e', '#454c48', '#4f6142', '#486878', '#85725a', '#805a4f', '#5f736d', '#4e5461'];
const chinaOverview = { longitude: 106, latitude: 35.5, longitudeSpan: 47 };

function initialCamera() {
  const { longitude, latitude, longitudeSpan } = chinaOverview;
  const degreesPerPixel = longitudeSpan / Math.max(1, innerWidth);
  const zoom = Math.max(2, Math.min(4, Math.log2(360 / (256 * degreesPerPixel))));
  const mercator = Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360));
  // Keep the geographical center centered in the part of the map above the sheet.
  const shift = Math.min(panelPadding, innerHeight * 0.30) * degreesPerPixel * Math.PI / 360;
  const center: [number, number] = [longitude, Math.atan(Math.sinh(mercator - shift)) * 180 / Math.PI];
  return { center, zoom };
}

function removeMarkers() {
  markers.forEach(marker => provider === 'amap' ? marker.setMap(null) : marker.remove());
  markers = []; markerKey = '';
}

function destroyMap() {
  removeMarkers();
  if (provider === 'amap') map?.destroy(); else map?.remove();
  map = null; provider = ''; ready = false; focusID = ''; geocodeID = '';
}

function sdk(config: any, preferVector = false): Promise<any> {
  if ((window as any).AMap?.Map) return Promise.resolve((window as any).AMap);
  if (sdkTask) return sdkTask;
  const key = config.VITE_AMAP_WEB_KEY || config.VITE_AMAP_KEY;
  if (!key || !config.VITE_AMAP_SECURITY_JS_CODE) return Promise.reject(new Error('map configuration unavailable'));
  (window as any)._AMapSecurityConfig = { securityJsCode: config.VITE_AMAP_SECURITY_JS_CODE };
  // WKWebView can fail AMap's performance check even when WebGL is available.
  // The website preset takes effect only on the vector renderer.
  if (preferVector) (window as any).forceWebGL = true;
  sdkTask = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { script.remove(); reject(new Error('map SDK timeout')); }, 12000);
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.onload = () => { clearTimeout(timer); (window as any).AMap?.Map ? resolve((window as any).AMap) : reject(new Error('map SDK unavailable')); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('map SDK unavailable')); };
    document.head.appendChild(script);
  }).catch(error => { sdkTask = null; throw error; });
  return sdkTask;
}

const resolver = createPhotoAddressResolver({ loadSdk: () => sdk(configured) });
async function start(next: any, revision: number) {
  destroyMap();
  document.body.classList.toggle('discovery-map', Boolean(next.compactMarkers));
  const presetID = next.photoDetailCard ? 'street' : inferWebMapPreset({ ...next.config, VITE_AMAP_MAP_STYLE: next.config.VITE_AMAP_MAP_STYLE || 'amap://styles/whitesmoke' });
  const preset = MAP_STYLE_PRESETS.find(item => item.id === presetID) || MAP_STYLE_PRESETS[0];
  const camera = () => next.compactMarkers ? initialCamera() : { center: [105, 35] as [number, number], zoom: 3.2 };
  try {
    if (preset.kind !== 'amap-js') throw new Error('raster preset');
    const AMap = await sdk(next.config, next.compactMarkers);
    if (revision !== ticket) return;
    const value = new AMap.Map('map', { viewMode: '2D', ...camera(), resizeEnable: true,
      mapStyle: preset.amapStyle || 'amap://styles/normal',
      ...(next.compactMarkers ? { zooms: [2, 20], touchZoomCenter: false } : {}) });
    map = value; provider = 'amap';
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('map ready timeout')), 12000);
      value.on('complete', () => { clearTimeout(timer); resolve(); });
    });
  } catch (error) {
    if (revision !== ticket) return;
    if (provider === 'amap') map?.destroy();
    if (preset.kind === 'amap-js' && next.requireConfiguredStyle) {
      map = null; provider = ''; throw error;
    }
    const raster = Number(next.config.VITE_GAODE_RASTER_STYLE);
    const focus = next.focus;
    const focusedPhoto = next.photoDetailCard && Number.isFinite(focus?.longitude) && Number.isFinite(focus?.latitude);
    const style = buildGaodeRasterMaplibreStyle(preset.rasterStyle || ([6, 7, 8].includes(raster) ? raster as 6 | 7 | 8 : 8));
    if (next.compactMarkers) {
      const tiles = style.layers[0];
      tiles.minzoom = 0;
    }
    const initial = camera();
    map = new maplibre.Map({ container: 'map', style,
      center: focusedPhoto ? [focus.longitude, focus.latitude] : initial.center,
      zoom: focusedPhoto ? focus.zoom : initial.zoom - (next.compactMarkers ? 1 : 0),
      attributionControl: { compact: !next.compactMarkers } });
    provider = 'maplibre';
    if (focusedPhoto) focusID = focus.id;
    if (!next.photoDetailCard) map.addControl(new maplibre.NavigationControl({ showCompass: true }), 'top-right');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('map ready timeout')), 18000);
      map.once('load', () => { clearTimeout(timer); resolve(); });
    });
  }
  if (revision !== ticket) return;
  ready = true;
  if (next.photoDetailCard && provider === 'maplibre') {
    document.querySelector<HTMLElement>('.maplibregl-compact-show .maplibregl-ctrl-attrib-button')?.click();
  }
  post('ready', { provider, preset: preset.id });
  draw(payload);
}

function drawMarkers(next: any) {
  const points = [...next.locations];
  if (next.userLocation) points.push({ id: '__user', title: '你的位置', ...next.userLocation });
  const positions = points.map(point => [point.id, point.title, point.longitude, point.latitude]);
  const key = JSON.stringify([positions, next.compactMarkers, next.photoMarkerURL]);
  if (key === markerKey) return;
  removeMarkers();
  markerKey = key;
  points.forEach((point, index) => {
    const target = document.createElement('button');
    target.type = 'button'; target.className = next.compactMarkers ? 'marker compact' : 'marker'; target.setAttribute('aria-label', point.title);
    const dot = document.createElement('span');
    // Stable even when the gallery order or rating changes.
    const colorIndex = [...String(point.id)].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0);
    dot.style.backgroundColor = point.id === '__user' ? '#467bdb' : next.compactMarkers
      ? discoveryColors[colorIndex % discoveryColors.length] : EXPLORE_MARKER_COLORS[index % EXPLORE_MARKER_COLORS.length];
    if (next.photoMarkerURL && next.locations.length === 1 && point.id !== '__user') {
      const photo = document.createElement('img');
      photo.src = next.photoMarkerURL; photo.alt = ''; target.classList.add('photo-marker');
      photo.onerror = () => { photo.replaceWith(dot); target.classList.remove('photo-marker'); };
      target.appendChild(photo);
    } else { target.appendChild(dot); }
    target.onclick = () => { if (point.id !== '__user') post('location', { id: point.id }); };
    if (provider === 'amap') {
      const AMap = (window as any).AMap;
      const marker = new AMap.Marker({ position: [point.longitude, point.latitude], content: target, anchor: 'center' });
      marker.setMap(map); markers.push(marker);
    } else {
      markers.push(new maplibre.Marker({ element: target, anchor: 'center' }).setLngLat([point.longitude, point.latitude]).addTo(map));
    }
  });
}

function fitLocations(next: any, clearance: number, immediately: boolean) {
  const side = next.compactMarkers ? 36 : 60;
  const top = 60;
  const bottom = clearance + (next.compactMarkers ? 25 : 60);
  if (provider === 'amap') map.setFitView(markers, immediately, [top, side, bottom, side], 11);
  else {
    const bounds = new maplibre.LngLatBounds();
    next.locations.forEach((point: any) => bounds.extend([point.longitude, point.latitude]));
    map.fitBounds(bounds, { padding: { top, right: side, bottom, left: side }, maxZoom: 11, duration: immediately ? 0 : 700 });
  }
}

function draw(next: any) {
  if (!ready || !map || !next || next.active === false) return;
  const clearance = Math.min(panelPadding, Math.max(0, innerHeight - 160));
  drawMarkers(next);
  const focus = next.focus;
  if (focus && focus.id !== focusID) {
    if (focus.initial && next.compactMarkers) {
      const camera = initialCamera();
      if (provider === 'amap') map.setZoomAndCenter(camera.zoom, camera.center, true);
      else map.jumpTo({ center: camera.center, zoom: camera.zoom - 1, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
      focusID = focus.id;
    } else if (focus.all && next.locations.length) {
      fitLocations(next, clearance, next.reduceMotion);
      focusID = focus.id;
    } else if (Number.isFinite(focus.latitude) && Number.isFinite(focus.longitude)) {
      if (provider === 'amap') map.setZoomAndCenter(focus.zoom || 11, [focus.longitude, focus.latitude], next.reduceMotion, 700);
      else map.flyTo({ center: [focus.longitude, focus.latitude], zoom: focus.zoom || 11, duration: next.reduceMotion ? 0 : 700 });
      focusID = focus.id;
    }
  }
  if (next.geocode && next.geocode.id !== geocodeID) {
    geocodeID = next.geocode.id;
    const id = geocodeID;
    resolver.resolve(next.geocode).then(result => {
      if (result && id === geocodeID) post('address', { id, ...result });
    }).catch(() => {});
  }
}

function setPanelLayout(clearance: number, attributionTop: number) {
  panelPadding = Math.max(0, Number(clearance) || 0);
  document.documentElement.style.setProperty('--attribution-top', `${attributionTop}px`);
}

(window as any).Pic4PickMap = {
  setPanelLayout,
  setPanelParallax(offset: number) {
    document.documentElement.style.setProperty('--panel-map-offset', `${Math.min(0, Number(offset) || 0)}px`);
  },
  update(next: any) {
    if (next.active === false) {
      if (next.compactMarkers) { payload = next; return; }
      ++ticket; destroyMap(); fingerprint = ''; return;
    }
    document.body.classList.toggle('photo-detail-map', Boolean(next.photoDetailCard));
    payload = next; configured = next.config;
    const config = Object.keys(next.config).sort().map(name => [name, next.config[name]]);
    const key = JSON.stringify([next.photoDetailCard, next.compactMarkers, config]);
    if (key !== fingerprint) {
      fingerprint = key; const revision = ++ticket;
      start(next, revision).catch(() => { if (revision === ticket) { destroyMap(); fingerprint = ''; post('failure'); } });
    } else { draw(next); }
  },
};
new ResizeObserver(() => {
  map?.resize?.();
}).observe(document.getElementById('map')!);
window.addEventListener('pagehide', () => { ++ticket; destroyMap(); fingerprint = ''; });
post('documentReady');
