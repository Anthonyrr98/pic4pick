import type { StyleSpecification } from 'maplibre-gl';

/** 高德 JS API：远山黛 */
export const AMAP_MAP_STYLE_WHITESMOKE = 'amap://styles/whitesmoke';

const GAODE_TILE_HOSTS = ['webrd01', 'webrd02', 'webrd03', 'webrd04'] as const;

/** MapLibre 备用：高德栅格瓦片（style 8 = 带中文标注的矢量街道图） */
export function buildGaodeRasterMaplibreStyle(tileStyle: 8 | 7 = 8): StyleSpecification {
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
