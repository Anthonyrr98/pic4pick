import { useEffect, useRef } from 'react';
import { useGaodeMapInit } from '../hooks/useMapInit';
import { loadMapLibre } from '../../../utils/maplibreLoader';
import { escapeHtml } from '../../../utils/security';
import { handleError, ErrorType } from '../../../utils/errorHandler';

const createMarkerElement = (color) => {
  const element = document.createElement('div');
  element.style.cssText = `width:30px;height:30px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;`;
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
        const addMarker = (coordinates, color, html) => {
          const marker = new AMap.Marker({
            position: coordinates, content: createMarkerElement(color),
            offset: new AMap.Pixel(-15, -15), map,
          });
          const popup = new AMap.InfoWindow({ content: html, offset: new AMap.Pixel(0, -20) });
          const open = () => popup.open(map, coordinates);
          marker.on('click', open);
          open();
          cleanup.push(() => { popup.close(); marker.off('click', open); marker.setMap(null); });
        };
        addMarker(position, '#e74c3c', content);
        if (hasBrowserLocation) {
          addMarker(currentPosition, '#3498db', '<strong>当前位置</strong>');
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
      const addMarker = (coordinates, color, html) => {
        const popup = new maplibregl.Popup({ offset: 25 }).setHTML(html);
        const marker = new maplibregl.Marker({ element: createMarkerElement(color) })
          .setLngLat(coordinates).setPopup(popup).addTo(map);
        marker.togglePopup();
        cleanup.push(() => marker.remove());
      };
      addMarker(position, '#e74c3c', content);
      if (hasBrowserLocation) {
        addMarker(currentPosition, '#3498db', '<strong>当前位置</strong>');
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
