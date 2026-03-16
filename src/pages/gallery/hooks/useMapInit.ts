/**
 * 地图相关的自定义 Hooks
 *
 * 生命周期保证：
 * 1. cancelled 标志覆盖所有异步分支（脚本加载、setTimeout、事件回调）
 * 2. cleanup 先置 cancelled = true，再同步销毁已存在实例，避免竞态泄漏
 * 3. 离开 explore-view 时统一销毁，进入时幂等初始化（已有实例则跳过）
 * 4. 对外暴露稳定的 resizeMap 方法，避免外部各处散乱调用
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { getEnvValue } from '../../../utils/envConfig';
import { handleError, ErrorType } from '../../../utils/errorHandler';

// ── 高德瓦片地址（轮询 4 个节点）
const GAODE_TILES = [
  'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
  'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
  'https://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
  'https://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
];

const MAPLIBRE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'gaode-tiles': {
      type: 'raster',
      tiles: GAODE_TILES,
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

// ── 确保高德 JS SDK 只加载一次，并复用同一个 Promise
let amapLoadPromise: Promise<void> | null = null;

function ensureAMapLoaded(amapKey: string): Promise<void> {
  if ((window as any).AMap?.Map) return Promise.resolve();
  if (amapLoadPromise) return amapLoadPromise;

  amapLoadPromise = new Promise<void>((resolve, reject) => {
    // 如果页面已插入脚本标签（上一次失败前插入），直接监听
    const existing = document.querySelector('script[data-amap-sdk]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => {
        amapLoadPromise = null; // 允许重试
        reject(new Error('高德地图 SDK 加载失败'));
      });
      return;
    }
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${amapKey}`;
    script.async = true;
    script.setAttribute('data-amap-sdk', 'true');
    script.onload = () => resolve();
    script.onerror = () => {
      amapLoadPromise = null; // 允许重试
      reject(new Error('高德地图 SDK 加载失败'));
    };
    document.head.appendChild(script);
  });

  return amapLoadPromise;
}

// ── 主 Hook
export const useGaodeMapInit = (
  containerRef: React.RefObject<HTMLDivElement>,
  activeView: string
) => {
  const mapInstance = useRef<any>(null);
  const maplibreInstance = useRef<maplibregl.Map | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapProvider, setMapProvider] = useState<'amap' | 'maplibre' | null>(null);
  const [mapHint, setMapHint] = useState('');

  // ── 稳定的销毁辅助函数（不进入 deps）
  const destroyAMap = useCallback(() => {
    if (mapInstance.current?.destroy) mapInstance.current.destroy();
    mapInstance.current = null;
  }, []);

  const destroyMapLibre = useCallback(() => {
    if (!maplibreInstance.current) return;
    maplibreInstance.current.remove();
    maplibreInstance.current = null;
  }, []);

  // ── 对外暴露：主动触发地图容器尺寸同步
  const resizeMap = useCallback(() => {
    mapInstance.current?.resize?.();
    maplibreInstance.current?.resize?.();
  }, []);

  useEffect(() => {
    // 离开发现视图：同步销毁，重置状态
    if (activeView !== 'explore-view') {
      destroyAMap();
      destroyMapLibre();
      setIsMapReady(false);
      setMapProvider(null);
      setMapHint('');
      return;
    }

    if (!containerRef.current) return;
    // 已有实例则幂等跳过（防止 StrictMode 双调用或视图来回切换时重复初始化）
    if (mapInstance.current || maplibreInstance.current) return;

    // cancelled 用于取消所有进行中的异步操作
    let cancelled = false;

    const initMapLibreFallback = (hintText: string) => {
      if (cancelled || !containerRef.current || maplibreInstance.current) return;
      // 确保高德实例已清理后再创建 MapLibre
      destroyAMap();

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: MAPLIBRE_STYLE,
        center: [105, 35],
        zoom: 3.2,
        attributionControl: true,
      });

      maplibreInstance.current = map;
      setMapProvider('maplibre');
      setMapHint(hintText);

      map.once('load', () => {
        // 再次检查 cancelled，load 回调可能在 cleanup 之后触发
        if (cancelled) {
          map.remove();
          if (maplibreInstance.current === map) maplibreInstance.current = null;
          return;
        }
        setIsMapReady(true);
        map.resize();
      });
    };

    const initGaodeMap = async () => {
      const amapKey = getEnvValue('VITE_AMAP_KEY', '');
      if (!amapKey) {
        initMapLibreFallback('未配置高德地图 Key，已启用备用底图（可在后台配置面板填写 VITE_AMAP_KEY）。');
        return;
      }

      try {
        await ensureAMapLoaded(amapKey);

        // SDK 加载完成后检查是否已被取消（用户可能已切换视图）
        if (cancelled) return;
        if (!containerRef.current) {
          throw handleError(new Error('地图容器在初始化时不存在'), {
            context: 'useGaodeMapInit.container',
            type: ErrorType.VALIDATION,
          });
        }

        // 确保 MapLibre 已清理
        destroyMapLibre();

        const AMap = (window as any).AMap;
        const map = new AMap.Map(containerRef.current, {
          viewMode: '2D',
          zoom: 3.2,
          center: [105, 35],
          resizeEnable: true,
          mapStyle: 'amap://styles/whitesmoke',
        });

        mapInstance.current = map;
        setMapProvider('amap');
        setMapHint('');

        map.on('complete', () => {
          if (cancelled) {
            // complete 回调在 cleanup 后才触发：立即销毁
            if (mapInstance.current === map) {
              map.destroy();
              mapInstance.current = null;
            }
            return;
          }
          setIsMapReady(true);
          map.resize();
        });
      } catch (error) {
        handleError(error, {
          context: 'useGaodeMapInit',
          type: ErrorType.NETWORK,
          silent: true,
        });
        initMapLibreFallback('高德地图加载失败，已自动切换到备用底图。');
      }
    };

    // 短暂延迟确保容器 DOM 已完成布局
    const timer = setTimeout(() => {
      if (!cancelled) initGaodeMap();
    }, 50);

    return () => {
      // 1. 先标记取消，阻断所有未完成的异步回调
      cancelled = true;
      clearTimeout(timer);
      // 2. 同步重置状态（不依赖异步事件）
      setIsMapReady(false);
      setMapProvider(null);
      setMapHint('');
      // 3. 销毁已存在的实例
      destroyAMap();
      destroyMapLibre();
    };
  }, [activeView, containerRef, destroyAMap, destroyMapLibre]);

  return { mapInstance, maplibreInstance, isMapReady, mapProvider, mapHint, resizeMap };
};

// ── 城市定焦 Hook
export const useFocusMapOnCity = (
  mapInstance: React.MutableRefObject<any>,
  isMapReady: boolean
) => {
  return useCallback(
    (lng: number, lat: number) => {
      if (!isMapReady || !mapInstance.current) return;
      if (lng == null || lat == null) return;

      const map = mapInstance.current;
      const isAMap = typeof map.setZoomAndCenter === 'function';

      if (isAMap) {
        const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : 5.5;
        const targetZoom = Math.min(Math.max(currentZoom, 10.2), 15.2);
        map.setZoomAndCenter(targetZoom, [lng, lat]);
      } else {
        // MapLibre 备用底图
        (map as maplibregl.Map).flyTo({ center: [lng, lat], zoom: 11, speed: 1.4 });
      }
    },
    [isMapReady] // mapInstance 是 ref，不需要加入 deps
  );
};
