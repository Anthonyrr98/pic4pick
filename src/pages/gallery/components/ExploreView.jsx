import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadMapLibre } from '../../../utils/maplibreLoader';
import { useGaodeMapInit, useFocusMapOnCity } from '../hooks/useMapInit';
import { buildCityPhotoMap, buildCurationGroups, buildPhotosByLocation } from '../utils/photoDataUtils';
import { CurationPanel } from './CurationPanel';

export function ExploreView({
  approvedPhotos,
  allPhotos,
  browserLocation,
  onShowLocationPanel,
}) {
  const mapContainerRef = useRef(null);
  const maplibreRef = useRef(null);
  const exploreMarkersRef = useRef([]);
  const exploreMaplibreMarkersRef = useRef([]);
  const currentLocationMarkerRef = useRef(null);
  const currentLocationMaplibreMarkerRef = useRef(null);
  const pendingFocusRef = useRef(null);

  const [categoryExpansionOverrides, setCategoryExpansionOverrides] = useState({});
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [activeCitySelection, setActiveCitySelection] = useState(null);

  const photosByLocation = useMemo(
    () => buildPhotosByLocation(approvedPhotos),
    [approvedPhotos]
  );
  const cityPhotoMap = useMemo(() => buildCityPhotoMap(allPhotos), [allPhotos]);
  const curationGroups = useMemo(
    () => buildCurationGroups(cityPhotoMap),
    [cityPhotoMap]
  );
  const expandedCategories = useMemo(() => {
    const next = {};
    curationGroups.forEach((group) => {
      next[group.id] = categoryExpansionOverrides[group.id] ?? false;
    });
    return next;
  }, [categoryExpansionOverrides, curationGroups]);

  const {
    mapInstance,
    maplibreInstance,
    isMapReady,
    mapProvider,
    resizeMap,
  } = useGaodeMapInit(mapContainerRef, 'explore-view');
  const focusMapOnCity = useFocusMapOnCity(mapInstance, maplibreInstance, mapProvider, isMapReady);

  const ensureMapLibre = useCallback(async () => {
    if (!maplibreRef.current) {
      maplibreRef.current = await loadMapLibre();
    }
    return maplibreRef.current;
  }, []);

  const handleCityCardClick = useCallback(
    (province, city) => {
      setActiveCitySelection({ provinceId: province.id, cityId: city.id });
      onShowLocationPanel(null);

      if (city.lng == null || city.lat == null) return;
      if (isMapReady) {
        focusMapOnCity(city.lng, city.lat);
        pendingFocusRef.current = null;
      } else {
        pendingFocusRef.current = { lng: city.lng, lat: city.lat };
      }
    },
    [focusMapOnCity, isMapReady, onShowLocationPanel]
  );

  useEffect(() => {
    if (!isMapReady || !pendingFocusRef.current) return;
    const { lng, lat } = pendingFocusRef.current;
    focusMapOnCity(lng, lat);
    pendingFocusRef.current = null;
  }, [focusMapOnCity, isMapReady]);

  useEffect(() => {
    const adjust = () => {
      const wrapper = document.querySelector('.explore-fullscreen .map-wrapper');
      if (wrapper) {
        wrapper.style.top = '0';
        wrapper.style.height = '100vh';
      }
      resizeMap();
    };

    const firstResizeTimer = setTimeout(adjust, 100);
    const secondResizeTimer = setTimeout(resizeMap, 300);
    window.addEventListener('resize', adjust);
    return () => {
      clearTimeout(firstResizeTimer);
      clearTimeout(secondResizeTimer);
      window.removeEventListener('resize', adjust);
    };
  }, [resizeMap]);

  useEffect(() => {
    if (!isMapReady) return;
    let cancelled = false;
    exploreMarkersRef.current.forEach((marker) => marker?.setMap?.(null));
    exploreMarkersRef.current = [];
    exploreMaplibreMarkersRef.current.forEach((marker) => marker.remove());
    exploreMaplibreMarkersRef.current = [];
    if (!photosByLocation || photosByLocation.length === 0) return;

    const drawMarkers = async () => {
      const maplibregl = mapProvider === 'maplibre' ? await ensureMapLibre() : null;
      if (cancelled) return;

      const palette = ['#cfa56a', '#111218', '#9b9dad', '#d48a48'];
      const markerDots = [];
      photosByLocation.forEach((group, index) => {
        const color = palette[index % palette.length];
        const anchor = document.createElement('div');
        anchor.style.cssText = 'display:block;line-height:0;';
        const dot = document.createElement('div');
        dot.className = 'explore-marker';
        dot.style.cssText = [
          'width:9px',
          'height:9px',
          'border-radius:999px',
          `background:${color}`,
          'border:2px solid #ffffff',
          'box-shadow:0 0 0 1px rgba(0,0,0,0.35),0 6px 12px rgba(0,0,0,0.25)',
          'cursor:pointer',
          'transition:transform 0.2s ease,opacity 0.2s ease',
          'opacity:0',
          'transform:scale(0)',
        ].join(';');
        anchor.appendChild(dot);
        anchor.addEventListener('click', () => {
          onShowLocationPanel({
            title: group.location || group.country || '未命名地点',
            subtitle: group.country
              ? group.location ? `${group.country} · ${group.location}` : group.country
              : '',
            photos: group.photos,
            emptyMessage: group.photos.length === 0 ? '当前地点暂时没有图库照片' : '',
          });
        });

        if (mapProvider === 'amap') {
          if (!mapInstance.current || !window.AMap) return;
          const marker = new window.AMap.Marker({
            position: [group.lng, group.lat],
            content: anchor,
            offset: new window.AMap.Pixel(-6, -6),
            map: mapInstance.current,
          });
          exploreMarkersRef.current.push(marker);
        } else if (mapProvider === 'maplibre') {
          if (!maplibreInstance.current || !maplibregl) return;
          const marker = new maplibregl.Marker({ element: anchor, anchor: 'center' })
            .setLngLat([group.lng, group.lat])
            .addTo(maplibreInstance.current);
          exploreMaplibreMarkersRef.current.push(marker);
        } else {
          return;
        }

        markerDots.push(dot);
      });

      markerDots.forEach((dot, index) => {
        const reveal = () => {
          dot.style.opacity = '1';
          dot.style.transform = 'scale(1)';
        };
        if (index === 0) requestAnimationFrame(reveal);
        else setTimeout(reveal, index * 10);
      });
    };

    drawMarkers();
    return () => {
      cancelled = true;
      exploreMarkersRef.current.forEach((marker) => marker?.setMap?.(null));
      exploreMarkersRef.current = [];
      exploreMaplibreMarkersRef.current.forEach((marker) => marker.remove());
      exploreMaplibreMarkersRef.current = [];
    };
  }, [ensureMapLibre, isMapReady, mapInstance, mapProvider, maplibreInstance, onShowLocationPanel, photosByLocation]);

  useEffect(() => {
    if (!isMapReady || !browserLocation) return;
    let cancelled = false;
    currentLocationMarkerRef.current?.setMap?.(null);
    currentLocationMarkerRef.current = null;
    currentLocationMaplibreMarkerRef.current?.remove();
    currentLocationMaplibreMarkerRef.current = null;

    const addCurrentMarker = async () => {
      const maplibregl = mapProvider === 'maplibre' ? await ensureMapLibre() : null;
      if (cancelled) return;
      const locAnchor = document.createElement('div');
      locAnchor.style.cssText = 'display:block;line-height:0;';
      const locDot = document.createElement('div');
      locDot.style.cssText = 'width:12px;height:12px;border-radius:999px;background:rgba(80,155,255,0.9);border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.3),0 4px 10px rgba(0,0,0,0.25);position:relative;z-index:1000;display:block;';
      locAnchor.appendChild(locDot);

      if (mapProvider === 'amap' && mapInstance.current && window.AMap) {
        currentLocationMarkerRef.current = new window.AMap.Marker({
          position: [browserLocation.lon, browserLocation.lat],
          content: locAnchor,
          offset: new window.AMap.Pixel(-6, -6),
          map: mapInstance.current,
          zIndex: 1000,
        });
      } else if (mapProvider === 'maplibre' && maplibreInstance.current && maplibregl) {
        currentLocationMaplibreMarkerRef.current = new maplibregl.Marker({ element: locAnchor, anchor: 'center' })
          .setLngLat([browserLocation.lon, browserLocation.lat])
          .addTo(maplibreInstance.current);
      }
    };

    addCurrentMarker();
    return () => {
      cancelled = true;
      currentLocationMarkerRef.current?.setMap?.(null);
      currentLocationMarkerRef.current = null;
      currentLocationMaplibreMarkerRef.current?.remove();
      currentLocationMaplibreMarkerRef.current = null;
    };
  }, [browserLocation, ensureMapLibre, isMapReady, mapInstance, mapProvider, maplibreInstance]);

  return (
    <section id="explore-view" className="screen active">
      <CurationPanel
        groups={curationGroups}
        expandedCategories={expandedCategories}
        onToggleCategory={(id) =>
          setCategoryExpansionOverrides((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }))
        }
        onCityClick={handleCityCardClick}
        activeCitySelection={activeCitySelection}
        isPanelCollapsed={isPanelCollapsed}
        onTogglePanelCollapse={() => setIsPanelCollapsed((prev) => !prev)}
      />
      <div className="map-wrapper">
        {!isMapReady && (
          <div className="explore-map-loading" role="status" aria-live="polite">
            <div className="explore-map-loading-inner">
              <span className="explore-map-loading-dial" aria-hidden="true" />
              <span>地图正在显影…</span>
            </div>
          </div>
        )}
        <div id="mapCanvas" ref={mapContainerRef} />
      </div>
    </section>
  );
}
