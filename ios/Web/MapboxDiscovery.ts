import mapboxgl, { type GeoJSONSource, type Map as MapboxMap } from 'mapbox-gl';
import type { FeatureCollection, Point } from 'geojson';

type Location = { id: string; longitude: number; latitude: number };
const sourceID = 'pic4pick-discovery-photos';
const palette = ['#72583e', '#454c48', '#4f6142', '#486878', '#85725a', '#805a4f', '#5f736d', '#4e5461'];
export const LngLatBounds = mapboxgl.LngLatBounds;
export const Marker = mapboxgl.Marker;

export function createMap(container: HTMLElement, token: string, camera: { center: [number, number]; zoom: number }) {
  return new mapboxgl.Map({
    container, accessToken: token, style: 'mapbox://styles/mapbox/light-v10', ...camera,
    language: 'zh-Hans',
    locale: { 'AttributionControl.ToggleAttribution': '地图署名' },
    attributionControl: false, maxPitch: 0, dragRotate: false, touchPitch: false,
  }).addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
}

export function drawLocations(map: MapboxMap, locations: Location[]) {
  const data: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: locations.map(location => {
      const color = [...location.id].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0);
      return {
        type: 'Feature', geometry: { type: 'Point', coordinates: [location.longitude, location.latitude] },
        properties: { color: palette[color % palette.length] },
      };
    }),
  };
  const source = map.getSource<GeoJSONSource>(sourceID);
  if (source) { source.setData(data); return; }
  map.addSource(sourceID, {
    type: 'geojson', data, cluster: true, clusterRadius: 3, clusterMaxZoom: 8,
    clusterProperties: { color: ['concat', ['get', 'color']] },
  });
  map.addLayer({
    id: sourceID, type: 'circle', source: sourceID,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 1.6, 2, 2.4, 8, 3.8],
      'circle-color': ['slice', ['get', 'color'], 0, 7],
      'circle-stroke-width': 0.75, 'circle-stroke-color': '#fff',
    },
  });
}

export function nearbyIDs(map: MapboxMap, point: { x: number; y: number }, locations: Location[]) {
  const center = map.unproject([point.x, point.y]).lng;
  return locations.map(location => {
    // Select the copy of the point closest to the tap at the antimeridian.
    const longitude = location.longitude + Math.round((center - location.longitude) / 360) * 360;
    const projected = map.project([longitude, location.latitude]);
    return { id: location.id, distance: Math.hypot(projected.x - point.x, projected.y - point.y) };
  }).filter(item => item.distance <= 38)
    .sort((a, b) => a.distance - b.distance).slice(0, 80).map(item => item.id);
}
