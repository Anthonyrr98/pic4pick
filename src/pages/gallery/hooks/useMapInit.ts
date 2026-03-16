/**
 * 地图相关的自定义 Hooks
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { getEnvValue } from '../../../utils/envConfig';
import { handleError, ErrorType } from '../../../utils/errorHandler';

export const useGaodeMapInit = (
  containerRef: React.RefObject<HTMLDivElement>,
  activeView: string
) => {
  const mapInstance = useRef<any>(null);
  const maplibreInstance = useRef<any>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapProvider, setMapProvider] = useState<'amap' | 'maplibre' | null>(null);
  const [mapHint, setMapHint] = useState('');

  useEffect(() => {
    if (activeView !== 'explore-view') {
      setIsMapReady(false);
      setMapProvider(null);
      setMapHint('');

      if (mapInstance.current?.destroy) {
        mapInstance.current.destroy();
      }
      mapInstance.current = null;

      if (maplibreInstance.current) {
        maplibreInstance.current.remove();
        maplibreInstance.current = null;
      }
      return;
    }

    if (!containerRef.current) return;
    if (mapInstance.current || maplibreInstance.current) return;

    let cancelled = false;

    const destroyAMap = () => {
      if (mapInstance.current?.destroy) {
        mapInstance.current.destroy();
      }
      mapInstance.current = null;
    };

    const destroyMapLibre = () => {
      if (!maplibreInstance.current) return;
      maplibreInstance.current.remove();
      maplibreInstance.current = null;
    };

    const initMapLibreFallback = (hintText: string) => {
      if (cancelled || !containerRef.current || maplibreInstance.current) return;

      destroyAMap();

      maplibreInstance.current = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            'gaode-tiles': {
              type: 'raster',
              tiles: [
                'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
                'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
                'https://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y}&z={z}',
                'https://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
              ],
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
        },
        center: [105, 35],
        zoom: 3.2,
        attributionControl: true,
      });

      setMapProvider('maplibre');
      setMapHint(hintText);
      setIsMapReady(true);

      setTimeout(() => {
        if (maplibreInstance.current) {
          maplibreInstance.current.resize();
        }
      }, 80);
    };

    const initGaodeMap = async () => {
      const amapKey = getEnvValue('VITE_AMAP_KEY', '');
      if (!amapKey) {
        initMapLibreFallback('未配置高德地图 Key，已启用备用底图（可在后台配置面板填写 VITE_AMAP_KEY）。');
        return;
      }

      const ensureAMapLoaded = () =>
        new Promise<void>((resolve, reject) => {
          if (window.AMap?.Map) {
            resolve();
            return;
          }
          const existing = document.querySelector('script[data-amap-sdk]');
          if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', (e) => reject(e));
            return;
          }
          const script = document.createElement('script');
          script.src = `https://webapi.amap.com/maps?v=2.0&key=${amapKey}`;
          script.async = true;
          script.setAttribute('data-amap-sdk', 'true');
          script.onload = () => resolve();
          script.onerror = (e) => reject(e);
          document.head.appendChild(script);
        });

      try {
        await ensureAMapLoaded();
        if (cancelled) return;

        const AMap = window.AMap;
        if (!containerRef.current) {
          throw handleError(new Error('地图容器在初始化时不存在'), {
            context: 'useGaodeMapInit.container',
            type: ErrorType.VALIDATION,
          });
        }

        destroyMapLibre();

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
        setIsMapReady(true);

        setTimeout(() => {
          if (mapInstance.current) {
            mapInstance.current.resize();
          }
        }, 80);
      } catch (error) {
        handleError(error, {
          context: 'useGaodeMapInit',
          type: ErrorType.NETWORK,
          silent: true,
        });
        initMapLibreFallback('高德地图加载失败，已自动切换到备用底图。');
      }
    };

    const timer = setTimeout(() => {
      initGaodeMap();
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
  }, [activeView]);

  return {
    mapInstance,
    maplibreInstance,
    isMapReady,
    mapProvider,
    mapHint,
  };
};

export const useFocusMapOnCity = (
  mapInstance: React.MutableRefObject<any>,
  isMapReady: boolean
) => {
  return useCallback(
    (lng: number, lat: number) => {
      if (!isMapReady || !mapInstance.current || !window.AMap) return;
      if (lng == null || lat == null) return;
      const map = mapInstance.current;
      const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : 5.5;
      const targetZoom = Math.min(Math.max(currentZoom, 10.2), 15.2);
      if (typeof map.setZoomAndCenter === 'function') {
        map.setZoomAndCenter(targetZoom, [lng, lat]);
      } else {
        map.setCenter([lng, lat]);
        if (typeof map.setZoom === 'function') {
          map.setZoom(targetZoom);
        }
      }
    },
    [isMapReady]
  );
};
