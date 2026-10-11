/**
 * 共用地图初始化：按当前预设选择高德 JS 或 MapLibre，SDK 不可用时回退栅格底图。
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { getEnvValue } from '../../../utils/envConfig';
import { handleError, ErrorType } from '../../../utils/errorHandler';
import { loadMapLibre } from '../../../utils/maplibreLoader';
import { ensureAMapLoaded } from '../../../utils/amapLoader';
import { getActiveMapStylePreset, getDefaultMaplibreStyle } from '../../../utils/gaodeMapStyle';
import { createCityFlight, cityFlightEasing, getCityFocusOffset } from '../utils/cityFlight';

const AMAP_READY_TIMEOUT_MS = 10000;

function waitForAmapMapReady(
  map: { on: (event: string, cb: () => void) => void; off: (event: string, cb: () => void) => void },
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      map.off('complete', onComplete);
      signal.removeEventListener('abort', onAbort);
    };
    const onComplete = () => { cleanup(); resolve(); };
    const onAbort = () => { cleanup(); reject(new Error('地图初始化已取消')); };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('高德地图初始化超时（请检查 Web Key 白名单与 securityJsCode）'));
    }, AMAP_READY_TIMEOUT_MS);
    map.on('complete', onComplete);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export const useGaodeMapInit = (
  containerRef: React.RefObject<HTMLDivElement>,
  activeView: string,
  { center = [105, 35], zoom = 3.2 }: { center?: [number, number]; zoom?: number } = {}
) => {
  const [centerLongitude, centerLatitude] = center;
  const mapInstance = useRef<any>(null);
  const maplibreInstance = useRef<MapLibreMap | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapProvider, setMapProvider] = useState<'amap' | 'maplibre' | null>(null);
  const [mapConfigRevision, setMapConfigRevision] = useState(0);

  useEffect(() => {
    const onMapConfigChanged = () => setMapConfigRevision((v) => v + 1);
    window.addEventListener('pic4pick:map-config-changed', onMapConfigChanged);
    return () => window.removeEventListener('pic4pick:map-config-changed', onMapConfigChanged);
  }, []);

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
      return;
    }

    if (!containerRef.current) return;
    if (mapInstance.current || maplibreInstance.current) return;

    let cancelled = false;
    const controller = new AbortController();

    const initMapLibreFallback = async () => {
      if (cancelled || !containerRef.current || maplibreInstance.current) return;
      destroyAMap();
      const maplibregl = await loadMapLibre();
      if (cancelled || !containerRef.current || maplibreInstance.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: getDefaultMaplibreStyle(),
        center: [centerLongitude, centerLatitude],
        zoom,
        attributionControl: true,
      });

      maplibreInstance.current = map;
      setMapProvider('maplibre');

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
      const mapPreset = getActiveMapStylePreset();
      const useAmapSdk = mapPreset.kind === 'amap-js';

      if (!useAmapSdk || !amapKey || !securityJsCode) {
        await initMapLibreFallback();
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
          zoom,
          center: [centerLongitude, centerLatitude],
          resizeEnable: true,
          mapStyle: mapPreset.amapStyle || 'amap://styles/normal',
        });

        mapInstance.current = map;
        setMapProvider('amap');

        await waitForAmapMapReady(map, controller.signal);
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
        if (cancelled) return;
        handleError(error, {
          context: 'useGaodeMapInit',
          type: ErrorType.NETWORK,
          silent: true,
        });
        destroyAMap();
        await initMapLibreFallback();
      }
    };

    void initMap().catch(error => {
      if (!cancelled) handleError(error, {
        context: 'useGaodeMapInit.fallback', type: ErrorType.NETWORK, silent: true,
      });
    });

    return () => {
      cancelled = true;
      controller.abort();
      setIsMapReady(false);
      setMapProvider(null);
      destroyAMap();
      destroyMapLibre();
    };
  }, [activeView, mapConfigRevision, containerRef, destroyAMap, destroyMapLibre, centerLongitude, centerLatitude, zoom]);

  return { mapInstance, maplibreInstance, isMapReady, mapProvider, resizeMap };
};

export const useFocusMapOnCity = (
  mapInstance: React.MutableRefObject<any>,
  maplibreInstance: React.MutableRefObject<MapLibreMap | null>,
  mapProvider: 'amap' | 'maplibre' | null,
  isMapReady: boolean,
  sectionRef: React.RefObject<HTMLElement>,
  containerRef: React.RefObject<HTMLDivElement>,
  isActive: boolean
) => {
  const cancelFlightRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    const cancel = () => cancelFlightRef.current?.();
    const visibilityChanged = () => { if (document.hidden) cancel(); };
    // Camera control immediately returns to the visitor on any map gesture.
    container?.addEventListener('pointerdown', cancel);
    container?.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('resize', cancel);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      cancel();
      container?.removeEventListener('pointerdown', cancel);
      container?.removeEventListener('wheel', cancel);
      window.removeEventListener('resize', cancel);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [containerRef, isActive, isMapReady, mapProvider]);

  return useCallback(
    (lng: number, lat: number) => {
      if (!isMapReady || !isActive || !Number.isFinite(lng) || !Number.isFinite(lat)) return;
      const map = mapProvider === 'amap' ? mapInstance.current : maplibreInstance.current;
      const container = containerRef.current;
      const section = sectionRef.current;
      if (!map || !container || !section) return;
      cancelFlightRef.current?.();
      const center = map.getCenter();
      const rect = container.getBoundingClientRect();
      const panel = section.querySelector<HTMLElement>('.curation-panel');
      const panelRect = panel?.getBoundingClientRect();
      // During a sheet resize, aim using its settled height rather than an intermediate frame.
      const focusHeight = Number(panel?.dataset.focusHeight);
      const focusRect = panelRect && panel?.dataset.mobile === 'true' && focusHeight > 0
        ? { width: panelRect.width, height: focusHeight, right: panelRect.right, top: panelRect.bottom - focusHeight }
        : panelRect;
      const offset = getCityFocusOffset(rect, focusRect);
      // MapLibre's 512px world tiles use one less zoom level for the same city scale.
      const targetZoom = mapProvider === 'amap' ? 10.2 : 9.2;
      const flight = createCityFlight({ from: [center.lng, center.lat], to: [lng, lat],
        zoom: map.getZoom(), targetZoom, width: rect.width, height: rect.height, offset,
        tileSize: mapProvider === 'amap' ? 256 : 512 });
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const duration = reducedMotion ? 0 : flight.duration;
      if (mapProvider === 'maplibre') {
        if (!duration) map.jumpTo({ center: flight.destination, zoom: targetZoom });
        else map.flyTo({ center: flight.destination, zoom: targetZoom, duration,
          curve: 1.42, easing: cityFlightEasing });
        cancelFlightRef.current = () => { cancelFlightRef.current = null; map.stop(); };
        return;
      }
      if (!duration) {
        map.setZoomAndCenter(targetZoom, flight.destination, true, 0);
        return;
      }
      let frame = 0;
      const started = performance.now();
      const finish = () => {
        cancelAnimationFrame(frame);
        cancelFlightRef.current = null;
        section.dispatchEvent(new Event('cityflightend'));
      };
      cancelFlightRef.current = finish;
      section.dispatchEvent(new Event('cityflightstart'));
      const animate = (now: number) => {
        const progress = Math.min((now - started) / duration, 1);
        const camera = flight.sample(progress);
        // One camera update per display frame; do not nest the SDK's own tween.
        map.setZoomAndCenter(camera.zoom, camera.center, true, 0);
        if (progress < 1) frame = requestAnimationFrame(animate);
        else finish();
      };
      frame = requestAnimationFrame(animate);
    },
    [isMapReady, isActive, mapProvider, mapInstance, maplibreInstance, sectionRef, containerRef]
  );
};

export const useMapMotion = (
  sectionRef: React.RefObject<HTMLElement>,
  mapInstance: React.MutableRefObject<any>,
  maplibreInstance: React.MutableRefObject<MapLibreMap | null>,
  mapProvider: 'amap' | 'maplibre' | null,
  isMapReady: boolean,
  isActive: boolean
) => {
  useEffect(() => {
    const section = sectionRef.current;
    const map = mapProvider === 'amap' ? mapInstance.current : maplibreInstance.current;
    if (!section || !map || !isMapReady || !isActive) return;
    let restoreTimer: ReturnType<typeof setTimeout>;
    const motions = new Set<string>();
    const start = (motion: string) => {
      motions.add(motion);
      clearTimeout(restoreTimer);
      section.classList.add('map-in-motion');
    };
    const end = (motion: string) => {
      motions.delete(motion);
      clearTimeout(restoreTimer);
      if (motions.size === 0) {
        restoreTimer = setTimeout(() => section.classList.remove('map-in-motion'), 180);
      }
    };
    const handlers = ['move', 'zoom', 'drag'].map(motion => ({
      motion, start: () => start(motion), end: () => end(motion),
    }));
    handlers.forEach(handler => {
      map.on(`${handler.motion}start`, handler.start);
      map.on(`${handler.motion}end`, handler.end);
    });
    const flightStart = () => start('cityflight');
    const flightEnd = () => end('cityflight');
    section.addEventListener('cityflightstart', flightStart);
    section.addEventListener('cityflightend', flightEnd);
    return () => {
      clearTimeout(restoreTimer);
      section.removeEventListener('cityflightstart', flightStart);
      section.removeEventListener('cityflightend', flightEnd);
      handlers.forEach(handler => {
        map.off(`${handler.motion}start`, handler.start);
        map.off(`${handler.motion}end`, handler.end);
      });
      section.classList.remove('map-in-motion');
    };
  }, [sectionRef, mapInstance, maplibreInstance, mapProvider, isMapReady, isActive]);
};
