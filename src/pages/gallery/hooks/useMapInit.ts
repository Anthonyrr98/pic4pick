/**
 * 地图初始化：优先高德 JS API（远山黛），失败或无 Key 时用 MapLibre + 栅格 style=8
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { getEnvValue } from '../../../utils/envConfig';
import { handleError, ErrorType } from '../../../utils/errorHandler';
import { loadMapLibre } from '../../../utils/maplibreLoader';
import { AMAP_MAP_STYLE_WHITESMOKE, buildGaodeRasterMaplibreStyle } from '../../../utils/gaodeMapStyle';

const MAPLIBRE_RASTER_STYLE = buildGaodeRasterMaplibreStyle(8);

const AMAP_READY_TIMEOUT_MS = 10000;

let amapLoadPromise: Promise<void> | null = null;

function waitForAmapMapReady(map: { on: (event: string, cb: () => void) => void }, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('高德地图初始化超时（请检查 Web Key 白名单与 securityJsCode）'));
    }, timeoutMs);
    map.on('complete', () => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}

function ensureAMapLoaded(amapKey: string): Promise<void> {
  if ((window as any).AMap?.Map) return Promise.resolve();
  if (amapLoadPromise) return amapLoadPromise;

  amapLoadPromise = new Promise<void>((resolve, reject) => {
    const securityJsCode = getEnvValue('VITE_AMAP_SECURITY_JS_CODE', '');
    if (securityJsCode) {
      (window as any)._AMapSecurityConfig = { securityJsCode };
    }

    const existing = document.querySelector('script[data-amap-sdk]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => {
        amapLoadPromise = null;
        reject(new Error('高德地图 SDK 脚本加载失败'));
      });
      return;
    }

    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${amapKey}`;
    script.async = true;
    script.setAttribute('data-amap-sdk', 'true');
    script.onload = () => {
      if ((window as any).AMap?.Map) resolve();
      else {
        amapLoadPromise = null;
        reject(new Error('高德地图 SDK 未就绪（请检查 Key / securityJsCode）'));
      }
    };
    script.onerror = () => {
      amapLoadPromise = null;
      reject(new Error('高德地图 SDK 脚本加载失败'));
    };
    document.head.appendChild(script);
  });

  return amapLoadPromise;
}

export const useGaodeMapInit = (
  containerRef: React.RefObject<HTMLDivElement>,
  activeView: string
) => {
  const mapInstance = useRef<any>(null);
  const maplibreInstance = useRef<MapLibreMap | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapProvider, setMapProvider] = useState<'amap' | 'maplibre' | null>(null);
  const [mapHint, setMapHint] = useState('');

  const destroyAMap = useCallback(() => {
    if (mapInstance.current?.destroy) mapInstance.current.destroy();
    mapInstance.current = null;
  }, []);

  const destroyMapLibre = useCallback(() => {
    if (!maplibreInstance.current) return;
    maplibreInstance.current.remove();
    maplibreInstance.current = null;
  }, []);

  const resizeMap = useCallback(() => {
    mapInstance.current?.resize?.();
    maplibreInstance.current?.resize?.();
  }, []);

  useEffect(() => {
    if (activeView !== 'explore-view') {
      destroyAMap();
      destroyMapLibre();
      setIsMapReady(false);
      setMapProvider(null);
      setMapHint('');
      return;
    }

    if (!containerRef.current) return;
    if (mapInstance.current || maplibreInstance.current) return;

    let cancelled = false;

    const initMapLibreFallback = async (hintText: string) => {
      if (cancelled || !containerRef.current || maplibreInstance.current) return;
      destroyAMap();
      const maplibregl = await loadMapLibre();
      if (cancelled || !containerRef.current || maplibreInstance.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: MAPLIBRE_RASTER_STYLE,
        center: [105, 35],
        zoom: 3.2,
        attributionControl: true,
      });

      maplibreInstance.current = map;
      setMapProvider('maplibre');
      setMapHint(hintText);

      map.once('load', () => {
        if (cancelled) {
          map.remove();
          if (maplibreInstance.current === map) maplibreInstance.current = null;
          return;
        }
        setIsMapReady(true);
        map.resize();
      });
    };

    const initMap = async () => {
      const amapKey = getEnvValue('VITE_AMAP_WEB_KEY', getEnvValue('VITE_AMAP_KEY', ''));
      const securityJsCode = getEnvValue('VITE_AMAP_SECURITY_JS_CODE', '');
      const forceMapLibre = getEnvValue('VITE_MAP_USE_AMAP_SDK', '') === 'false';

      if (!amapKey || !securityJsCode || forceMapLibre) {
        const hint = !amapKey
          ? '未配置高德 Web Key，已使用备用底图（style=8）。'
          : !securityJsCode
            ? '未配置高德 securityJsCode，已使用备用底图（style=8）。'
            : '';
        await initMapLibreFallback(hint);
        return;
      }

      try {
        await ensureAMapLoaded(amapKey);
        if (cancelled) return;
        if (!containerRef.current) return;

        destroyMapLibre();

        const AMap = (window as any).AMap;
        const map = new AMap.Map(containerRef.current, {
          viewMode: '2D',
          zoom: 3.2,
          center: [105, 35],
          resizeEnable: true,
          mapStyle: AMAP_MAP_STYLE_WHITESMOKE,
        });

        mapInstance.current = map;
        setMapProvider('amap');
        setMapHint('');

        await waitForAmapMapReady(map, AMAP_READY_TIMEOUT_MS);
        if (cancelled) {
          if (mapInstance.current === map) {
            map.destroy();
            mapInstance.current = null;
          }
          return;
        }
        setIsMapReady(true);
        map.resize();
      } catch (error) {
        handleError(error, {
          context: 'useGaodeMapInit',
          type: ErrorType.NETWORK,
          silent: true,
        });
        const msg = error instanceof Error ? error.message : '高德地图加载失败';
        await initMapLibreFallback(`${msg}，已切换到备用底图（style=8）。`);
      }
    };

    const timer = setTimeout(() => {
      if (!cancelled) initMap();
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setIsMapReady(false);
      setMapProvider(null);
      setMapHint('');
      destroyAMap();
      destroyMapLibre();
    };
  }, [activeView, containerRef, destroyAMap, destroyMapLibre]);

  return { mapInstance, maplibreInstance, isMapReady, mapProvider, mapHint, resizeMap };
};

export const useFocusMapOnCity = (
  mapInstance: React.MutableRefObject<any>,
  maplibreInstance: React.MutableRefObject<MapLibreMap | null>,
  mapProvider: 'amap' | 'maplibre' | null,
  isMapReady: boolean
) => {
  return useCallback(
    (lng: number, lat: number) => {
      if (!isMapReady || lng == null || lat == null) return;

      if (mapProvider === 'amap' && mapInstance.current) {
        const map = mapInstance.current;
        const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : 5.5;
        const targetZoom = Math.min(Math.max(currentZoom, 10.2), 15.2);
        map.setZoomAndCenter(targetZoom, [lng, lat]);
        return;
      }

      if (mapProvider === 'maplibre' && maplibreInstance.current) {
        maplibreInstance.current.flyTo({ center: [lng, lat], zoom: 11, speed: 1.4 });
      }
    },
    [isMapReady, mapProvider, mapInstance, maplibreInstance]
  );
};
