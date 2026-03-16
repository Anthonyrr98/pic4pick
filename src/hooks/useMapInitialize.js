import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { getEnvValue } from '../utils/envConfig';
import { handleError, ErrorType } from '../utils/errorHandler';

/**
 * 地图初始化 Hook
 * 统一管理地图初始化逻辑，避免重复代码
 * 
 * @param {Object} options - 配置选项
 * @param {string} options.containerId - 地图容器 ID
 * @param {number} options.latitude - 初始纬度
 * @param {number} options.longitude - 初始经度
 * @param {number} options.zoom - 初始缩放级别
 * @param {Function} options.onMapReady - 地图加载完成回调
 * @param {Function} options.onMarkerClick - 标记点击回调
 * @returns {Object} - 地图实例和相关方法
 */
export function useMapInitialize({
  containerId = 'map-container',
  latitude = 39.9042,
  longitude = 116.4074,
  zoom = 3,
  onMapReady,
  onMarkerClick,
} = {}) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const markersRef = useRef(new Map());

  // 获取地图 API URL
  const getMapUrl = useCallback(() => {
    const amapKey = getEnvValue('VITE_AMAP_KEY', '');
    if (!amapKey) {
      console.warn('VITE_AMAP_KEY not configured');
      return null;
    }
    return `https://webapi.amap.com/maps?v=2.0&key=${amapKey}`;
  }, []);

  // 初始化地图
  const initializeMap = useCallback(() => {
    try {
      const container = document.getElementById(containerId);
      if (!container) {
        handleError(new Error(`Map container not found: ${containerId}`), {
          context: 'useMapInitialize.initializeMap',
          type: ErrorType.DOM,
          silent: true,
        });
        return null;
      }

      containerRef.current = container;

      // 创建地图实例
      const map = new maplibregl.Map({
        container: containerId,
        style: 'https://demotiles.maplibre.org/style.json',
        center: [longitude, latitude],
        zoom: zoom,
        pitch: 0,
        bearing: 0,
      });

      // 地图加载完成
      map.on('load', () => {
        mapRef.current = map;
        onMapReady?.(map);
      });

      // 错误处理
      map.on('error', (e) => {
        handleError(e.error, {
          context: 'useMapInitialize.mapError',
          type: ErrorType.UNKNOWN,
          silent: true,
        });
      });

      return map;
    } catch (err) {
      handleError(err, {
        context: 'useMapInitialize.initializeMap',
        type: ErrorType.UNKNOWN,
      });
      return null;
    }
  }, [containerId, latitude, longitude, zoom, onMapReady]);

  // 添加标记
  const addMarker = useCallback((id, lat, lng, options = {}) => {
    if (!mapRef.current) return null;

    try {
      const marker = new maplibregl.Marker(options)
        .setLngLat([lng, lat])
        .addTo(mapRef.current);

      if (options.onClick) {
        marker.getElement().addEventListener('click', () => {
          options.onClick?.();
          onMarkerClick?.({ id, lat, lng });
        });
      }

      markersRef.current.set(id, marker);
      return marker;
    } catch (err) {
      handleError(err, {
        context: 'useMapInitialize.addMarker',
        type: ErrorType.UNKNOWN,
        silent: true,
      });
      return null;
    }
  }, [onMarkerClick]);

  // 移除标记
  const removeMarker = useCallback((id) => {
    const marker = markersRef.current.get(id);
    if (marker) {
      marker.remove();
      markersRef.current.delete(id);
    }
  }, []);

  // 清除所有标记
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
  }, []);

  // 飞到指定位置
  const flyTo = useCallback((lat, lng, zoom = 12) => {
    if (!mapRef.current) return;

    mapRef.current.flyTo({
      center: [lng, lat],
      zoom: zoom,
      duration: 1000,
    });
  }, []);

  // 设置中心点
  const setCenter = useCallback((lat, lng) => {
    if (!mapRef.current) return;

    mapRef.current.setCenter([lng, lat]);
  }, []);

  // 设置缩放级别
  const setZoom = useCallback((zoom) => {
    if (!mapRef.current) return;

    mapRef.current.setZoom(zoom);
  }, []);

  // 获取当前中心点
  const getCenter = useCallback(() => {
    if (!mapRef.current) return null;

    const center = mapRef.current.getCenter();
    return {
      latitude: center.lat,
      longitude: center.lng,
    };
  }, []);

  // 获取当前缩放级别
  const getZoom = useCallback(() => {
    if (!mapRef.current) return null;

    return mapRef.current.getZoom();
  }, []);

  // 销毁地图
  const destroyMap = useCallback(() => {
    clearMarkers();
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, [clearMarkers]);

  // 初始化
  useEffect(() => {
    const map = initializeMap();
    return () => {
      destroyMap();
    };
  }, [initializeMap, destroyMap]);

  return {
    map: mapRef.current,
    container: containerRef.current,
    addMarker,
    removeMarker,
    clearMarkers,
    flyTo,
    setCenter,
    setZoom,
    getCenter,
    getZoom,
    destroyMap,
  };
}
