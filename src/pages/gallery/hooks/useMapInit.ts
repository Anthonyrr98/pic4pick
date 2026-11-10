/**
 * 共用地图初始化：发现页可优先用 Mapbox，其余场景沿用高德预设。
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Map as MapboxMap } from 'mapbox-gl';
import { getEnvValue } from '../../../utils/envConfig';
import { handleError, ErrorType } from '../../../utils/errorHandler';
import { loadMapLibre } from '../../../utils/maplibreLoader';
import { getDiscoveryMapboxToken, loadMapbox } from '../../../utils/mapboxLoader';
import { ensureAMapLoaded } from '../../../utils/amapLoader';
import { getActiveMapStylePreset, getDefaultMaplibreStyle } from '../../../utils/gaodeMapStyle';
import { createCityFlight, cityFlightEasing, getCityFocusOffset } from '../utils/cityFlight';

const AMAP_READY_TIMEOUT_MS = 10000;
type MapProvider = 'amap' | 'maplibre' | 'mapbox';
type WebGLMap = MapLibreMap | MapboxMap;

function waitForMapboxReady(map: MapboxMap, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      map.off('load', onLoad);
      map.off('error', onError);
      signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onLoad = () => finish();
    const onError = ({ error }: { error: Error }) => finish(error);
    const onAbort = () => finish(new Error('地图初始化已取消'));
    const timer = window.setTimeout(() => finish(new Error('Mapbox 地图初始化超时')), 8000);
    map.on('load', onLoad);
    map.on('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

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

export const useMapInit = (
  containerRef: React.RefObject<HTMLDivElement>,
  activeView: string,
  { center = [105, 35], zoom = 3.2, preferMapbox = false }:
    { center?: [number, number]; zoom?: number; preferMapbox?: boolean } = {}
) => {
  const [centerLongitude, centerLatitude] = center;
  const mapInstance = useRef<any>(null);
  const maplibreInstance = useRef<MapLibreMap | null>(null);
  const mapboxInstance = useRef<MapboxMap | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapProvider, setMapProvider] = useState<MapProvider | null>(null);
  const [mapConfigRevision, setMapConfigRevision] = useState(0);
  const mapboxToken = preferMapbox ? getDiscoveryMapboxToken() : '';

  useEffect(() => {
    const onMapConfigChanged = () => {
      if (!mapboxInstance.current) setMapConfigRevision((v) => v + 1);
    };
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

  const destroyMapbox = useCallback(() => {
    mapboxInstance.current?.remove();
    mapboxInstance.current = null;
  }, []);

  const resizeMap = useCallback(() => {
    mapInstance.current?.resize?.();
    maplibreInstance.current?.resize?.();
    mapboxInstance.current?.resize();
  }, []);

  useEffect(() => {
    if (activeView !== 'explore-view') {
      destroyAMap();
      destroyMapLibre();
      destroyMapbox();
      setIsMapReady(false);
      setMapProvider(null);
      return;
    }

    if (!containerRef.current) return;
    if (mapInstance.current || maplibreInstance.current || mapboxInstance.current) return;

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
      if (mapboxToken) {
        try {
          const mapbox = await loadMapbox();
          if (cancelled || !containerRef.current) return;
          const map = new mapbox.Map({
            container: containerRef.current,
            accessToken: mapboxToken,
            style: 'mapbox://styles/mapbox/light-v10',
            language: 'zh-Hans',
            logoPosition: 'top-right',
            attributionControl: false,
            center: [centerLongitude, centerLatitude],
            zoom: zoom - 1,
            maxPitch: 0,
            dragRotate: false,
            touchPitch: false,
          });
          mapboxInstance.current = map;
          map.addControl(new mapbox.AttributionControl(), 'top-right');
          await waitForMapboxReady(map, controller.signal);
          if (cancelled) return;
          setMapProvider('mapbox');
          setIsMapReady(true);
          map.resize();
          return;
        } catch {
          if (cancelled) return;
          destroyMapbox();
        }
      }

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
      destroyMapbox();
    };
  }, [activeView, mapConfigRevision, mapboxToken, containerRef, destroyAMap, destroyMapLibre, destroyMapbox, centerLongitude, centerLatitude, zoom]);

  return { mapInstance, maplibreInstance, mapboxInstance, isMapReady, mapProvider, resizeMap };
};

export const useFocusMapOnCity = (
  mapInstance: React.MutableRefObject<any>,
  webGLInstance: React.RefObject<WebGLMap | null>,
  mapProvider: MapProvider | null,
  isMapReady: boolean,
  sectionRef: React.RefObject<HTMLElement>,
  containerRef: React.RefObject<HTMLDivElement>,
  isActive: boolean
) => {
  const cancelFlightRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    const viewScreen = sectionRef.current?.closest('[data-view-screen]');
    const cancel = () => cancelFlightRef.current?.();
    const visibilityChanged = () => { if (document.hidden) cancel(); };
    // Camera control immediately returns to the visitor on any map gesture.
    container?.addEventListener('pointerdown', cancel);
    container?.addEventListener('wheel', cancel, { passive: true });
    viewScreen?.addEventListener('viewleavestart', cancel);
    window.addEventListener('resize', cancel);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      cancel();
      container?.removeEventListener('pointerdown', cancel);
      container?.removeEventListener('wheel', cancel);
      viewScreen?.removeEventListener('viewleavestart', cancel);
      window.removeEventListener('resize', cancel);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [containerRef, sectionRef, isActive, isMapReady, mapProvider]);

  return useCallback(
    (lng: number, lat: number) => {
      if (!isMapReady || !isActive || !Number.isFinite(lng) || !Number.isFinite(lat)) return;
      const map = mapProvider === 'amap' ? mapInstance.current : webGLInstance.current;
      const container = containerRef.current;
      const section = sectionRef.current;
      if (!map || !container || !section) return;
      cancelFlightRef.current?.();
      const center = map.getCenter();
      const rect = container.getBoundingClientRect();
      const panel = section.querySelector<HTMLElement>('.curation-panel');
      const panelRect = panel?.getBoundingClientRect();
      // The mobile sheet publishes its settled top before its resize tween.
      const focusTop = panel?.dataset.focusTop;
      const focusRect = panelRect && panel?.dataset.mobile === 'true' && focusTop !== undefined
        ? { width: panelRect.width, height: panelRect.height, right: panelRect.right, top: Number(focusTop) }
        : panelRect;
      const offset = getCityFocusOffset(rect, focusRect);
      // The WebGL engines use one less zoom level for the same city scale.
      const targetZoom = mapProvider === 'amap' ? 10.2 : 9.2;
      const flight = createCityFlight({ from: [center.lng, center.lat], to: [lng, lat],
        zoom: map.getZoom(), targetZoom, width: rect.width, height: rect.height, offset,
        tileSize: mapProvider === 'amap' ? 256 : 512 });
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const duration = reducedMotion ? 0 : flight.duration;
      if (mapProvider !== 'amap') {
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
    [isMapReady, isActive, mapProvider, mapInstance, webGLInstance, sectionRef, containerRef]
  );
};

export const useMapMotion = (
  sectionRef: React.RefObject<HTMLElement>,
  mapInstance: React.MutableRefObject<any>,
  webGLInstance: React.RefObject<WebGLMap | null>,
  mapProvider: MapProvider | null,
  isMapReady: boolean,
  isActive: boolean
) => {
  useEffect(() => {
    const section = sectionRef.current;
    const map = mapProvider === 'amap' ? mapInstance.current : webGLInstance.current;
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
  }, [sectionRef, mapInstance, webGLInstance, mapProvider, isMapReady, isActive]);
};
