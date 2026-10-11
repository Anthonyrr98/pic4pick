import { useEffect, useRef } from 'react';
import { useGaodeMapInit } from '../hooks/useMapInit';
import { loadMapLibre } from '../../../utils/maplibreLoader';
import { escapeHtml } from '../../../utils/security';
import { handleError, ErrorType } from '../../../utils/errorHandler';

const createMarkerElement = (kind, label) => {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'photo-map-marker-target';
  element.dataset.kind = kind;
  element.setAttribute('aria-label', label);
  const dot = document.createElement('span');
  dot.className = 'photo-map-marker-dot';
  dot.setAttribute('aria-hidden', 'true');
  element.appendChild(dot);
  return element;
};

export function PhotoLocationMap({ geoInfo, title }) {
  const containerRef = useRef(null);
  const { latitude, longitude, place, browserLocation } = geoInfo;
  const browserLatitude = browserLocation?.lat;
  const browserLongitude = browserLocation?.lon;
  const { mapInstance, maplibreInstance, isMapReady, mapProvider, resizeMap } = useGaodeMapInit(
    containerRef, 'explore-view', { center: [longitude, latitude], zoom: 10 }
  );

  useEffect(() => {
    const observer = new ResizeObserver(resizeMap);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [resizeMap]);

  useEffect(() => {
    if (!isMapReady) return;
    let cancelled = false;
    const cleanup = [];
    const position = [longitude, latitude];
    const hasBrowserLocation = browserLatitude != null && browserLongitude != null;
    const currentPosition = [browserLongitude, browserLatitude];
    const content = `<strong>${escapeHtml(title || '照片位置')}</strong><br>${escapeHtml(place)}`;

    const drawMarkers = async () => {
      if (mapProvider === 'amap' && mapInstance.current) {
        const map = mapInstance.current;
        const AMap = window.AMap;
        const addMarker = (coordinates, kind, html, label) => {
          const element = createMarkerElement(kind, label);
          const marker = new AMap.Marker({
            position: coordinates, content: element,
            offset: new AMap.Pixel(-22, -22), map,
          });
          const popup = new AMap.InfoWindow({ content: html, offset: new AMap.Pixel(0, -12) });
          const open = event => {
            event?.stopPropagation();
            popup.open(map, coordinates);
          };
          element.addEventListener('click', open);
          open();
          cleanup.push(() => { popup.close(); element.removeEventListener('click', open); marker.setMap(null); });
        };
        addMarker(position, 'photo', content, `照片拍摄地点：${title || place}`);
        if (hasBrowserLocation) {
          addMarker(currentPosition, 'current', '<strong>当前位置</strong>', '当前位置');
          const line = new AMap.Polyline({
            path: [position, currentPosition], strokeColor: '#e7b17c',
            strokeWeight: 2, strokeOpacity: 0.6, strokeStyle: 'dashed', map,
          });
          cleanup.push(() => line.setMap(null));
        }
        return;
      }

      if (mapProvider !== 'maplibre' || !maplibreInstance.current) return;
      const maplibregl = await loadMapLibre();
      if (cancelled || !maplibreInstance.current) return;
      const map = maplibreInstance.current;
      const addMarker = (coordinates, kind, html, label) => {
        const element = createMarkerElement(kind, label);
        const popup = new maplibregl.Popup({ offset: 14 }).setHTML(html);
        const marker = new maplibregl.Marker({ element })
          .setLngLat(coordinates).addTo(map);
        const open = event => {
          event?.stopPropagation();
          popup.setLngLat(coordinates).addTo(map);
        };
        element.addEventListener('click', open);
        open();
        cleanup.push(() => { popup.remove(); element.removeEventListener('click', open); marker.remove(); });
      };
      addMarker(position, 'photo', content, `照片拍摄地点：${title || place}`);
      if (hasBrowserLocation) {
        addMarker(currentPosition, 'current', '<strong>当前位置</strong>', '当前位置');
        map.addSource('connection-line', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [position, currentPosition] } },
        });
        map.addLayer({
          id: 'connection-line', type: 'line', source: 'connection-line',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#e7b17c', 'line-width': 2, 'line-opacity': 0.6, 'line-dasharray': [5, 10] },
        });
        cleanup.push(() => {
          if (maplibreInstance.current !== map) return;
          if (map.getLayer('connection-line')) map.removeLayer('connection-line');
          if (map.getSource('connection-line')) map.removeSource('connection-line');
        });
      }
    };
    void drawMarkers().catch(error => handleError(error, {
      context: 'PhotoLocationMap.markers', type: ErrorType.DOM, silent: true,
    }));
    return () => {
      cancelled = true;
      cleanup.forEach(remove => remove());
    };
  }, [isMapReady, mapProvider, mapInstance, maplibreInstance, latitude, longitude, place, title, browserLatitude, browserLongitude]);

  return <div ref={containerRef} className="photo-location-map" style={{
    width: '100%', height: '240px', minHeight: '240px',
    marginBottom: '16px', borderRadius: '8px',
    overflow: 'hidden', border: '1px solid var(--border)',
  }} />;
}
