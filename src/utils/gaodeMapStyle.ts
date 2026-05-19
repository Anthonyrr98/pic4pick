import type { StyleSpecification } from 'maplibre-gl';
import { getEnvValue } from './envConfig';

/** 高德 JS API：远山黛 */
export const AMAP_MAP_STYLE_WHITESMOKE = 'amap://styles/whitesmoke';

/** 高德栅格：6=卫星 7=卫星+路网 8=街道路网（默认 8；可通过 VITE_GAODE_RASTER_STYLE 覆盖） */
export type GaodeRasterTileStyle = 6 | 7 | 8;

const GAODE_TILE_HOSTS = ['webrd01', 'webrd02', 'webrd03', 'webrd04'] as const;

export function getGaodeRasterTileStyle(): GaodeRasterTileStyle {
  const raw = getEnvValue('VITE_GAODE_RASTER_STYLE', '8');
  const n = Number(raw);
  if (n === 6 || n === 7 || n === 8) return n;
  return 8;
}

/** 后台可选的地图样式（不含卫星） */
export const MAP_STYLE_PRESETS = [
  {
    id: 'street',
    label: '街道图（栅格）',
    description: 'MapLibre + 高德街道瓦片，稳定、无需 JS SDK',
    rasterStyle: 8 as GaodeRasterTileStyle,
    useAmapSdk: false,
  },
  {
    id: 'whitesmoke',
    label: '远山黛（高德 JS）',
    description: '需配置 Web Key 与安全密钥，且网络可访问高德 JS API',
    rasterStyle: 8 as GaodeRasterTileStyle,
    useAmapSdk: true,
  },
] as const;

export type MapStylePresetId = (typeof MAP_STYLE_PRESETS)[number]['id'];

export function getMapStylePresetFromEnv(): MapStylePresetId {
  if (getEnvValue('VITE_MAP_USE_AMAP_SDK', '') === 'true') return 'whitesmoke';
  return 'street';
}

export function getMapStylePresetById(id: string) {
  return MAP_STYLE_PRESETS.find((p) => p.id === id) ?? MAP_STYLE_PRESETS[0];
}

export function mapStylePresetToEnvUpdates(presetId: string) {
  const preset = getMapStylePresetById(presetId);
  return {
    VITE_GAODE_RASTER_STYLE: String(preset.rasterStyle),
    VITE_MAP_USE_AMAP_SDK: preset.useAmapSdk ? 'true' : '',
  };
}

/** 读取当前环境后的 MapLibre 样式（发现页 / 后台小地图） */
export function getDefaultMaplibreStyle(): StyleSpecification {
  return buildGaodeRasterMaplibreStyle(getGaodeRasterTileStyle());
}

/** MapLibre：高德栅格瓦片 */
export function buildGaodeRasterMaplibreStyle(tileStyle: GaodeRasterTileStyle = getGaodeRasterTileStyle()): StyleSpecification {
  const tiles = GAODE_TILE_HOSTS.map(
    (host) =>
      `https://${host}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=${tileStyle}&x={x}&y={y}&z={z}`
  );
  return {
    version: 8,
    sources: {
      'gaode-tiles': {
        type: 'raster',
        tiles,
        tileSize: 256,
        attribution: '© 高德地图',
      },
    },
    layers: [
      {
        id: 'gaode-tiles-layer',
        type: 'raster',
        source: 'gaode-tiles',
        minzoom: 3,
        maxzoom: 18,
      },
    ],
  };
}
