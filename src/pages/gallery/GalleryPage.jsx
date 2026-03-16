import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../App.css';
import { getSupabaseClient } from '../../utils/supabaseClient';
import {
  BRAND_LOGO_EVENT,
  BRAND_LOGO_STORAGE_KEY,
  BRAND_LOGO_SUPABASE_ID,
  BRAND_LOGO_SUPABASE_TABLE,
  getStoredBrandLogo,
  saveBrandLogo,
  getStoredBrandText,
  saveBrandText,
} from '../../utils/branding';
import { StorageString, STORAGE_KEYS } from '../../utils/storage';
import { handleError, safeSync, ErrorType } from '../../utils/errorHandler';

// 鈹€鈹€ 妯″潡鍖栧瓙妯″潡
import { calculateDistance, decimalToDMS } from './utils/geoUtils';
import { getShotTimeInfo } from './utils/timeUtils';
import { buildCityPhotoMap, buildCurationGroups, buildPhotosByLocation } from './utils/photoDataUtils';
import { filterAndSortPhotos } from './utils/photoFilterUtils';
import { usePhotoData, useLikePhoto } from './hooks/usePhotoData';
import { useExifData, useBrowserLocation } from './hooks/useExifAndLocation';
import { useGaodeMapInit, useFocusMapOnCity } from './hooks/useMapInit';
import { TabStrip } from './components/TabStrip';
import { PhotoGrid } from './components/PhotoGrid';
import { CurationPanel } from './components/CurationPanel';
import { LocationPanel } from './components/LocationPanel';

export function GalleryPage() {
  const supabase = getSupabaseClient();

  // 鈹€鈹€ 瑙嗗浘 & 绛涢€夌姸鎬?
  const [activeFilter, setActiveFilter] = useState('latest');
  const [activeView, setActiveView] = useState(() => {
    const stored = StorageString.get(STORAGE_KEYS.ACTIVE_VIEW, 'gallery-view');
    return stored === 'explore-view' ? 'explore-view' : 'gallery-view';
  });

  // 鈹€鈹€ Lightbox 鐘舵€?
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [metaPopover, setMetaPopover] = useState(null);
  const [showMobileMeta, setShowMobileMeta] = useState(false);

  // 鈹€鈹€ 鍝佺墝鐘舵€?
  const [brandLogo, setBrandLogo] = useState(() => getStoredBrandLogo());
  const [brandText, setBrandText] = useState(() => getStoredBrandText());
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 768 : false
  );

  // 鈹€鈹€ 鍦板浘 ref
  const mapContainerRef = useRef(null);
  const geoMapContainerRef = useRef(null);
  const geoMapInstance = useRef(null);
  const exploreMarkersRef = useRef([]);
  const exploreMaplibreMarkersRef = useRef([]);
  const currentLocationMarkerRef = useRef(null);
  const currentLocationMaplibreMarkerRef = useRef(null);

  // 鈹€鈹€ 鍙戠幇瑙嗗浘闈㈡澘鐘舵€?
  const [locationPanel, setLocationPanel] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [activeCitySelection, setActiveCitySelection] = useState(null);

  // 鈹€鈹€ 鍒嗛〉
  const [displayedCount, setDisplayedCount] = useState(12);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef(null);

  // 鈹€鈹€ 鏁版嵁 Hooks
  const { approvedPhotos, setApprovedPhotos, supabaseError } = usePhotoData(supabase);
  const { likedPhotoIds, handleToggleLike } = useLikePhoto(supabase, setApprovedPhotos);
  const browserLocation = useBrowserLocation();
  const exifData = useExifData(lightboxPhoto);

  // 鈹€鈹€ 鍦板浘 Hooks
  const {
    mapInstance,
    maplibreInstance: maplibreExploreInstance,
    isMapReady,
    mapProvider: exploreMapProvider,
    mapHint: exploreMapHint,
    resizeMap,
  } = useGaodeMapInit(mapContainerRef, activeView);
  const focusMapOnCity = useFocusMapOnCity(mapInstance, isMapReady);

  // 鈹€鈹€ 娲剧敓鏁版嵁
  const allPhotos = useMemo(() => approvedPhotos.filter((p) => !p.hidden), [approvedPhotos]);

  const photosByLocation = useMemo(
    () => buildPhotosByLocation(approvedPhotos),
    [approvedPhotos]
  );

  const cityPhotoMap = useMemo(() => buildCityPhotoMap(allPhotos), [allPhotos]);

  const curationGroups = useMemo(
    () => buildCurationGroups(cityPhotoMap),
    [cityPhotoMap]
  );

  const filteredPhotos = useMemo(
    () => filterAndSortPhotos(allPhotos, activeFilter, browserLocation, calculateDistance),
    [allPhotos, activeFilter, browserLocation]
  );

  const displayedPhotos = useMemo(
    () => filteredPhotos.slice(0, displayedCount),
    [filteredPhotos, displayedCount]
  );

  const hasMore = displayedCount < filteredPhotos.length;

  // 鈹€鈹€ 鍦扮悊淇℃伅锛圠ightbox 鐢級
  const getGeoInfo = useMemo(() => {
    if (!lightboxPhoto) return null;
    const lat = exifData?.latitude ?? lightboxPhoto.latitude;
    const lon = exifData?.longitude ?? lightboxPhoto.longitude;
    const altitude = exifData?.GPSAltitude ?? lightboxPhoto.altitude;
    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return null;
    const refLat = browserLocation?.lat ?? 39.9042;
    const refLon = browserLocation?.lon ?? 116.4074;
    const distance = calculateDistance(refLat, refLon, Number(lat), Number(lon));
    return {
      place: `${lightboxPhoto.country || ''}${
        lightboxPhoto.location ? ' 路 ' + lightboxPhoto.location : ''
      }`,
      latDms: decimalToDMS(Number(lat), true),
      lonDms: decimalToDMS(Number(lon), false),
      lat: Number(lat).toFixed(6),
      lon: Number(lon).toFixed(6),
      latitude: Number(lat),
      longitude: Number(lon),
      altitude: altitude != null ? `${altitude} m` : '鏈煡',
      distance: distance != null ? `${distance.toLocaleString()} km` : '鏈煡',
      browserLocation,
    };
  }, [lightboxPhoto, exifData, browserLocation]);

  // 鈹€鈹€ 浜嬩欢澶勭悊
  const handleViewChange = useCallback((view) => {
    setActiveView(view);
    StorageString.set(STORAGE_KEYS.ACTIVE_VIEW, view);
  }, []);

  const showLocationPanel = useCallback(
    (panelData, options = {}) => {
      const { ensureExplore = false } = options;
      const reveal = () => setLocationPanel(panelData);
      if (ensureExplore && activeView !== 'explore-view') {
        handleViewChange('explore-view');
        (window.requestAnimationFrame || ((cb) => setTimeout(cb, 0)))(reveal);
      } else {
        reveal();
      }
    },
    [activeView, handleViewChange]
  );

  const handleCityCardClick = useCallback(
    (province, city) => {
      setActiveCitySelection({ provinceId: province.id, cityId: city.id });
      setLocationPanel(null);
      const focus = () => {
        if (city.lng != null && city.lat != null) focusMapOnCity(city.lng, city.lat);
      };
      if (activeView !== 'explore-view') {
        handleViewChange('explore-view');
        (window.requestAnimationFrame || ((cb) => setTimeout(cb, 0)))(focus);
      } else {
        focus();
      }
    },
    [activeView, focusMapOnCity, handleViewChange]
  );

  const loadMore = useCallback(() => {
    if (isLoadingMore || displayedCount >= filteredPhotos.length) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayedCount((prev) => Math.min(prev + 12, filteredPhotos.length));
      setIsLoadingMore(false);
    }, 300);
  }, [isLoadingMore, displayedCount, filteredPhotos.length]);

  const openMetaPopover = useCallback((tab, event) => {
    const { clientX, clientY } = event;
    const offset = 18;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const ew = tab === 'geo' ? 520 : 260;
    const eh = tab === 'geo' ? Math.min(600, vh * 0.9) : 220;
    let x, y;
    if (tab === 'geo') {
      x = clientX + offset;
      if (x + ew > vw - 24) x = clientX - ew - offset;
      if (x < 12) x = Math.max(12, (vw - ew) / 2);
      if (x + ew > vw - 12) x = vw - ew - 12;
      y = clientY + offset;
      if (y + eh > vh - 24) y = clientY - eh - offset;
      if (y < 12) y = Math.max(12, (vh - eh) / 2);
      if (y + eh > vh - 12) y = vh - eh - 12;
    } else {
      x = clientX + offset;
      y = clientY + offset - 12;
      if (x + ew > vw - 24) x = clientX - ew - offset;
      if (x < 12) x = 12;
      if (y + eh > vh - 24) y = clientY - eh - offset;
      if (y < 12) y = 12;
      if (y + eh > vh - 12) y = vh - eh - 12;
    }
    setMetaPopover({ tab, x, y });
  }, []);

  // 鈹€鈹€ Effects
  useEffect(() => {
    setExpandedCategories((prev) => {
      const next = {};
      curationGroups.forEach((g) => {
        next[g.id] = typeof prev[g.id] === 'boolean' ? prev[g.id] : false;
      });
      return next;
    });
  }, [curationGroups]);

  useEffect(() => { setDisplayedCount(12); }, [activeFilter]);

  useEffect(() => {
    if (lightboxPhoto) setShowMobileMeta(false);
  }, [lightboxPhoto]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (metaPopover) setMetaPopover(null);
        else setLightboxPhoto(null);
      }
    };
    if (lightboxPhoto || metaPopover) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxPhoto, metaPopover]);

  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && hasMore) loadMore();
      },
      { rootMargin: '200px', threshold: 0.1 }
    );
    obs.observe(loadMoreRef.current);
    return () => { if (loadMoreRef.current) obs.unobserve(loadMoreRef.current); };
  }, [hasMore, isLoadingMore, loadMore]);

  useEffect(() => {
    const onBroadcast = (e) =>
      setBrandLogo(typeof e.detail === 'string' ? e.detail : getStoredBrandLogo());
    const onStorage = (e) => {
      if (e.key === BRAND_LOGO_STORAGE_KEY) setBrandLogo(e.newValue || '');
    };
    window.addEventListener(BRAND_LOGO_EVENT, onBroadcast);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(BRAND_LOGO_EVENT, onBroadcast);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth > 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 浠?Supabase 鍚屾鍝佺墝閰嶇疆
  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;
    const fetchBranding = async () => {
      try {
        const { data, error } = await supabase
          .from(BRAND_LOGO_SUPABASE_TABLE)
          .select('logo_data, logo_url, site_title, site_subtitle, admin_title, admin_subtitle')
          .eq('id', BRAND_LOGO_SUPABASE_ID)
          .limit(1);
        if (error) {
          handleError(error, { context: 'fetchBranding', type: ErrorType.NETWORK, silent: true });
          return;
        }
        const record = Array.isArray(data) ? data[0] : null;
        if (!isMounted || !record) return;
        const remoteLogo = record.logo_data || record.logo_url || '';
        if (remoteLogo) { saveBrandLogo(remoteLogo); setBrandLogo(remoteLogo); }
        setBrandText((prev) => {
          const merged = {
            siteTitle: record.site_title || prev.siteTitle,
            siteSubtitle: record.site_subtitle || prev.siteSubtitle,
            adminTitle: record.admin_title || prev.adminTitle,
            adminSubtitle: record.admin_subtitle || prev.adminSubtitle,
          };
          safeSync(() => saveBrandText(merged), {
            context: 'fetchBranding.save',
            type: ErrorType.STORAGE,
            silent: true,
            throwError: false,
          });
          return merged;
        });
      } catch (err) {
        handleError(err, { context: 'fetchBranding', type: ErrorType.NETWORK, silent: true });
      }
    };
    fetchBranding();
    return () => { isMounted = false; };
  }, [supabase]);

  // 鍙戠幇瑙嗗浘锛氬湴鍥惧叏灞忓昂瀵镐慨姝?
  useEffect(() => {
    if (activeView !== 'explore-view') return;
    const adjust = () => {
      const mw = document.querySelector('.explore-fullscreen .map-wrapper');
      if (mw) { mw.style.top = '0'; mw.style.height = '100vh'; }
      resizeMap();
    };
    // 初次进入：两档延迟覆盖布局完成时序
    const t1 = setTimeout(adjust, 100);
    const t2 = setTimeout(resizeMap, 300);
    window.addEventListener('resize', adjust);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', adjust);
    };
  }, [activeView, resizeMap]);

  // 在地图上绘制照片位置标记
  useEffect(() => {
    if (activeView !== 'explore-view' || !isMapReady) return;
    exploreMarkersRef.current.forEach((m) => m?.setMap?.(null));
    exploreMarkersRef.current = [];
    exploreMaplibreMarkersRef.current.forEach((m) => m.remove());
    exploreMaplibreMarkersRef.current = [];
    if (!photosByLocation || photosByLocation.length === 0) return;
    const palette = ['#cfa56a', '#111218', '#9b9dad', '#d48a48'];
    const markerEls = [];
    photosByLocation.forEach((group, index) => {
      const el = document.createElement('div');
      el.className = 'explore-marker';
      const color = palette[index % palette.length];
      el.style.cssText = [
        'width:9px', 'height:9px', 'border-radius:999px',
        `background:${color}`, 'border:2px solid #ffffff',
        'box-shadow:0 0 0 1px rgba(0,0,0,0.35),0 6px 12px rgba(0,0,0,0.25)',
        'cursor:pointer', 'transition:transform 0.2s ease,opacity 0.2s ease',
        'opacity:0', 'transform:scale(0)',
      ].join(';');
      if (exploreMapProvider === 'amap') {
        if (!mapInstance.current || !window.AMap) return;
        const marker = new window.AMap.Marker({
          position: [group.lng, group.lat], content: el,
          offset: new window.AMap.Pixel(-6, -6), map: mapInstance.current,
        });
        exploreMarkersRef.current.push(marker);
      } else if (exploreMapProvider === 'maplibre') {
        if (!maplibreExploreInstance.current) return;
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([group.lng, group.lat])
          .addTo(maplibreExploreInstance.current);
        exploreMaplibreMarkersRef.current.push(marker);
      } else { return; }
      el.addEventListener('click', () => {
        showLocationPanel({
          title: group.location || group.country || '未命名地点',
          subtitle: group.country
            ? group.location ? `${group.country} · ${group.location}` : group.country
            : '',
          photos: group.photos,
          emptyMessage: group.photos.length === 0 ? '当前地点暂时没有图库照片' : '',
        });
      });
      markerEls.push(el);
    });
    markerEls.forEach((el, i) => {
      if (i === 0) { requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'scale(1)'; }); }
      else { setTimeout(() => { el.style.opacity = '1'; el.style.transform = 'scale(1)'; }, i * 10); }
    });
  }, [photosByLocation, activeView, isMapReady, showLocationPanel, exploreMapProvider]);

  // 当前位置标记
  useEffect(() => {
    if (activeView !== 'explore-view') {
      currentLocationMarkerRef.current?.setMap?.(null); currentLocationMarkerRef.current = null;
      currentLocationMaplibreMarkerRef.current?.remove(); currentLocationMaplibreMarkerRef.current = null;
      return;
    }
    if (!isMapReady || !browserLocation) return;
    currentLocationMarkerRef.current?.setMap?.(null); currentLocationMarkerRef.current = null;
    currentLocationMaplibreMarkerRef.current?.remove(); currentLocationMaplibreMarkerRef.current = null;
    const el = document.createElement('div');
    el.style.cssText = 'width:12px;height:12px;border-radius:999px;background:rgba(80,155,255,0.9);border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.3),0 4px 10px rgba(0,0,0,0.25);position:relative;z-index:1000;display:block;';
    if (exploreMapProvider === 'amap' && mapInstance.current && window.AMap) {
      currentLocationMarkerRef.current = new window.AMap.Marker({
        position: [browserLocation.lon, browserLocation.lat], content: el,
        offset: new window.AMap.Pixel(-6, -6), map: mapInstance.current, zIndex: 1000,
      });
    } else if (exploreMapProvider === 'maplibre' && maplibreExploreInstance.current) {
      currentLocationMaplibreMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([browserLocation.lon, browserLocation.lat])
        .addTo(maplibreExploreInstance.current);
    }
    return () => {
      currentLocationMarkerRef.current?.setMap?.(null); currentLocationMarkerRef.current = null;
      currentLocationMaplibreMarkerRef.current?.remove(); currentLocationMaplibreMarkerRef.current = null;
    };
  }, [browserLocation, isMapReady, activeView, exploreMapProvider]);

  // 地理位置弹窗内的小地图
  useEffect(() => {
    // 条件不满足时：销毁已有实例并退出
    if (!geoMapContainerRef.current || !getGeoInfo || metaPopover?.tab !== 'geo') {
      if (geoMapInstance.current) { geoMapInstance.current.remove(); geoMapInstance.current = null; }
      return;
    }

    const { latitude: lat, longitude: lon } = getGeoInfo;
    // cancelled 用于阻断 once('load') 回调在 cleanup 后触发
    let cancelled = false;

    const addMarkers = (map) => {
      if (cancelled || !map) return;
      // 清理旧 markers
      (map._markers || []).forEach((m) => m.remove());
      map._markers = [];
      if (map.getLayer('connection-line')) {
        map.removeLayer('connection-line');
        map.removeSource('connection-line');
      }

      const photoEl = document.createElement('div');
      photoEl.style.cssText = 'width:30px;height:30px;background:#e74c3c;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;';
      const photoPopup = new maplibregl.Popup({ offset: 25 })
        .setHTML(`<strong>${lightboxPhoto?.title || '照片位置'}</strong><br>${getGeoInfo.place}`);
      const pm = new maplibregl.Marker(photoEl).setLngLat([lon, lat]).setPopup(photoPopup).addTo(map);
      pm.togglePopup();
      map._markers.push(pm);

      if (getGeoInfo.browserLocation) {
        const bEl = document.createElement('div');
        bEl.style.cssText = 'width:30px;height:30px;background:#3498db;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;';
        const bm = new maplibregl.Marker(bEl)
          .setLngLat([getGeoInfo.browserLocation.lon, getGeoInfo.browserLocation.lat])
          .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML('<strong>当前位置</strong>'))
          .addTo(map);
        bm.togglePopup();
        map._markers.push(bm);
        map.addSource('connection-line', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString',
            coordinates: [[lon, lat], [getGeoInfo.browserLocation.lon, getGeoInfo.browserLocation.lat]] } },
        });
        map.addLayer({
          id: 'connection-line', type: 'line', source: 'connection-line',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#e7b17c', 'line-width': 2, 'line-opacity': 0.6, 'line-dasharray': [5, 10] },
        });
      }
    };

    if (geoMapInstance.current) {
      // 实例已存在：复用，仅更新中心点和 markers
      geoMapInstance.current.setCenter([lon, lat]);
      if (geoMapInstance.current.loaded()) {
        addMarkers(geoMapInstance.current);
      } else {
        geoMapInstance.current.once('load', () => addMarkers(geoMapInstance.current));
      }
    } else {
      // 新建实例
      const map = new maplibregl.Map({
        container: geoMapContainerRef.current,
        style: {
          version: 8,
          sources: {
            'gaode-tiles': {
              type: 'raster', tileSize: 256, attribution: '© 高德地图',
              tiles: [
                'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
                'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
                'https://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
                'https://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
              ],
            },
          },
          layers: [{ id: 'gaode-tiles-layer', type: 'raster', source: 'gaode-tiles', minzoom: 3, maxzoom: 18 }],
        },
        center: [lon, lat], zoom: 10, attributionControl: true,
      });
      map._markers = [];
      geoMapInstance.current = map;
      // 用 once('load') 添加 markers，并通过 cancelled 防止 cleanup 后仍执行
      map.once('load', () => addMarkers(map));
    }

    return () => {
      // 标记取消，阻断 once('load') 回调
      cancelled = true;
      // 注意：不在此处销毁地图实例——popover tab 切换会触发此 cleanup，
      // 但只要 metaPopover?.tab === 'geo' 且 getGeoInfo 存在，下一次 effect 会复用实例。
      // 仅当下一次 effect 判断条件不满足时（see top of effect）才销毁。
    };
  }, [getGeoInfo, metaPopover?.tab, lightboxPhoto]);

  useEffect(() => {
    if (metaPopover?.tab === 'geo' && geoMapInstance.current)
      setTimeout(() => geoMapInstance.current?.resize(), 100);
  }, [metaPopover?.tab]);

  // ── Render
  return (
    <div className={`app-shell ${activeView === 'explore-view' ? 'explore-mode' : ''}`}>
      <header className="app-header">
        <div className="brand">
          {activeView === 'gallery-view' && (
            brandLogo
              ? <img src={brandLogo} alt={brandText.siteTitle} className="brand-logo-img" />
              : <div className="logo-mark" aria-hidden="true" />
          )}
          {activeView === 'gallery-view' && (
            <div className="brand-copy">
              <div className="brand-name">{brandText.siteTitle}</div>
              <div className="brand-subtitle">{brandText.siteSubtitle}</div>
            </div>
          )}
        </div>
        <nav className="primary-menu" />
        <div className={`view-toggle ${activeView === 'explore-view' ? 'explore-active' : ''}`}>
          <button
            className={`toggle-btn ${activeView === 'gallery-view' ? 'active' : ''}`}
            onClick={() => handleViewChange('gallery-view')}
          >
            <span className="toggle-label">图库</span>
          </button>
          <button
            className={`toggle-btn ${activeView === 'explore-view' ? 'active' : ''}`}
            onClick={() => handleViewChange('explore-view')}
          >
            <span className="toggle-label">发现</span>
          </button>
        </div>
      </header>

      <main className={activeView === 'explore-view' ? 'explore-fullscreen' : ''}>
        {supabase && supabaseError && (
          <div style={{ margin: '0 0 16px', padding: '12px 16px', borderRadius: '10px',
            border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)',
            color: 'var(--warning)', fontSize: '0.9rem' }}>
            {supabaseError}
          </div>
        )}

        <section id="gallery-view" className={`screen ${activeView === 'gallery-view' ? 'active' : ''}`}>
          {filteredPhotos.length > 0 && (
            <>
              <TabStrip activeFilter={activeFilter} onFilterChange={setActiveFilter} />
              <PhotoGrid
                photos={displayedPhotos}
                likedPhotoIds={likedPhotoIds}
                onPhotoClick={setLightboxPhoto}
                onToggleLike={handleToggleLike}
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={loadMore}
                loadMoreRef={loadMoreRef}
                totalCount={filteredPhotos.length}
              />
            </>
          )}
        </section>

        {activeView === 'explore-view' && (
          <section id="explore-view" className="screen active">
            <CurationPanel
              groups={curationGroups}
              expandedCategories={expandedCategories}
              onToggleCategory={(id) => setExpandedCategories((prev) => ({ ...prev, [id]: !prev[id] }))}
              onCityClick={handleCityCardClick}
              activeCitySelection={activeCitySelection}
              isPanelCollapsed={isPanelCollapsed}
              onTogglePanelCollapse={() => setIsPanelCollapsed((p) => !p)}
            />
            <div className="map-wrapper">
              {exploreMapHint && (
                <div style={{ position: 'absolute', top: '18px', right: '18px', zIndex: 8,
                  padding: '10px 12px', borderRadius: '14px',
                  background: 'rgba(17,18,24,0.72)', color: '#fff',
                  border: '1px solid rgba(255,255,255,0.12)',
                  backdropFilter: 'blur(10px)',
                  maxWidth: 'min(420px,calc(100vw - 48px))', fontSize: '0.85rem' }}>
                  {exploreMapHint}
                </div>
              )}
              <div id="mapCanvas" ref={mapContainerRef} />
            </div>
          </section>
        )}
      </main>

      <LocationPanel
        data={locationPanel}
        onClose={() => setLocationPanel(null)}
        onPhotoClick={(p) => { setLightboxPhoto(p); setLocationPanel(null); }}
      />

      {/* Lightbox */}
      <div
        className={`lightbox ${lightboxPhoto ? 'active' : ''}`}
        aria-hidden={lightboxPhoto ? 'false' : 'true'}
        onClick={(e) => {
          if (e.target === e.currentTarget) { setLightboxPhoto(null); setShowMobileMeta(false); }
        }}
      >
        <button className="lightbox-close" aria-label="关闭"
          onClick={() => { setLightboxPhoto(null); setShowMobileMeta(false); }}>
          &times;
        </button>
        <div
          className="lightbox-panel"
          style={{ backgroundImage: lightboxPhoto ? `url(${lightboxPhoto.image})` : 'none' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`lightbox-content-wrapper ${showMobileMeta ? 'meta-visible' : ''}`}>
            <div className="lightbox-media"
              onClick={() => { if (window.innerWidth <= 768) setShowMobileMeta((p) => !p); }}>
              {lightboxPhoto && <img src={lightboxPhoto.image} alt={lightboxPhoto.title} />}
            </div>
            {lightboxPhoto && (
              <div className={`lightbox-meta ${showMobileMeta ? 'mobile-visible' : ''}`}>
                <div className="lightbox-title-section">
                  <h3>{lightboxPhoto.title}</h3>
                  <p className="subtitle">{lightboxPhoto.country} · {lightboxPhoto.location}</p>
                </div>
                <div className="lightbox-params-grid"
                  onClick={(e) => { if (window.innerWidth <= 768) e.stopPropagation(); }}>
                  {[['焦距', lightboxPhoto.focal], ['光圈', lightboxPhoto.aperture],
                    ['快门', lightboxPhoto.shutter], ['ISO', lightboxPhoto.iso],
                    ['相机', lightboxPhoto.camera], ['镜头', lightboxPhoto.lens]
                  ].map(([label, value]) => (
                    <div key={label} className="lightbox-param-card"
                      onClick={(e) => openMetaPopover('basic', e)}>
                      <span className="param-label">{label}</span>
                      <span className="param-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {lightboxPhoto && metaPopover && (
          <div className="meta-popover-backdrop"
            onClick={(e) => { e.stopPropagation(); setMetaPopover(null); }}>
            <aside
              className="meta-popover"
              style={{
                left: `${metaPopover.x}px`, top: `${metaPopover.y}px`,
                backgroundImage: lightboxPhoto ? `url(${lightboxPhoto.image})` : 'none',
                maxWidth: metaPopover.tab === 'geo' ? '520px' : '320px',
                maxHeight: metaPopover.tab === 'geo' ? '85vh' : 'auto',
                overflowY: metaPopover.tab === 'geo' ? 'auto' : 'hidden',
                overflowX: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="meta-sidepanel-header">
                <div className="meta-tabs">
                  <button
                    className={`meta-tab ${metaPopover.tab === 'basic' ? 'active' : ''}`}
                    onClick={() => setMetaPopover((p) => ({ ...p, tab: 'basic' }))}
                  >基本参数</button>
                  <button
                    className={`meta-tab ${metaPopover.tab === 'geo' ? 'active' : ''}`}
                    onClick={() => setMetaPopover((p) => ({ ...p, tab: 'geo' }))}
                  >地理位置</button>
                </div>
                <button className="meta-close" onClick={() => setMetaPopover(null)} aria-label="关闭">×</button>
              </header>

              {metaPopover.tab === 'basic' && (
                <div className="meta-panel-body">
                  <div className="meta-card-grid">
                    <article className="meta-card">
                      <p className="meta-card-label">评级</p>
                      {(() => {
                        const rating = lightboxPhoto?.rating ?? 7;
                        const clamped = Math.max(1, Math.min(10, rating));
                        return (
                          <div className="meta-rating-circle">
                            <div className="meta-rating-number">{clamped}</div>
                            <div className="meta-rating-stars-circle">
                              {Array.from({ length: clamped }, (_, i) => {
                                const angle = (360 / clamped) * i;
                                const r = 28;
                                const x = Math.cos((angle - 90) * Math.PI / 180) * r;
                                const y = Math.sin((angle - 90) * Math.PI / 180) * r;
                                return (
                                  <span key={i} className="meta-star-circle" style={{
                                    position: 'absolute',
                                    left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`,
                                    transform: 'translate(-50%, -50%)',
                                  }}>★</span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </article>
                    <article className="meta-card">
                      <p className="meta-card-label">拍摄于</p>
                      {(() => {
                        const { yearsAgoText, dateText } = getShotTimeInfo(lightboxPhoto.shotDate || lightboxPhoto.shot_date);
                        return (<><p className="meta-card-main">{yearsAgoText}</p><p className="meta-card-sub">{dateText}</p></>);
                      })()}
                    </article>
                    <article className="meta-card"><p className="meta-card-label">光圈</p><p className="meta-card-main">{lightboxPhoto.aperture}</p></article>
                    <article className="meta-card"><p className="meta-card-label">快门</p><p className="meta-card-main">{lightboxPhoto.shutter}</p></article>
                    <article className="meta-card"><p className="meta-card-label">焦距</p><p className="meta-card-main">{lightboxPhoto.focal}</p></article>
                    <article className="meta-card"><p className="meta-card-label">感光度</p><p className="meta-card-main">{lightboxPhoto.iso}</p></article>
                  </div>
                </div>
              )}

              {metaPopover.tab === 'geo' && (
                <div className="meta-panel-body" style={{ maxHeight: 'calc(90vh - 80px)', overflowY: 'auto' }}>
                  {getGeoInfo ? (
                    <>
                      <div ref={geoMapContainerRef} style={{
                        width: '100%', height: '240px', minHeight: '240px',
                        marginBottom: '16px', borderRadius: '8px',
                        overflow: 'hidden', border: '1px solid var(--border)',
                      }} />
                      <div style={{ marginBottom: '16px', padding: '12px',
                        background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                        borderRadius: '8px', border: '1px solid rgba(255,255,255,0.3)' }}>
                        <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text)', fontWeight: '500' }}>
                          {getGeoInfo.place}
                        </p>
                      </div>
                      <div className="meta-card-grid">
                        <article className="meta-card">
                          <p className="meta-card-label">纬度</p>
                          <p className="meta-card-main">{getGeoInfo.latDms}</p>
                          <p className="meta-card-sub">{getGeoInfo.lat}</p>
                        </article>
                        <article className="meta-card">
                          <p className="meta-card-label">经度</p>
                          <p className="meta-card-main">{getGeoInfo.lonDms}</p>
                          <p className="meta-card-sub">{getGeoInfo.lon}</p>
                        </article>
                        <article className="meta-card">
                          <p className="meta-card-label">海拔</p>
                          <p className="meta-card-main">{getGeoInfo.altitude}</p>
                        </article>
                        <article className="meta-card">
                          <p className="meta-card-label">距离</p>
                          <p className="meta-card-main">{getGeoInfo.distance}</p>
                          {getGeoInfo.browserLocation && <p className="meta-card-sub">距当前位置</p>}
                        </article>
                      </div>
                    </>
                  ) : (
                    <div className="meta-card-grid">
                      <article className="meta-card meta-card-wide">
                        <p className="meta-card-label">地点</p>
                        <p className="meta-card-main">暂无地理位置信息</p>
                      </article>
                    </div>
                  )}
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
