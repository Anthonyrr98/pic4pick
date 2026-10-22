import type { StyleSpecification } from 'maplibre-gl';
import { getEnvValue } from './envConfig';
import { inferWebMapPreset } from '../../packages/shared/adminSettings';
export { mapPresetPatch as mapStylePresetToEnvUpdates } from '../../packages/shared/adminSettings';

import { GAODE_TILE_HOSTS, MAP_STYLE_PRESETS, type GaodeRasterTileStyle, type MapStylePreset, type MapStylePresetId } from '../../packages/shared/mapStylePresets';
export * from '../../packages/shared/mapStylePresets';

export function getGaodeRasterTileStyle(): GaodeRasterTileStyle {
  const preset = getMapStylePresetById(getMapStylePresetFromEnv());
  if (preset.rasterStyle) return preset.rasterStyle;
  const raw = getEnvValue('VITE_GAODE_RASTER_STYLE', '8');
  const n = Number(raw);
  if (n === 6 || n === 7 || n === 8) return n;
  return 8;
}

export function getMapStylePresetById(id: string): MapStylePreset {
  return MAP_STYLE_PRESETS.find((p) => p.id === id) ?? MAP_STYLE_PRESETS[0];
}

export function getMapStylePresetFromEnv(): MapStylePresetId {
  return inferWebMapPreset({
    VITE_MAP_STYLE_PRESET: getEnvValue('VITE_MAP_STYLE_PRESET', ''),
    VITE_MAP_USE_AMAP_SDK: getEnvValue('VITE_MAP_USE_AMAP_SDK', ''),
    VITE_AMAP_MAP_STYLE: getEnvValue('VITE_AMAP_MAP_STYLE', 'amap://styles/whitesmoke'),
  }) as MapStylePresetId;
}

export function getActiveMapStylePreset(): MapStylePreset {
  return getMapStylePresetById(getMapStylePresetFromEnv());
}

/** 读取当前环境后的 MapLibre 样式 */
export function getDefaultMaplibreStyle(): StyleSpecification {
  return buildGaodeRasterMaplibreStyle(getGaodeRasterTileStyle());
}

/** MapLibre：高德栅格瓦片 */
export function buildGaodeRasterMaplibreStyle(
  tileStyle: GaodeRasterTileStyle = getGaodeRasterTileStyle(),
): StyleSpecification {
  const tiles = GAODE_TILE_HOSTS.map(
    (host) =>
      `https://${host}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=${tileStyle}&x={x}&y={y}&z={z}`,
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
