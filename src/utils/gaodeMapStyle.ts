import type { StyleSpecification } from 'maplibre-gl';
import { getEnvValue } from './envConfig';

/** 高德栅格：6=卫星 7=卫星+路网 8=街道路网 */
export type GaodeRasterTileStyle = 6 | 7 | 8;

const GAODE_TILE_HOSTS = ['webrd01', 'webrd02', 'webrd03', 'webrd04'] as const;

/** 缩略图用固定瓦片（北京附近） */
const PREVIEW_TILE = { z: 11, x: 1688, y: 775 } as const;

export function buildGaodeTilePreviewUrl(style: GaodeRasterTileStyle): string {
  const { z, x, y } = PREVIEW_TILE;
  return `https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=${style}&x=${x}&y=${y}&z=${z}`;
}

function themePreviewSvg(bg: string, road: string, water: string, accent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
    <rect width="160" height="100" fill="${bg}"/>
    <ellipse cx="118" cy="28" rx="28" ry="16" fill="${water}" opacity="0.55"/>
    <path d="M0 62 Q45 48 90 58 T160 52" stroke="${road}" stroke-width="5" fill="none" opacity="0.75"/>
    <path d="M55 0 L60 100" stroke="${road}" stroke-width="2.5" fill="none" opacity="0.45"/>
    <path d="M0 38 Q80 28 160 42" stroke="${accent}" stroke-width="2" fill="none" opacity="0.35"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export type MapStyleKind = 'raster' | 'amap-js';

export type MapStylePreset = {
  id: string;
  label: string;
  description: string;
  kind: MapStyleKind;
  rasterStyle?: GaodeRasterTileStyle;
  amapStyle?: string;
  thumbnail: string;
};

/** 后台可选地图样式 */
export const MAP_STYLE_PRESETS: MapStylePreset[] = [
  {
    id: 'street',
    label: '标准街道',
    description: 'MapLibre 栅格街道图，稳定，推荐默认',
    kind: 'raster',
    rasterStyle: 8,
    thumbnail: buildGaodeTilePreviewUrl(8),
  },
  {
    id: 'satellite',
    label: '卫星影像',
    description: '纯卫星图，无道路标注',
    kind: 'raster',
    rasterStyle: 6,
    thumbnail: buildGaodeTilePreviewUrl(6),
  },
  {
    id: 'satellite_roads',
    label: '卫星+路网',
    description: '卫星底图叠加道路与标注',
    kind: 'raster',
    rasterStyle: 7,
    thumbnail: buildGaodeTilePreviewUrl(7),
  },
  {
    id: 'js_normal',
    label: '标准',
    description: '高德 JS 默认浅色主题',
    kind: 'amap-js',
    amapStyle: 'amap://styles/normal',
    thumbnail: themePreviewSvg('#f3f3f3', '#ffffff', '#b8d4e8', '#8a8a8a'),
  },
  {
    id: 'js_light',
    label: '月光银',
    description: '浅色柔和主题',
    kind: 'amap-js',
    amapStyle: 'amap://styles/light',
    thumbnail: themePreviewSvg('#faf6ee', '#fffdf8', '#c5dce8', '#c4b8a8'),
  },
  {
    id: 'js_whitesmoke',
    label: '远山黛',
    description: '偏灰蓝文艺风格',
    kind: 'amap-js',
    amapStyle: 'amap://styles/whitesmoke',
    thumbnail: themePreviewSvg('#e4eaef', '#f2f5f8', '#b0c8d8', '#8fa3b0'),
  },
  {
    id: 'js_fresh',
    label: '草色青',
    description: '清新绿色调',
    kind: 'amap-js',
    amapStyle: 'amap://styles/fresh',
    thumbnail: themePreviewSvg('#e8f0dc', '#f4f8ee', '#9ec8b0', '#7aab88'),
  },
  {
    id: 'js_grey',
    label: '雅士灰',
    description: '低饱和灰色系',
    kind: 'amap-js',
    amapStyle: 'amap://styles/grey',
    thumbnail: themePreviewSvg('#d8d8d8', '#ececec', '#a8b8c0', '#909090'),
  },
  {
    id: 'js_graffiti',
    label: '涂鸦',
    description: '高对比彩色涂鸦风',
    kind: 'amap-js',
    amapStyle: 'amap://styles/graffiti',
    thumbnail: themePreviewSvg('#fff9c4', '#ff8a80', '#80cbc4', '#7e57c2'),
  },
  {
    id: 'js_macaron',
    label: '马卡龙',
    description: '粉嫩马卡龙配色',
    kind: 'amap-js',
    amapStyle: 'amap://styles/macaron',
    thumbnail: themePreviewSvg('#fce4ec', '#f8bbd0', '#b2ebf2', '#f48fb1'),
  },
  {
    id: 'js_blue',
    label: '靛青蓝',
    description: '蓝色调主题',
    kind: 'amap-js',
    amapStyle: 'amap://styles/blue',
    thumbnail: themePreviewSvg('#dceefb', '#e8f4fc', '#90caf9', '#5c9fd4'),
  },
  {
    id: 'js_darkblue',
    label: '极夜蓝',
    description: '深蓝夜景风格',
    kind: 'amap-js',
    amapStyle: 'amap://styles/darkblue',
    thumbnail: themePreviewSvg('#1a2744', '#2a3f66', '#3d5a80', '#6b8cae'),
  },
  {
    id: 'js_wine',
    label: '酱籽',
    description: '酒红复古色调',
    kind: 'amap-js',
    amapStyle: 'amap://styles/wine',
    thumbnail: themePreviewSvg('#3d2028', '#5c3040', '#8b4558', '#c9a0a8'),
  },
  {
    id: 'js_dark',
    label: '幻影黑',
    description: '深色夜间模式',
    kind: 'amap-js',
    amapStyle: 'amap://styles/dark',
    thumbnail: themePreviewSvg('#1c1c1c', '#333333', '#2a3a4a', '#555555'),
  },
];

export type MapStylePresetId = (typeof MAP_STYLE_PRESETS)[number]['id'];

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
