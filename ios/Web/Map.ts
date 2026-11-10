import { MAP_STYLE_PRESETS } from '../../packages/shared/mapStylePresets';
import { buildGaodeRasterMaplibreStyle } from '../../src/utils/gaodeMapStyle';
import { createPhotoAddressResolver } from '../../src/utils/photoAddress';
import { EXPLORE_MARKER_COLORS } from '../../packages/shared/exploreMarkerStyle';
import { inferWebMapPreset } from '../../packages/shared/adminSettings';
import { fromMapCoordinates } from '../../miniapp/src/platform/coordinates';

declare const __WORKER_SOURCE__: string;
declare const __MAPBOX_ENABLED__: boolean;
type MapboxDiscovery = typeof import('./MapboxDiscovery');
const loadMapboxDiscovery = (): MapboxDiscovery | null => __MAPBOX_ENABLED__ ? require('./MapboxDiscovery') : null;
let mapboxDiscovery: MapboxDiscovery | null = null;
let mapboxFailed = false;
type MapLibre = typeof import('maplibre-gl');
let maplibre: MapLibre | undefined;
function loadMapLibre(): MapLibre {
  if (maplibre) return maplibre;
  // MapLibre registers built-in constructors globally for worker transfer.
  // Loading it before Mapbox breaks Mapbox's serialization of vector tiles.
  const engine: MapLibre = require('maplibre-gl/dist/maplibre-gl.mjs');
  engine.setWorkerUrl(URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: 'text/javascript' })));
  return maplibre = engine;
}
const post = (type: string, extra: Record<string, unknown> = {}) => {
  (window as any).webkit?.messageHandlers?.pic4pickMap?.postMessage({ type, ...extra });
  window.dispatchEvent(new CustomEvent('pic4pick-map-event', { detail: { type, ...extra } }));
};
let map: any = null, provider = '', fingerprint = '', payload: any = null, ticket = 0;
let configured: any = {}, focusID = '', geocodeID = '', sdkTask: Promise<any> | null = null;
let ready = false;
let panelPadding = 0;
let panelOffset = 0;
let parallaxAnimations: Animation[] = [];
const mapElement = document.getElementById('map')!;
const attributionSelector = '.amap-logo,.amap-copyright,.maplibregl-ctrl-bottom-left,.maplibregl-ctrl-bottom-right,.mapboxgl-ctrl-bottom-left,.mapboxgl-ctrl-bottom-right';
type MarkerPoint = { id: string; title: string; longitude: number; latitude: number };
type MarkerEntry = {
  marker: any; target: HTMLButtonElement; point: MarkerPoint; color: string; photoURL?: string;
};
const markers = new Map<string, MarkerEntry>();

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

function removeMarker({ marker }: MarkerEntry) {
  if (provider === 'amap') marker.setMap(null); else marker.remove();
}

function cancelParallax() {
  parallaxAnimations.forEach(animation => animation.cancel());
  parallaxAnimations = [];
}

function destroyMap() {
  cancelParallax();
  markers.forEach(removeMarker);
  markers.clear();
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
function detailMapboxPoint(next: any): Pick<MarkerPoint, 'latitude' | 'longitude'> {
  // AMap address results carry GCJ-02 coordinates. Use the original EXIF
  // coordinates when available and convert legacy map-picked points at display time.
  const point = next.geocode ?? next.focus;
  const { latitude, longitude } = point;
  return point.coordinateSystem === 'autonavi' ? fromMapCoordinates(latitude, longitude) : { latitude, longitude };
}

async function startMapbox(next: any, revision: number) {
  let camera = initialCamera();
  if (next.photoDetailCard) {
    const { latitude, longitude } = detailMapboxPoint(next);
    camera = { center: [longitude, latitude], zoom: next.focus.zoom || 11 };
  }
  const value = mapboxDiscovery!.createMap(mapElement, next.config.VITE_MAPBOX_PUBLIC_TOKEN, camera);
  map = value; provider = 'mapbox';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('map ready timeout')), 8000);
    const loaded = () => finish();
    const failed = ({ error }: { error: Error }) => finish(error);
    function finish(error?: Error) {
      clearTimeout(timer);
      value.off('load', loaded);
      value.off('error', failed);
      value.off('remove', removed);
      if (error) reject(error); else resolve();
    }
    const removed = () => finish(new Error('map removed'));
    value.on('load', loaded);
    value.on('error', failed);
    value.on('remove', removed);
  });
  if (revision !== ticket) return;
  ready = true;
  if (next.compactMarkers) {
    value.on('click', ({ point }) => {
      if (!payload?.active || map !== value || !mapboxDiscovery) return;
      const ids = mapboxDiscovery.nearbyIDs(value, point, payload.locations);
      if (ids.length) post('nearbyLocations', { ids });
    });
  }
  post('ready', { provider, preset: 'mapbox_light' });
  draw(payload);
}

async function start(next: any, revision: number) {
  destroyMap();
  document.body.classList.toggle('discovery-map', Boolean(next.compactMarkers));
  const wantsMapbox = (next.compactMarkers || next.photoDetailCard) && next.config.VITE_MAPBOX_PUBLIC_TOKEN && !mapboxFailed && !maplibre;
  if (wantsMapbox) mapboxDiscovery ??= loadMapboxDiscovery();
  const useMapbox = Boolean(wantsMapbox && mapboxDiscovery);
  document.body.classList.toggle('mapbox-discovery', useMapbox && Boolean(next.compactMarkers));
  if (useMapbox) {
    try {
      await startMapbox(next, revision);
      return;
    } catch {
      if (revision !== ticket) return;
      mapboxFailed = true;
      destroyMap();
      document.body.classList.remove('mapbox-discovery');
    }
  }
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
    if (preset.kind === 'amap-js' && next.requireConfiguredStyle && !mapboxFailed) {
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
    const engine = loadMapLibre();
    map = new engine.Map({ container: 'map', style,
      center: focusedPhoto ? [focus.longitude, focus.latitude] : initial.center,
      zoom: focusedPhoto ? focus.zoom : initial.zoom - (next.compactMarkers ? 1 : 0),
      attributionControl: { compact: !next.compactMarkers } });
    provider = 'maplibre';
    if (focusedPhoto) focusID = focus.id;
    if (!next.photoDetailCard) map.addControl(new engine.NavigationControl({ showCompass: true }), 'top-right');
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

function setMarkerContent(entry: MarkerEntry) {
  const { target, color, photoURL } = entry;
  const dot = document.createElement('span');
  dot.style.backgroundColor = color;
  target.classList.toggle('photo-marker', Boolean(photoURL));
  if (!photoURL) { target.replaceChildren(dot); return; }
  const photo = document.createElement('img');
  photo.alt = '';
  photo.onerror = () => {
    if (photo.parentElement !== target) return;
    photo.replaceWith(dot);
    target.classList.remove('photo-marker');
  };
  target.replaceChildren(photo);
  photo.src = photoURL;
}

function drawMarkers(next: any) {
  const points: MarkerPoint[] = [...next.locations];
  if (provider === 'mapbox' && next.photoDetailCard && points.length === 1) {
    points[0] = { ...points[0], ...detailMapboxPoint(next) };
  }
  if (next.userLocation) points.push({ id: '__user', title: '你的位置', ...next.userLocation });
  const ids = new Set(points.map(point => point.id));
  for (const [id, entry] of markers) {
    if (!ids.has(id)) { removeMarker(entry); markers.delete(id); }
  }
  points.forEach((point, index) => {
    const { id, longitude, latitude, title } = point;
    const photoURL = next.locations.length === 1 && id !== '__user' ? next.photoMarkerURL : undefined;
    const entry = markers.get(id);
    // Discovery's palette stays stable when the gallery order changes.
    const colorIndex = next.compactMarkers && !entry
      ? [...id].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0) : 0;
    const color = id === '__user' ? '#467bdb' : next.compactMarkers
      ? entry?.color ?? discoveryColors[colorIndex % discoveryColors.length] : EXPLORE_MARKER_COLORS[index % EXPLORE_MARKER_COLORS.length];
    const position: [number, number] = [longitude, latitude];
    if (entry) {
      if (entry.point.title !== title) entry.target.setAttribute('aria-label', title);
      if (entry.point.longitude !== longitude || entry.point.latitude !== latitude) {
        if (provider === 'amap') entry.marker.setPosition(position); else entry.marker.setLngLat(position);
      }
      entry.point = point;
      if (entry.color !== color || entry.photoURL !== photoURL) {
        entry.color = color;
        entry.photoURL = photoURL;
        setMarkerContent(entry);
      }
      return;
    }
    const target = document.createElement('button');
    target.type = 'button'; target.className = next.compactMarkers ? 'marker compact' : 'marker';
    target.setAttribute('aria-label', title);
    if (id !== '__user') target.onclick = () => post('location', { id });
    const markerEntry: MarkerEntry = { marker: null, target, point, color, photoURL };
    setMarkerContent(markerEntry);
    if (provider === 'amap') {
      const AMap = (window as any).AMap;
      markerEntry.marker = new AMap.Marker({ position, content: target, anchor: 'center' });
      markerEntry.marker.setMap(map);
    } else {
      const Marker = provider === 'mapbox' ? mapboxDiscovery!.Marker : loadMapLibre().Marker;
      markerEntry.marker = new Marker({ element: target, anchor: 'center' }).setLngLat(position).addTo(map);
    }
    markers.set(id, markerEntry);
  });
}

function fitLocations(next: any, clearance: number, immediately: boolean) {
  const side = next.compactMarkers ? 36 : 60;
  const top = 60;
  const bottom = clearance + (next.compactMarkers ? 25 : 60);
  if (provider === 'amap') map.setFitView(Array.from(markers.values(), entry => entry.marker), immediately, [top, side, bottom, side], 11);
  else {
    const Bounds = provider === 'mapbox' ? mapboxDiscovery!.LngLatBounds : loadMapLibre().LngLatBounds;
    const bounds = new Bounds();
    next.locations.forEach((point: any) => bounds.extend([point.longitude, point.latitude]));
    map.fitBounds(bounds.toArray(), { padding: { top, right: side, bottom, left: side }, maxZoom: 11, duration: immediately ? 0 : 700 });
  }
}

function draw(next: any, updateMarkers = true) {
  if (!ready || !map || !next || next.active === false) return;
  const clearance = Math.min(panelPadding, Math.max(0, innerHeight - 160));
  if (updateMarkers) {
    if (provider === 'mapbox' && next.compactMarkers) mapboxDiscovery?.drawLocations(map, next.locations);
    else drawMarkers(next);
  }
  const focus = next.focus;
  if (provider === 'mapbox' && next.photoDetailCard) {
    const { latitude, longitude } = detailMapboxPoint(next);
    const zoom = focus.zoom || 11;
    const id = `${longitude},${latitude},${zoom}`;
    if (id !== focusID) {
      map.jumpTo({ center: [longitude, latitude], zoom });
      focusID = id;
    }
  } else if (focus && focus.id !== focusID) {
    if (focus.initial && next.compactMarkers) {
      const camera = initialCamera();
      if (provider === 'amap') map.setZoomAndCenter(camera.zoom, camera.center, true);
      else map.jumpTo({ center: camera.center, zoom: provider === 'mapbox' ? camera.zoom : camera.zoom - 1,
        padding: { top: 0, right: 0, bottom: 0, left: 0 } });
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
  if (next.resolveAddress !== false && next.geocode && next.geocode.id !== geocodeID) {
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
  document.documentElement.style.setProperty('--panel-padding', `${panelPadding}px`);
}

function setPanelParallax(offset: number, duration = 0, easing = 'linear', visibleClearance?: number) {
  const target = Math.min(0, Number(offset) || 0);
  // Read the visible position only when one settle interrupts another.
  const start = duration > 0 && parallaxAnimations.length
    ? parseFloat(getComputedStyle(mapElement).translate.split(' ')[1]) || 0 : panelOffset;
  cancelParallax();
  panelOffset = target;
  document.documentElement.style.setProperty('--panel-map-offset', `${target}px`);
  if (visibleClearance !== undefined) {
    document.documentElement.style.setProperty('--mapbox-panel-clearance', `${visibleClearance}px`);
  }
  if (duration <= 0 || start === target || !document.body.classList.contains('discovery-map')) return;

  const translate = (from: number, to: number) => ({ translate: [`0 ${from}px`, `0 ${to}px`] });
  const options = { duration, easing };
  const movement = mapElement.animate(translate(start, target), options);
  // Keep SDK-owned credits in place and in the same WebKit hit-test tree.
  const credits = Array.from(mapElement.querySelectorAll(attributionSelector), credit =>
    credit.animate(translate(-start, -target), options));
  parallaxAnimations = [movement, ...credits];
  movement.onfinish = () => { if (parallaxAnimations[0] === movement) cancelParallax(); };
}

function update(next: any) {
  const wasInactive = payload?.active === false;
  payload = next;
  if (next.active === false) {
    if (next.photoDetailCard) {
      if (ready) map?.stop?.();
    } else if (!next.compactMarkers) {
      dispose();
    }
    return;
  }
  document.body.classList.toggle('photo-detail-map', Boolean(next.photoDetailCard));
  configured = next.config;
  const config = Object.keys(next.config).sort().map(name => [name, next.config[name]]);
  const key = JSON.stringify([next.photoDetailCard, next.compactMarkers, config]);
  if (key !== fingerprint) {
    fingerprint = key; const revision = ++ticket;
    start(next, revision).catch(() => { if (revision === ticket) { destroyMap(); fingerprint = ''; post('failure'); } });
  } else {
    if (wasInactive && next.photoDetailCard) map?.resize?.();
    draw(next);
  }
}

function dispose() {
  ++ticket;
  destroyMap();
  fingerprint = '';
  payload = null;
}

(window as any).Pic4PickMap = {
  setPanelLayout,
  setPanelParallax,
  update,
  dispose,
  parkPhotoMap() {
    if (!payload?.photoDetailCard) return;
    // A new native view needs the address again. The resolver can reuse it.
    geocodeID = '';
    update({ ...payload, active: false });
  },
  updateParts({ content, camera }: { content?: any; camera?: any }) {
    if (content) {
      const commands = camera ?? { focus: payload?.focus, geocode: payload?.geocode, reduceMotion: payload?.reduceMotion };
      update({ ...content, ...commands });
    } else if (payload && camera) {
      payload = { ...payload, geocode: undefined, ...camera };
      draw(payload, provider === 'mapbox' && payload.photoDetailCard);
    }
  },
};
new ResizeObserver(() => {
  if (!payload?.photoDetailCard || payload.active !== false) map?.resize?.();
}).observe(mapElement);
window.addEventListener('pagehide', dispose);
post('documentReady');
