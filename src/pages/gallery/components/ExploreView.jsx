import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createMarkerReveal } from '../../../utils/markerReveal';
import { loadMapLibre } from '../../../utils/maplibreLoader';
import { loadMapbox } from '../../../utils/mapboxLoader';
import { useMapInit, useFocusMapOnCity, useMapMotion } from '../hooks/useMapInit';
import { buildCityPhotoMap, buildCurationGroups, buildPhotosByLocation } from '../utils/photoDataUtils';
import { CurationPanel } from './CurationPanel';
import { EXPLORE_MARKER_COLORS, EXPLORE_MARKER_DOT_SIZE, EXPLORE_MARKER_BORDER_SIZE } from '../../../../packages/shared/exploreMarkerStyle';

const loadMarkerEngine = provider => {
  if (provider === 'mapbox') return loadMapbox();
  if (provider === 'maplibre') return loadMapLibre();
  return null;
};

export function ExploreView({
  isActive,
  approvedPhotos,
  allPhotos,
  isLoading,
  browserLocation,
  onShowLocationPanel,
  onPhotoClick,
}) {
  const mapContainerRef = useRef(null);
  const sectionRef = useRef(null);
  const exploreMarkersRef = useRef([]);
  const exploreWebGLMarkersRef = useRef([]);
  const currentLocationMarkerRef = useRef(null);
  const currentLocationWebGLMarkerRef = useRef(null);
  const pendingFocusRef = useRef(null);
  const markerRevealRef = useRef(null);
  const activeRef = useRef(isActive);
  useLayoutEffect(() => {
    activeRef.current = isActive;
    if (!isActive) markerRevealRef.current?.finish();
  }, [isActive]);

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
    mapboxInstance,
    isMapReady,
    mapProvider,
    resizeMap,
  } = useMapInit(mapContainerRef, 'explore-view', { preferMapbox: true });
  const webGLInstance = mapProvider === 'mapbox' ? mapboxInstance : maplibreInstance;
  const focusMapOnCity = useFocusMapOnCity(mapInstance, webGLInstance, mapProvider,
    isMapReady, sectionRef, mapContainerRef, isActive);
  useMapMotion(sectionRef, mapInstance, webGLInstance, mapProvider, isMapReady, isActive);

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
    if (!isActive || !isMapReady) return;
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resizeMap);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mapContainerRef.current);
    resize();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isActive, isMapReady, resizeMap]);

  useEffect(() => {
    if (!isMapReady) return;
    let cancelled = false;
    exploreMarkersRef.current.forEach((marker) => marker?.setMap?.(null));
    exploreMarkersRef.current = [];
    exploreWebGLMarkersRef.current.forEach((marker) => marker.remove());
    exploreWebGLMarkersRef.current = [];
    if (!photosByLocation || photosByLocation.length === 0) return;

    const drawMarkers = async () => {
      const engine = await loadMarkerEngine(mapProvider);
      if (cancelled) return;

      const markerDots = [];
      const markerTargets = [];
      const showLocation = group => onShowLocationPanel({
        title: group.location || group.country || '未命名地点',
        subtitle: group.country
          ? group.location ? `${group.country} · ${group.location}` : group.country
          : '',
        photos: group.photos,
        emptyMessage: group.photos.length === 0 ? '当前地点暂时没有图库照片' : '',
      });
      photosByLocation.forEach((group, index) => {
        const color = EXPLORE_MARKER_COLORS[index % EXPLORE_MARKER_COLORS.length];
        const anchor = document.createElement('button');
        anchor.type = 'button';
        anchor.className = 'explore-marker-target';
        const label = `${group.location || group.country || '未命名地点'} · ${group.photos.length} 张照片`;
        anchor.setAttribute('aria-label', label);
        const dot = document.createElement('div');
        dot.className = 'explore-marker';
        dot.style.cssText = [
          `width:${EXPLORE_MARKER_DOT_SIZE}px`,
          `height:${EXPLORE_MARKER_DOT_SIZE}px`,
          'border-radius:999px',
          `background:${color}`,
          `border:${EXPLORE_MARKER_BORDER_SIZE}px solid #ffffff`,
          'box-shadow:0 0 0 1px rgba(0,0,0,0.35),0 6px 12px rgba(0,0,0,0.25)',
          'cursor:pointer',
        ].join(';');
        dot.setAttribute('aria-hidden', 'true');
        anchor.appendChild(dot);
        const tooltip = document.createElement('span');
        tooltip.className = 'explore-marker-tooltip';
        tooltip.textContent = label;
        tooltip.setAttribute('aria-hidden', 'true');
        anchor.appendChild(tooltip);
        markerTargets.push({ anchor, group });
        anchor.addEventListener('click', event => {
          event.stopPropagation();
          let selected = group;
          // Enlarged transparent targets can overlap: select the closest visible dot.
          // Keyboard activation has no pointer position and keeps its focused target.
          if (event.detail > 0) {
            let nearestDistance = Infinity;
            markerTargets.forEach(target => {
              const rect = target.anchor.getBoundingClientRect();
              if (!rect.width || !rect.height) return;
              const distance = (event.clientX - rect.left - rect.width / 2) ** 2
                + (event.clientY - rect.top - rect.height / 2) ** 2;
              if (distance < nearestDistance) {
                nearestDistance = distance;
                selected = target.group;
              }
            });
          }
          showLocation(selected);
        });

        if (mapProvider === 'amap') {
          if (!mapInstance.current || !window.AMap) return;
          const marker = new window.AMap.Marker({
            position: [group.lng, group.lat],
            content: anchor,
            offset: new window.AMap.Pixel(-22, -22),
            map: mapInstance.current,
          });
          exploreMarkersRef.current.push(marker);
        } else if (engine && webGLInstance.current) {
          const marker = new engine.Marker({ element: anchor, anchor: 'center' })
            .setLngLat([group.lng, group.lat])
            .addTo(webGLInstance.current);
          exploreWebGLMarkersRef.current.push(marker);
        } else {
          return;
        }

        markerDots.push(dot);
      });

      markerRevealRef.current = createMarkerReveal(markerDots, sectionRef.current,
        () => activeRef.current && !document.hidden);
    };

    drawMarkers();
    return () => {
      cancelled = true;
      markerRevealRef.current?.dispose();
      markerRevealRef.current = null;
      exploreMarkersRef.current.forEach((marker) => marker?.setMap?.(null));
      exploreMarkersRef.current = [];
      exploreWebGLMarkersRef.current.forEach((marker) => marker.remove());
      exploreWebGLMarkersRef.current = [];
    };
  }, [isMapReady, mapInstance, mapProvider, webGLInstance, onShowLocationPanel, photosByLocation]);

  useEffect(() => {
    if (!isMapReady || !browserLocation) return;
    let cancelled = false;
    currentLocationMarkerRef.current?.setMap?.(null);
    currentLocationMarkerRef.current = null;
    currentLocationWebGLMarkerRef.current?.remove();
    currentLocationWebGLMarkerRef.current = null;

    const addCurrentMarker = async () => {
      const engine = await loadMarkerEngine(mapProvider);
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
      } else if (engine && webGLInstance.current) {
        currentLocationWebGLMarkerRef.current = new engine.Marker({ element: locAnchor, anchor: 'center' })
          .setLngLat([browserLocation.lon, browserLocation.lat])
          .addTo(webGLInstance.current);
      }
    };

    addCurrentMarker();
    return () => {
      cancelled = true;
      currentLocationMarkerRef.current?.setMap?.(null);
      currentLocationMarkerRef.current = null;
      currentLocationWebGLMarkerRef.current?.remove();
      currentLocationWebGLMarkerRef.current = null;
    };
  }, [browserLocation, isMapReady, mapInstance, mapProvider, webGLInstance]);

  return (
    <section ref={sectionRef} id="explore-view" className="screen active">
      <CurationPanel
        isActive={isActive}
        groups={curationGroups}
        isLoading={isLoading}
        expandedCategories={expandedCategories}
        onToggleCategory={(id) => setCategoryExpansionOverrides((prev) =>
          window.matchMedia('(max-width: 768px)').matches
            ? Object.fromEntries(curationGroups.map(group => [group.id, group.id === id && !(prev[id] ?? false)]))
            : { ...prev, [id]: !(prev[id] ?? false) }
        )}
        onCityClick={handleCityCardClick}
        onPhotoClick={onPhotoClick}
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
