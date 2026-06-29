import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
import { useExifData, useBrowserLocation, useAltitudeFromCoords } from './hooks/useExifAndLocation';
import { useGaodeMapInit, useFocusMapOnCity } from './hooks/useMapInit';
import { loadMapLibre } from '../../utils/maplibreLoader';
import { getDefaultMaplibreStyle } from '../../utils/gaodeMapStyle';
import { escapeHtml } from '../../utils/security';
import { buildOssImagePreviewUrl, getDirectMediaUrl, resolveMediaUrl } from '../../utils/urlUtils';
import { TabStrip } from './components/TabStrip';
import { PhotoGrid } from './components/PhotoGrid';
import { CurationPanel } from './components/CurationPanel';
import { LocationPanel } from './components/LocationPanel';

function ApertureIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 3.9C7.5 3.9 3.9 7.5 3.9 12c0 4.5 3.6 8.1 8.1 8.1 4.5 0 8.1-3.6 8.1-8.1-0.15-4.5-3.75-8.1-8.1-8.1z m5.1 3.15L14.7 11.1 11.25 4.95c2.1-0.3 4.35 0.45 5.85 2.1zM14.25 12l-0.6 0.9-0.6 1.05h-2.25l-0.15-0.45-0.9-1.5 0.3-0.6 0.75-1.35h2.25l0.9 1.65 0.3 0.3zM10.2 5.1l2.4 4.05H5.4c0.9-2.1 2.7-3.6 4.8-4.05z m-3.9 11.1C4.95 14.4 4.5 12.15 5.1 10.05h4.65l-0.45 0.9-3 5.25z m0.6 0.75l2.4-4.05 0.6 1.05 3 5.1c-2.25 0.3-4.5-0.6-6-2.1z m6.9 1.95l-2.4-4.05h7.2c-1.05 1.95-2.7 3.45-4.8 4.05z m0.3-4.95l0.3-0.6 3.3-5.55c1.35 1.8 1.65 4.05 1.05 6.15H14.1z"
        fill="currentColor"
      />
    </svg>
  );
}

function FocalLengthIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path d="M9.06 2.94H2.13a0.705 0.705 0 1 1 0-1.41h6.93a0.705 0.705 0 1 1 0 1.41zM2.13 9.6a0.705 0.705 0 0 1-0.705-0.705V2.33a0.705 0.705 0 1 1 1.41 0v6.57a0.705 0.705 0 0 1-0.705 0.7zM21.86 2.94h-6.93a0.705 0.705 0 1 1 0-1.41h6.93a0.705 0.705 0 1 1 0 1.41zM21.89 9.6a0.705 0.705 0 0 1-0.705-0.705V2.33a0.705 0.705 0 1 1 1.41 0v6.57a0.705 0.705 0 0 1-0.705 0.7zM21.89 22.47h-6.93a0.705 0.705 0 1 1 0-1.41h6.93a0.705 0.705 0 1 1 0 1.41zM21.89 22.39a0.705 0.705 0 0 1-0.705-0.705v-6.57a0.705 0.705 0 1 1 1.41 0v6.57a0.705 0.705 0 0 1-0.705 0.705zM9.08 22.47H2.15a0.705 0.705 0 1 1 0-1.41h6.93a0.705 0.705 0 1 1 0 1.41zM2.13 22.39a0.705 0.705 0 0 1-0.705-0.705v-6.57a0.705 0.705 0 1 1 1.41 0v6.57a0.705 0.705 0 0 1-0.705 0.705zM16.6 12.69H7.08a0.705 0.705 0 1 1 0-1.41h9.52a0.705 0.705 0 1 1 0 1.41zM11.84 17.45a0.705 0.705 0 0 1-0.705-0.705V7.23a0.705 0.705 0 1 1 1.41 0v9.52a0.705 0.705 0 0 1-0.705 0.7z" fill="currentColor" />
    </svg>
  );
}

function ShutterIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path d="M12.03 20.08a7.19 7.19 0 0 1-5.09-2.11 7.15 7.15 0 0 1-2.11-5.09 7.2 7.2 0 0 1 7.2-7.2c1.92 0 3.73 0.75 5.09 2.11a7.15 7.15 0 0 1 2.11 5.09 7.2 7.2 0 0 1-7.2 7.2zm0-13.34a6.14 6.14 0 0 0-6.14 6.14 6.1 6.1 0 0 0 1.8 4.34 6.14 6.14 0 0 0 10.48-4.34A6.14 6.14 0 0 0 12.03 6.74z" fill="currentColor" />
      <path d="M12.03 14.14a1.27 1.27 0 1 1 0-2.54 1.27 1.27 0 0 1 0 2.54zm0-2.06a0.79 0.79 0 1 0 0 1.58 0.79 0.79 0 0 0 0-1.58z" fill="currentColor" />
      <path d="M15.65 9.62l0.2 0.24-5.56 4.67-0.2-0.24 5.56-4.67Z" fill="currentColor" />
      <path d="M12.03 12.88m-0.86 0a0.67 0.67 0 1 0 1.72 0 0.67 0.67 0 1 0-1.72 0Z" fill="#FFFFFF" />
      <path d="M9.89 4.57h4.28v0.61H9.89z" fill="currentColor" />
      <path d="M16.78 5.86l2.12 2.12-0.43 0.43-2.12-2.12z" fill="currentColor" />
    </svg>
  );
}

function IsoIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM5.5 7.5h2v-2H9v2h2v1.5H9v2H7.5v-2h-2V7.5zM19 19H5l14-14v14z m-2-2v-1.5h-5V17h5z" fill="currentColor" />
    </svg>
  );
}

const CATEGORY_LABELS = {
  featured: '精选',
  latest: '最新',
  random: '随览',
  nearby: '附近',
  far: '远方',
  film: '胶片',
};

const formatSyncTime = (timestamp) => {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};

const getFilmStockFromPhoto = (photo) => {
  const direct = String(photo?.filmStock || '').trim();
  if (direct) return direct;

  const tag = String(photo?.tags || '')
    .split(',')
    .map((item) => item.trim())
    .find((item) => item.toLowerCase().startsWith('film_stock:'));

  return tag ? tag.slice('film_stock:'.length).trim() : '';
};

const setMetaAttribute = (selector, attr, value) => {
  const node = document.head.querySelector(selector);
  if (node && value) node.setAttribute(attr, value);
};

function GalleryLoadingState() {
  return (
    <div className="gallery-loading-state" aria-live="polite" aria-busy="true">
      <div className="gallery-loading-copy">
        <span>正在整理最新作品</span>
        <strong>Light of Anthony</strong>
      </div>
      <div className="gallery-loading-grid" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="gallery-loading-card">
            <div className="gallery-loading-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const metaPopoverRef = useRef(null);
  const [showMobileMeta, setShowMobileMeta] = useState(false);
  const [isLightboxPortrait, setIsLightboxPortrait] = useState(false);
  const [lightboxPreviewFailed, setLightboxPreviewFailed] = useState(false);

  // 鈹€鈹€ 鍝佺墝鐘舵€?
  const [brandLogo, setBrandLogo] = useState(() => getStoredBrandLogo());
  const [brandText, setBrandText] = useState(() => getStoredBrandText());

  // 鈹€鈹€ 鍦板浘 ref
  const mapContainerRef = useRef(null);
  const geoMapContainerRef = useRef(null);
  const geoMapInstance = useRef(null);
  const maplibreRef = useRef(null);
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
  const {
    approvedPhotos,
    setApprovedPhotos,
    isPhotoDataLoading,
    lastPhotoDataLoadedAt,
    supabaseError,
  } = usePhotoData(supabase);
  const { likedPhotoIds, handleToggleLike } = useLikePhoto(supabase, setApprovedPhotos);
  const browserLocation = useBrowserLocation();
  const exifData = useExifData(lightboxPhoto);
  const geoLat = exifData?.latitude ?? lightboxPhoto?.latitude ?? null;
  const geoLon = exifData?.longitude ?? lightboxPhoto?.longitude ?? null;
  const altitudeFromApi = useAltitudeFromCoords(geoLat, geoLon);

  // 鈹€鈹€ 鍦板浘 Hooks
  const {
    mapInstance,
    maplibreInstance: maplibreExploreInstance,
    isMapReady,
    mapProvider: exploreMapProvider,
    resizeMap,
  } = useGaodeMapInit(mapContainerRef, activeView);
  const focusMapOnCity = useFocusMapOnCity(
    mapInstance,
    maplibreExploreInstance,
    exploreMapProvider,
    isMapReady
  );

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
  const shouldShowGalleryLoading = isPhotoDataLoading && approvedPhotos.length === 0;
  const galleryStatusText = isPhotoDataLoading
    ? '正在加载作品'
    : `${filteredPhotos.length} / ${allPhotos.length} 张作品`;
  const gallerySyncText = lastPhotoDataLoadedAt ? `更新于 ${formatSyncTime(lastPhotoDataLoadedAt)}` : '';
  const lightboxFilmStock = lightboxPhoto ? getFilmStockFromPhoto(lightboxPhoto) : '';
  const lightboxShotInfo = lightboxPhoto
    ? getShotTimeInfo(lightboxPhoto.shotDate || lightboxPhoto.shot_date)
    : null;
  const lightboxStoryItems = lightboxPhoto ? [
    {
      label: '拍摄',
      value: lightboxShotInfo?.dateText || '未设置',
      sub: lightboxShotInfo?.yearsAgoText,
    },
    {
      label: '评分',
      value: `${Math.max(1, Math.min(10, Number(lightboxPhoto.rating) || 7))}/10`,
      sub: '作品评级',
    },
    {
      label: '分类',
      value: CATEGORY_LABELS[lightboxPhoto.category] || '未分类',
      sub: lightboxFilmStock || String(lightboxPhoto.mood || '').trim() || '',
    },
    {
      label: '喜欢',
      value: `${typeof lightboxPhoto.likes === 'number' ? lightboxPhoto.likes : 0}`,
      sub: '次',
    },
  ] : [];
  const lightboxOriginalRaw = lightboxPhoto?.image || '';
  const lightboxOriginalDirect = getDirectMediaUrl(lightboxOriginalRaw);
  const lightboxThumbnailDirect = getDirectMediaUrl(lightboxPhoto?.thumbnail || '');
  const lightboxStoredPreviewRaw = lightboxPhoto?.preview || '';
  const lightboxStoredPreviewDirect = getDirectMediaUrl(lightboxStoredPreviewRaw);
  const lightboxPreviewRaw =
    (lightboxThumbnailDirect && lightboxThumbnailDirect !== lightboxOriginalDirect ? lightboxThumbnailDirect : '') ||
    (lightboxStoredPreviewDirect && lightboxStoredPreviewDirect !== lightboxOriginalDirect
      ? lightboxStoredPreviewDirect
      : '') ||
    buildOssImagePreviewUrl(lightboxOriginalDirect, { width: 1400, quality: 84 });
  const lightboxVisualRaw = lightboxPreviewRaw || lightboxOriginalRaw;
  const lightboxVisualSrc = lightboxVisualRaw ? resolveMediaUrl(getDirectMediaUrl(lightboxVisualRaw)) : '';

  // 鈹€鈹€ 鍦扮悊淇℃伅锛圠ightbox 鐢級
  const getGeoInfo = useMemo(() => {
    if (!lightboxPhoto) return null;
    const lat = exifData?.latitude ?? lightboxPhoto.latitude;
    const lon = exifData?.longitude ?? lightboxPhoto.longitude;
    const altitude = exifData?.GPSAltitude ?? lightboxPhoto.altitude ?? altitudeFromApi;
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
      altitude: altitude != null ? `${Number(altitude).toFixed(0)} m` : '未知',
      distance: distance != null ? `${distance.toLocaleString()} km` : '未知',
      browserLocation,
    };
  }, [lightboxPhoto, exifData, browserLocation, altitudeFromApi]);

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

  const handleDownloadOriginal = useCallback(async () => {
    if (!lightboxPhoto?.image) return;
    const originalUrl = getDirectMediaUrl(lightboxPhoto.image);
    if (!originalUrl) return;
    try {
      const response = await fetch(originalUrl);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = originalUrl.split('.').pop()?.split('?')[0] || 'jpg';
      const safeTitle = (lightboxPhoto.title || 'photo').replace(/[\\/:*?"<>|]/g, '_');
      a.download = `${safeTitle}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      handleError(err, { context: 'handleDownloadOriginal', type: ErrorType.NETWORK, silent: true });
      window.open(originalUrl, '_blank', 'noopener,noreferrer');
    }
  }, [lightboxPhoto]);

  const ensureMapLibre = useCallback(async () => {
    if (!maplibreRef.current) {
      maplibreRef.current = await loadMapLibre();
    }
    return maplibreRef.current;
  }, []);

  // 鈹€鈹€ Effects
  useEffect(() => {
    if (!metaPopover) return;
    const el = metaPopoverRef.current;
    if (!el) return;

    const raf = (window.requestAnimationFrame || ((cb) => setTimeout(cb, 0)));
    const viewportPadding = 12;

    raf(() => {
      const node = metaPopoverRef.current;
      if (!node) return;

      const rect = node.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let nextX = metaPopover.x;
      let nextY = metaPopover.y;

      if (rect.left < viewportPadding) nextX += viewportPadding - rect.left;
      if (rect.right > vw - viewportPadding) nextX -= rect.right - (vw - viewportPadding);
      if (rect.top < viewportPadding) nextY += viewportPadding - rect.top;
      if (rect.bottom > vh - viewportPadding) nextY -= rect.bottom - (vh - viewportPadding);

      // Avoid tiny sub-pixel loops.
      nextX = Math.round(nextX);
      nextY = Math.round(nextY);

      if (nextX !== metaPopover.x || nextY !== metaPopover.y) {
        setMetaPopover((p) => (p ? { ...p, x: nextX, y: nextY } : p));
      }
    });
  }, [metaPopover]);

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
    setLightboxPreviewFailed(false);
    if (lightboxPhoto) {
      setShowMobileMeta(false);
      setIsLightboxPortrait(false);
    }
  }, [lightboxPhoto]);

  useEffect(() => {
    const baseTitle = brandText.siteTitle || 'light of anthony';
    const title = lightboxPhoto
      ? `${lightboxPhoto.title} | ${baseTitle}`
      : activeView === 'explore-view'
        ? `发现地图 | ${baseTitle}`
        : baseTitle;
    const description = lightboxPhoto
      ? `${lightboxPhoto.country || ''}${lightboxPhoto.location ? ` · ${lightboxPhoto.location}` : ''}，${lightboxPhoto.focal || ''} ${lightboxPhoto.aperture || ''} ${lightboxPhoto.shutter || ''}`.trim()
      : `${baseTitle} 收录 ${allPhotos.length} 张摄影作品，按时间、地点和分类浏览。`;
    const image = lightboxPhoto?.thumbnail || lightboxPhoto?.image || 'https://pic.rlzhao.com/loa-cropped.png';

    document.title = title;
    setMetaAttribute('meta[name="description"]', 'content', description);
    setMetaAttribute('meta[property="og:title"]', 'content', title);
    setMetaAttribute('meta[property="og:description"]', 'content', description);
    setMetaAttribute('meta[property="og:image"]', 'content', image);
    setMetaAttribute('meta[property="og:image:secure_url"]', 'content', image);
    setMetaAttribute('meta[name="twitter:title"]', 'content', title);
    setMetaAttribute('meta[name="twitter:description"]', 'content', description);
    setMetaAttribute('meta[name="twitter:image"]', 'content', image);
  }, [activeView, allPhotos.length, brandText.siteTitle, lightboxPhoto]);

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
    const loadMoreNode = loadMoreRef.current;
    if (!loadMoreNode || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && hasMore) loadMore();
      },
      { rootMargin: '200px', threshold: 0.1 }
    );
    obs.observe(loadMoreNode);
    return () => { obs.unobserve(loadMoreNode); };
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
    let cancelled = false;
    exploreMarkersRef.current.forEach((m) => m?.setMap?.(null));
    exploreMarkersRef.current = [];
    exploreMaplibreMarkersRef.current.forEach((m) => m.remove());
    exploreMaplibreMarkersRef.current = [];
    if (!photosByLocation || photosByLocation.length === 0) return;
    const drawMarkers = async () => {
      const maplibregl = exploreMapProvider === 'maplibre' ? await ensureMapLibre() : null;
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
        'width:9px', 'height:9px', 'border-radius:999px',
        `background:${color}`, 'border:2px solid #ffffff',
        'box-shadow:0 0 0 1px rgba(0,0,0,0.35),0 6px 12px rgba(0,0,0,0.25)',
        'cursor:pointer', 'transition:transform 0.2s ease,opacity 0.2s ease',
        'opacity:0', 'transform:scale(0)',
      ].join(';');
      anchor.appendChild(dot);
      anchor.addEventListener('click', () => {
        showLocationPanel({
          title: group.location || group.country || '未命名地点',
          subtitle: group.country
            ? group.location ? `${group.country} · ${group.location}` : group.country
            : '',
          photos: group.photos,
          emptyMessage: group.photos.length === 0 ? '当前地点暂时没有图库照片' : '',
        });
      });
      if (exploreMapProvider === 'amap') {
        if (!mapInstance.current || !window.AMap) return;
        const marker = new window.AMap.Marker({
          position: [group.lng, group.lat], content: anchor,
          offset: new window.AMap.Pixel(-6, -6), map: mapInstance.current,
        });
        exploreMarkersRef.current.push(marker);
      } else if (exploreMapProvider === 'maplibre') {
        if (!maplibreExploreInstance.current || !maplibregl) return;
        const marker = new maplibregl.Marker({ element: anchor, anchor: 'center' })
          .setLngLat([group.lng, group.lat])
          .addTo(maplibreExploreInstance.current);
        exploreMaplibreMarkersRef.current.push(marker);
      } else { return; }
      markerDots.push(dot);
      });
      markerDots.forEach((dot, i) => {
        const reveal = () => { dot.style.opacity = '1'; dot.style.transform = 'scale(1)'; };
        if (i === 0) requestAnimationFrame(reveal);
        else setTimeout(reveal, i * 10);
      });
    };
    drawMarkers();
    return () => {
      cancelled = true;
    };
  }, [
    photosByLocation,
    activeView,
    isMapReady,
    showLocationPanel,
    exploreMapProvider,
    ensureMapLibre,
    mapInstance,
    maplibreExploreInstance,
  ]);

  // 当前位置标记
  useEffect(() => {
    if (activeView !== 'explore-view') {
      currentLocationMarkerRef.current?.setMap?.(null); currentLocationMarkerRef.current = null;
      currentLocationMaplibreMarkerRef.current?.remove(); currentLocationMaplibreMarkerRef.current = null;
      return;
    }
    if (!isMapReady || !browserLocation) return;
    let cancelled = false;
    currentLocationMarkerRef.current?.setMap?.(null); currentLocationMarkerRef.current = null;
    currentLocationMaplibreMarkerRef.current?.remove(); currentLocationMaplibreMarkerRef.current = null;
    const addCurrentMarker = async () => {
      const maplibregl = exploreMapProvider === 'maplibre' ? await ensureMapLibre() : null;
      if (cancelled) return;
      const locAnchor = document.createElement('div');
      locAnchor.style.cssText = 'display:block;line-height:0;';
      const locDot = document.createElement('div');
      locDot.style.cssText = 'width:12px;height:12px;border-radius:999px;background:rgba(80,155,255,0.9);border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.3),0 4px 10px rgba(0,0,0,0.25);position:relative;z-index:1000;display:block;';
      locAnchor.appendChild(locDot);
      if (exploreMapProvider === 'amap' && mapInstance.current && window.AMap) {
        currentLocationMarkerRef.current = new window.AMap.Marker({
          position: [browserLocation.lon, browserLocation.lat], content: locAnchor,
          offset: new window.AMap.Pixel(-6, -6), map: mapInstance.current, zIndex: 1000,
        });
      } else if (exploreMapProvider === 'maplibre' && maplibreExploreInstance.current && maplibregl) {
        currentLocationMaplibreMarkerRef.current = new maplibregl.Marker({ element: locAnchor, anchor: 'center' })
          .setLngLat([browserLocation.lon, browserLocation.lat])
          .addTo(maplibreExploreInstance.current);
      }
    };
    addCurrentMarker();
    return () => {
      cancelled = true;
      currentLocationMarkerRef.current?.setMap?.(null); currentLocationMarkerRef.current = null;
      currentLocationMaplibreMarkerRef.current?.remove(); currentLocationMaplibreMarkerRef.current = null;
    };
  }, [
    browserLocation,
    isMapReady,
    activeView,
    exploreMapProvider,
    ensureMapLibre,
    mapInstance,
    maplibreExploreInstance,
  ]);

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

    const initGeoMap = async () => {
      const maplibregl = await ensureMapLibre();
      if (cancelled) return;

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
        .setHTML(
          `<strong>${escapeHtml(lightboxPhoto?.title || '照片位置')}</strong><br>${escapeHtml(getGeoInfo.place)}`
        );
      const pm = new maplibregl.Marker(photoEl).setLngLat([lon, lat]).setPopup(photoPopup).addTo(map);
      pm.togglePopup();
      map._markers.push(pm);

      if (getGeoInfo.browserLocation) {
        const bEl = document.createElement('div');
        bEl.style.cssText = 'width:30px;height:30px;background:#3498db;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;';
        const bm = new maplibregl.Marker(bEl)
          .setLngLat([getGeoInfo.browserLocation.lon, getGeoInfo.browserLocation.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 25 }).setHTML(`<strong>${escapeHtml('当前位置')}</strong>`)
          )
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
        style: getDefaultMaplibreStyle(),
        center: [lon, lat], zoom: 10, attributionControl: true,
      });
      map._markers = [];
      geoMapInstance.current = map;
      // 用 once('load') 添加 markers，并通过 cancelled 防止 cleanup 后仍执行
      map.once('load', () => addMarkers(map));
      }
    };
    initGeoMap();

    return () => {
      // 标记取消，阻断 once('load') 回调
      cancelled = true;
      // 注意：不在此处销毁地图实例——popover tab 切换会触发此 cleanup，
      // 但只要 metaPopover?.tab === 'geo' 且 getGeoInfo 存在，下一次 effect 会复用实例。
      // 仅当下一次 effect 判断条件不满足时（see top of effect）才销毁。
    };
  }, [getGeoInfo, metaPopover?.tab, lightboxPhoto, ensureMapLibre]);

  useEffect(() => {
    if (metaPopover?.tab === 'geo' && geoMapInstance.current)
      setTimeout(() => geoMapInstance.current?.resize(), 100);
  }, [metaPopover?.tab]);

  // ── Render
  return (
    <div className={`app-shell ${activeView === 'explore-view' ? 'explore-mode' : ''}`}>
      <header className="app-header">
        <div className={`brand ${activeView === 'explore-view' ? 'brand-anchor-only' : ''}`}>
          {brandLogo
            ? <img src={brandLogo} alt={brandText.siteTitle} className="brand-logo-img" />
            : <div className="logo-mark" aria-hidden="true" />
          }
          {activeView === 'gallery-view' && (
            <img
              src="/loa-cropped.png"
              alt="Light of Anthony"
              className="brand-wordmark-img"
            />
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
          <TabStrip activeFilter={activeFilter} onFilterChange={setActiveFilter} />
          <div className="gallery-status-row">
            <span>{galleryStatusText}</span>
            {gallerySyncText && <time dateTime={new Date(lastPhotoDataLoadedAt).toISOString()}>{gallerySyncText}</time>}
          </div>
          {shouldShowGalleryLoading ? (
            <GalleryLoadingState />
          ) : filteredPhotos.length > 0 ? (
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
          ) : (
            <div className="empty-state">
              <p className="empty-text">暂无符合条件的照片</p>
              <p className="empty-hint">可切换其他分类，或在后台把照片分类设为“胶片”</p>
            </div>
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
        <div
          className="lightbox-panel"
          style={{ backgroundImage: lightboxVisualSrc ? `url(${lightboxVisualSrc})` : 'none' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="lightbox-actions">
            {lightboxPhoto && (
              <button className="lightbox-download" aria-label="下载原图" onClick={handleDownloadOriginal}>
                下载原图
              </button>
            )}
            <button className="lightbox-close" aria-label="关闭"
              onClick={() => { setLightboxPhoto(null); setShowMobileMeta(false); }}>
              &times;
            </button>
          </div>
          <div className={`lightbox-content-wrapper ${showMobileMeta ? 'meta-visible' : ''}`}>
            <div className={`lightbox-media ${isLightboxPortrait ? 'portrait-fit' : ''}`}
              onClick={() => { if (window.innerWidth <= 768) setShowMobileMeta((p) => !p); }}>
              {lightboxPhoto && lightboxVisualSrc && !lightboxPreviewFailed ? (
                <img
                  src={lightboxVisualSrc}
                  alt={lightboxPhoto.title}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setIsLightboxPortrait(img.naturalHeight > img.naturalWidth);
                  }}
                  onError={() => {
                    handleError(new Error(`Lightbox preview unavailable: ${lightboxPhoto.title}`), {
                      context: 'GalleryPage.lightboxPreview',
                      type: ErrorType.NETWORK,
                      silent: true,
                    });
                    setLightboxPreviewFailed(true);
                  }}
                />
              ) : (
                <div className="lightbox-media-fallback">预览图暂不可用</div>
              )}
            </div>
            {lightboxPhoto && (
              <div className={`lightbox-meta ${showMobileMeta ? 'mobile-visible' : ''}`}>
                <div className="lightbox-title-section">
                  <h3>{lightboxPhoto.title}</h3>
                  <p className="subtitle">{lightboxPhoto.country} · {lightboxPhoto.location}</p>
                </div>
                <div className="lightbox-story-grid">
                  {lightboxStoryItems.map((item) => (
                    <div key={item.label} className="lightbox-story-chip">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      {item.sub && <em>{item.sub}</em>}
                    </div>
                  ))}
                </div>
                <div className="lightbox-params-grid"
                  onClick={(e) => { if (window.innerWidth <= 768) e.stopPropagation(); }}>
                  {[['焦距', lightboxPhoto.focal], ['光圈', lightboxPhoto.aperture],
                    ['快门', lightboxPhoto.shutter], ['ISO', lightboxPhoto.iso],
                    ['相机', lightboxPhoto.camera], ['镜头', lightboxPhoto.lens]
                  ].map(([label, value]) => (
                    <div key={label} className="lightbox-param-card"
                      onClick={(e) => openMetaPopover('basic', e)}>
                      <span className="param-label">
                        {label}
                        {label === '焦距' && <FocalLengthIcon className="param-label-icon" />}
                        {label === '光圈' && <ApertureIcon className="param-label-icon" />}
                        {label === '快门' && <ShutterIcon className="param-label-icon param-label-icon-shutter" />}
                        {label === 'ISO' && <IsoIcon className="param-label-icon" />}
                      </span>
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
              ref={metaPopoverRef}
              style={{
                left: `${metaPopover.x}px`, top: `${metaPopover.y}px`,
                backgroundImage: lightboxVisualSrc ? `url(${lightboxVisualSrc})` : 'none',
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
