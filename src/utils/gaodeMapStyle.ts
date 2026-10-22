import type { StyleSpecification } from 'maplibre-gl';
import { getEnvValue } from './envConfig';

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
  const stored = getEnvValue('VITE_MAP_STYLE_PRESET', '');
  if (stored && MAP_STYLE_PRESETS.some((p) => p.id === stored)) {
    return stored as MapStylePresetId;
  }
  if (getEnvValue('VITE_MAP_USE_AMAP_SDK', '') === 'true') {
    const amapStyle = getEnvValue('VITE_AMAP_MAP_STYLE', 'amap://styles/whitesmoke');
    const matched = MAP_STYLE_PRESETS.find((p) => p.amapStyle === amapStyle);
    return (matched?.id ?? 'js_whitesmoke') as MapStylePresetId;
  }
  return 'street';
}

export function getActiveMapStylePreset(): MapStylePreset {
  return getMapStylePresetById(getMapStylePresetFromEnv());
}

export function mapStylePresetToEnvUpdates(presetId: string) {
  const preset = getMapStylePresetById(presetId);
  return {
    VITE_MAP_STYLE_PRESET: preset.id,
    VITE_GAODE_RASTER_STYLE: String(preset.rasterStyle ?? 8),
    VITE_MAP_USE_AMAP_SDK: preset.kind === 'amap-js' ? 'true' : '',
    VITE_AMAP_MAP_STYLE: preset.amapStyle ?? '',
  };
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

/** @deprecated 使用 getActiveMapStylePreset().amapStyle */
export const AMAP_MAP_STYLE_WHITESMOKE = 'amap://styles/whitesmoke';
