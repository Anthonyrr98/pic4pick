import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import '../../App.css';
import './galleryBackdrop.css';
import './photoLightbox.css';
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
import { handleError, safeSync, ErrorType } from '../../utils/errorHandler';

// 鈹€鈹€ 妯″潡鍖栧瓙妯″潡
import { calculateDistance, decimalToDMS } from './utils/geoUtils';
import { getShotTimeInfo } from './utils/timeUtils';
import { filterAndSortPhotos } from './utils/photoFilterUtils';
import { usePhotoData, useLikePhoto } from './hooks/usePhotoData';
import { useExifData, useBrowserLocation, useAltitudeFromCoords } from './hooks/useExifAndLocation';
import { preloadConfiguredMap } from '../../utils/amapLoader';
import { PhotoDetailsSheet } from './components/PhotoDetailsSheet';
import { usePhotoAddress } from './hooks/usePhotoAddress';
import {
  getDirectMediaUrl,
  getOriginalMediaUrl,
  getPreviewMediaFallbackUrls,
  getPreviewMediaSrcSet,
  getPreviewMediaUrl,
} from '../../utils/urlUtils';
import { TabStrip } from './components/TabStrip';
import { PhotoGrid } from './components/PhotoGrid';
import { FilmControlFrame, FilmFrameEdges, getFilmFrameStock } from './components/FilmFrame';
import { LocationPanel } from './components/LocationPanel';
import { ThemeSwitcher } from '../../themes/ThemeSwitcher';
import { useTheme } from '../../themes/ThemeContext';
import { SpatialSceneControls, SpatialSceneStatus } from '../../components/SpatialSceneControls';
import { useSpatialScene } from '../../hooks/useSpatialScene';
import { useAnimatedPresence } from '../../hooks/useAnimatedPresence';
import { useLightboxImageMotion } from '../../hooks/useLightboxImageMotion';
import { useGalleryHeaderEntry } from '../../hooks/useGalleryEntryMotion';
import { advanceImageFallback } from '../../utils/imageFallback';

let exploreViewModulePromise = null;

const loadExploreView = () => {
  if (!exploreViewModulePromise) {
    exploreViewModulePromise = import('./components/ExploreView.jsx').catch((error) => {
      exploreViewModulePromise = null;
      throw error;
    });
  }
  return exploreViewModulePromise;
};

const preloadExploreView = () => {
  void loadExploreView();
};

const ExploreView = lazy(() =>
  loadExploreView().then((module) => ({ default: module.ExploreView }))
);

const LIGHTBOX_IMAGE_WIDTHS = [1080, 1600, 2000, 2400];
const LIGHTBOX_IMAGE_SIZES = '(max-width: 768px) calc(100vw - 24px), calc(100vw - 48px)';
const LIGHTBOX_IMAGE_FALLBACKS = [
  { width: 2000, quality: 92 },
  { width: 1600, quality: 90 },
  { width: 1080, quality: 88, format: false },
];

const getLightboxPreloadWidth = () => {
  if (typeof window === 'undefined') return 2000;
  if (window.innerWidth <= 768) return 1080;
  if (window.innerWidth <= 1200) return 1600;
  return window.devicePixelRatio > 1 ? 2400 : 2000;
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

function ExploreViewPending() {
  return (
    <section id="explore-view" className="screen active">
      <div className="map-wrapper">
        <div className="explore-map-loading" role="status" aria-live="polite">
          <div className="explore-map-loading-inner">
            <span className="explore-map-loading-dial" aria-hidden="true" />
            <span>地图正在显影…</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function GalleryPage() {
  const supabase = getSupabaseClient();

  // 鈹€鈹€ 瑙嗗浘 & 绛涢€夌姸鎬?
  const [activeFilter, setActiveFilter] = useState('latest');
  const prepareLayoutRef = useRef(null);
  const [activeView, setActiveView] = useState('gallery-view');
  const shellRef = useRef(null);
  useGalleryHeaderEntry(shellRef, activeView === 'gallery-view');
  const [hasVisitedExplore, setHasVisitedExplore] = useState(false);
  const { setFilmMode } = useTheme();
  const isFilmSection = activeFilter === 'film' && activeView === 'gallery-view';

  useLayoutEffect(() => {
    setFilmMode(isFilmSection);
    return () => setFilmMode(false);
  }, [isFilmSection, setFilmMode]);

  // 鈹€鈹€ Lightbox 鐘舵€?
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showPhotoDetails, setShowPhotoDetails] = useState(false);
  const [isLightboxPortrait, setIsLightboxPortrait] = useState(false);
  const [lightboxAspectRatio, setLightboxAspectRatio] = useState(null);
  const [lightboxPreviewFailed, setLightboxPreviewFailed] = useState(false);
  const lightboxPointerRef = useRef(null);
  const lightboxRef = useRef(null);
  const lightboxReturnFocusRef = useRef(null);
  const lightboxImageRef = useRef(null);
  const lightboxMediaRef = useRef(null);
  const spatialCanvasRef = useRef(null);
  const finishLightboxClose = useCallback(() => {
    setLightboxPhoto(null);
    window.requestAnimationFrame(() => {
      if (lightboxRef.current && !lightboxRef.current.classList.contains('active')) {
        lightboxReturnFocusRef.current?.focus?.({ preventScroll: true });
      }
    });
  }, []);
  const lightboxPresent = useAnimatedPresence(lightboxOpen, lightboxRef, { onExited: finishLightboxClose });
  const spatialScene = useSpatialScene(lightboxOpen ? lightboxPhoto?.id : null, lightboxImageRef, lightboxMediaRef, spatialCanvasRef);
  const isFilmPortrait = isFilmSection && lightboxAspectRatio > 0 && lightboxAspectRatio < 1 && !lightboxPreviewFailed;

  // 鈹€鈹€ 鍝佺墝鐘舵€?
  const [brandLogo, setBrandLogo] = useState(() => getStoredBrandLogo());
  const [brandText, setBrandText] = useState(() => getStoredBrandText());

  // 鈹€鈹€ 鍦板浘 ref

  // 鈹€鈹€ 鍙戠幇瑙嗗浘闈㈡澘鐘舵€?
  const [locationPanel, setLocationPanel] = useState(null);

  // 鈹€鈹€ 鍒嗛〉
  const [displayedCount, setDisplayedCount] = useState(12);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef(null);
  const changeFilter = useCallback(filter => {
    if (filter === activeFilter) return;
    prepareLayoutRef.current?.(filter);
    // Commit the new filter and its first page together, before Flip measures.
    setDisplayedCount(12);
    setActiveFilter(filter);
  }, [activeFilter]);

  // 鈹€鈹€ 鏁版嵁 Hooks
  const {
    approvedPhotos,
    setApprovedPhotos,
    isPhotoDataLoading,
    lastPhotoDataLoadedAt,
    supabaseError,
  } = usePhotoData(supabase);
  const { likedPhotoIds, handleToggleLike } = useLikePhoto(supabase, setApprovedPhotos);
  const { browserLocation, requestLocation, locationStatus } = useBrowserLocation();
  const exifData = useExifData(lightboxPhoto);
  const geoLat = exifData?.latitude ?? lightboxPhoto?.latitude ?? null;
  const geoLon = exifData?.longitude ?? lightboxPhoto?.longitude ?? null;
  const photoAddress = usePhotoAddress(geoLat, geoLon, exifData ? 'gps' : 'autonavi', Boolean(showPhotoDetails));
  const altitudeFromApi = useAltitudeFromCoords(geoLat, geoLon);

  // 鈹€鈹€ 娲剧敓鏁版嵁
  const allPhotos = useMemo(() => approvedPhotos.filter((p) => !p.hidden), [approvedPhotos]);
  const filteredPhotos = useMemo(
    () => filterAndSortPhotos(allPhotos, activeFilter, browserLocation, calculateDistance),
    [allPhotos, activeFilter, browserLocation]
  );
  const galleryBackdropPhoto = filteredPhotos[0];
  const galleryBackdropSrc = galleryBackdropPhoto
    ? getPreviewMediaUrl(galleryBackdropPhoto, { width: 1600, quality: 80, preferOriginal: true })
    : '';
  const galleryBackdropFallbacks = galleryBackdropPhoto
    ? getPreviewMediaFallbackUrls(galleryBackdropPhoto, [
        { width: 1080, quality: 80 },
        { width: 720, quality: 80, format: false },
      ])
    : [];
  const showGalleryBackdrop = Boolean(galleryBackdropSrc) && activeView === 'gallery-view' && !isFilmSection;

  const displayedPhotos = useMemo(
    () => filteredPhotos.slice(0, displayedCount),
    [filteredPhotos, displayedCount]
  );

  const lightboxSequence = useMemo(() => {
    const visiblePhotos = activeView === 'gallery-view' ? filteredPhotos : allPhotos;
    if (!lightboxPhoto || visiblePhotos.some((photo) => photo.id === lightboxPhoto.id)) {
      return visiblePhotos;
    }
    return allPhotos;
  }, [activeView, allPhotos, filteredPhotos, lightboxPhoto]);

  const lightboxIndex = useMemo(
    () => lightboxPhoto ? lightboxSequence.findIndex((photo) => photo.id === lightboxPhoto.id) : -1,
    [lightboxPhoto, lightboxSequence]
  );
  const canNavigateLightbox = lightboxSequence.length > 1 && lightboxIndex >= 0;
  const previousLightboxPhoto = canNavigateLightbox
    ? lightboxSequence[(lightboxIndex - 1 + lightboxSequence.length) % lightboxSequence.length]
    : null;
  const nextLightboxPhoto = canNavigateLightbox
    ? lightboxSequence[(lightboxIndex + 1) % lightboxSequence.length]
    : null;

  const hasMore = displayedCount < filteredPhotos.length;
  const hasPhotoData = lastPhotoDataLoadedAt !== null || approvedPhotos.length > 0;
  const shouldShowGalleryLoading = isPhotoDataLoading && !hasPhotoData;
  const galleryStatusText = isPhotoDataLoading
    ? hasPhotoData ? '正在更新作品' : '正在加载作品'
    : `${filteredPhotos.length} / ${allPhotos.length} 张作品`;
  const gallerySyncText = lastPhotoDataLoadedAt ? `更新于 ${formatSyncTime(lastPhotoDataLoadedAt)}` : '';
  const lightboxFilmStock = lightboxPhoto ? getFilmStockFromPhoto(lightboxPhoto) : '';
  const lightboxFrameStock = isFilmSection ? getFilmFrameStock(lightboxFilmStock) : '';
  const lightboxFilmStockArtwork = isFilmSection && /^fuji\s+c200$/i.test(lightboxFilmStock)
    ? '/images/film-stocks/fuji-c200.png'
    : '';
  const lightboxCameraArtwork = isFilmSection && /^nikon\s*fm2$/i.test(String(lightboxPhoto?.camera || '').trim())
    ? '/images/cameras/nikon-fm2.png'
    : '';
  const lightboxShotInfo = lightboxPhoto
    ? getShotTimeInfo(lightboxPhoto.shotDate || lightboxPhoto.shot_date)
    : null;
  const lightboxVisualSrc = lightboxPhoto
    ? getPreviewMediaUrl(lightboxPhoto, { width: 2000, quality: 94, preferOriginal: true })
    : '';
  const lightboxVisualSrcSet = lightboxPhoto
    ? getPreviewMediaSrcSet(lightboxPhoto, LIGHTBOX_IMAGE_WIDTHS, { quality: 94, preferOriginal: true })
    : '';
  const lightboxFallbackUrls = lightboxPhoto
    ? [
        ...getPreviewMediaFallbackUrls(lightboxPhoto, LIGHTBOX_IMAGE_FALLBACKS),
        getOriginalMediaUrl(lightboxPhoto),
      ].filter(Boolean)
    : [];
  const prepareLightboxSwitch = useLightboxImageMotion(lightboxPhoto?.id, lightboxVisualSrc,
    lightboxPreviewFailed, lightboxImageRef, lightboxMediaRef);

  // 鈹€鈹€ 鍦扮悊淇℃伅锛圠ightbox 鐢級
  const getGeoInfo = useMemo(() => {
    if (!lightboxPhoto) return null;
    const lat = exifData?.latitude ?? lightboxPhoto.latitude;
    const lon = exifData?.longitude ?? lightboxPhoto.longitude;
    const altitude = exifData?.GPSAltitude ?? lightboxPhoto.altitude ?? altitudeFromApi;
    if (lat == null || lon == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))
      || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return null;
    const distance = browserLocation
      ? calculateDistance(browserLocation.lat, browserLocation.lon, Number(lat), Number(lon))
      : null;
    return {
      place: photoAddress.value?.label || photoAddress.value?.address || [lightboxPhoto.country, lightboxPhoto.location].filter(Boolean).join(' · '),
      fullAddress: photoAddress.value?.address || '',
      mapLatitude: photoAddress.value?.latitude ?? Number(lat),
      mapLongitude: photoAddress.value?.longitude ?? Number(lon),
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
  }, [lightboxPhoto, exifData, browserLocation, altitudeFromApi, photoAddress.value]);

  // 鈹€鈹€ 浜嬩欢澶勭悊
  const handleViewChange = useCallback((view) => {
    if (view === 'explore-view') setHasVisitedExplore(true);
    setLocationPanel(null);
    setActiveView(view);
  }, []);

  const handleExploreIntent = useCallback(() => {
    if (!hasVisitedExplore) {
      preloadExploreView();
      preloadConfiguredMap();
    }
  }, [hasVisitedExplore]);

  const loadMore = useCallback(() => {
    if (isLoadingMore || displayedCount >= filteredPhotos.length) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayedCount((prev) => Math.min(prev + 12, filteredPhotos.length));
      setIsLoadingMore(false);
    }, 300);
  }, [isLoadingMore, displayedCount, filteredPhotos.length]);

  const openLightboxPhoto = useCallback((photo) => {
    lightboxReturnFocusRef.current = document.activeElement;
    setShowPhotoDetails(false);
    setLightboxAspectRatio(null);
    setIsLightboxPortrait(false);
    setLightboxPreviewFailed(false);
    setLightboxPhoto(photo);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setShowPhotoDetails(false);
    setLightboxOpen(false);
  }, []);

  const goToAdjacentLightboxPhoto = useCallback((direction) => {
    if (!canNavigateLightbox || !lightboxOpen) return;
    const nextIndex = (lightboxIndex + direction + lightboxSequence.length) % lightboxSequence.length;
    const nextPhoto = lightboxSequence[nextIndex];
    if (!nextPhoto) return;
    prepareLightboxSwitch(direction);
    setShowPhotoDetails(false);
    setLightboxPreviewFailed(false);
    setLightboxPhoto(nextPhoto);
  }, [canNavigateLightbox, lightboxOpen, lightboxIndex, lightboxSequence, prepareLightboxSwitch]);

  const handleLightboxPointerDown = useCallback((event) => {
    if (event.pointerType === 'mouse') return;
    lightboxPointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      at: Date.now(),
    };
  }, []);

  const handleLightboxPointerUp = useCallback((event) => {
    const start = lightboxPointerRef.current;
    lightboxPointerRef.current = null;
    if (!start) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const elapsed = Date.now() - start.at;

    if (absX > 56 && absX > absY * 1.2 && elapsed < 800) {
      if (spatialScene.ready) return;
      event.preventDefault();
      goToAdjacentLightboxPhoto(dx < 0 ? 1 : -1);
      return;
    }

  }, [goToAdjacentLightboxPhoto, spatialScene.ready]);

  const handleLightboxPointerCancel = useCallback(() => {
    lightboxPointerRef.current = null;
  }, []);

  const openPhotoDetails = useCallback(() => {
    setShowPhotoDetails(true);
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

  // 鈹€鈹€ Effects

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
    if (!lightboxPresent) return undefined;
    const dialog = lightboxRef.current;
    dialog?.focus();

    const trapFocus = (event) => {
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog?.addEventListener('keydown', trapFocus);
    return () => dialog?.removeEventListener('keydown', trapFocus);
  }, [lightboxPhoto, lightboxPresent]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (showPhotoDetails) setShowPhotoDetails(false);
        else closeLightbox();
        return;
      }

      if (!showPhotoDetails && lightboxPhoto && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        goToAdjacentLightboxPhoto(e.key === 'ArrowRight' ? 1 : -1);
      }
    };
    if (lightboxPhoto || showPhotoDetails) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [closeLightbox, goToAdjacentLightboxPhoto, lightboxPhoto, showPhotoDetails]);

  useEffect(() => {
    if (!lightboxPhoto || !canNavigateLightbox) return;

    const preloadWidth = getLightboxPreloadWidth();
    [previousLightboxPhoto, nextLightboxPhoto]
      .filter(Boolean)
      .map((photo) => getPreviewMediaUrl(photo, {
        width: preloadWidth,
        quality: 92,
        preferOriginal: true,
      }))
      .filter(Boolean)
      .forEach((src) => {
        const img = new Image();
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.src = src;
      });
  }, [canNavigateLightbox, lightboxPhoto, nextLightboxPhoto, previousLightboxPhoto]);

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

  // ── Render
  return (
    <div ref={shellRef} className={`app-shell ${activeView === 'explore-view' ? 'explore-mode' : ''}${showGalleryBackdrop ? ' has-gallery-backdrop' : ''}`}>
      {showGalleryBackdrop && (
        <div className="gallery-backdrop" aria-hidden="true">
          <img key={galleryBackdropSrc} src={galleryBackdropSrc} alt="" decoding="async" fetchPriority="low"
            onError={(event) => {
              if (!advanceImageFallback(event.currentTarget, galleryBackdropFallbacks)) {
                event.currentTarget.style.visibility = 'hidden';
              }
            }} />
        </div>
      )}
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
        <div className="header-actions">
          <ThemeSwitcher />
          <div className={`view-toggle ${activeView === 'explore-view' ? 'explore-active' : ''}${isFilmSection ? ' has-film-frame' : ''}`}>
            <button
              className={`toggle-btn ${activeView === 'gallery-view' ? 'active' : ''}`}
              onClick={() => handleViewChange('gallery-view')}
              aria-pressed={activeView === 'gallery-view'}
            >
              <span className="toggle-label">图库</span>
            </button>
            <button
              className={`toggle-btn ${activeView === 'explore-view' ? 'active' : ''}`}
              onMouseEnter={handleExploreIntent}
              onPointerEnter={handleExploreIntent}
              onPointerDown={handleExploreIntent}
              onFocus={handleExploreIntent}
              onTouchStart={handleExploreIntent}
              onClick={() => handleViewChange('explore-view')}
              aria-pressed={activeView === 'explore-view'}
            >
              <span className="toggle-label">发现</span>
            </button>
            {isFilmSection && <FilmControlFrame />}
          </div>
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
          <TabStrip activeFilter={activeFilter} onFilterChange={changeFilter} />
          <div className="gallery-status-row" aria-live="polite">
            <span className="gallery-count">{galleryStatusText}</span>
            {gallerySyncText && (
              <time className="gallery-sync" dateTime={new Date(lastPhotoDataLoadedAt).toISOString()}>
                {gallerySyncText}
              </time>
            )}
          </div>
          {shouldShowGalleryLoading ? (
            <GalleryLoadingState />
          ) : filteredPhotos.length > 0 ? (
            <PhotoGrid
              isActive={activeView === 'gallery-view'}
              photos={displayedPhotos}
              likedPhotoIds={likedPhotoIds}
              onPhotoClick={openLightboxPhoto}
              onToggleLike={handleToggleLike}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={loadMore}
              loadMoreRef={loadMoreRef}
              totalCount={filteredPhotos.length}
              filmFrames={isFilmSection}
              filterKey={activeFilter}
              prepareLayoutRef={prepareLayoutRef}
            />
          ) : (
            <div className="empty-state">
              <p className="empty-text">暂无符合条件的照片</p>
              <p className="empty-hint">可切换其他分类，或在后台把照片分类设为“胶片”</p>
            </div>
          )}
        </section>

        {hasVisitedExplore && (
          <div hidden={activeView !== 'explore-view'}>
            <Suspense fallback={<ExploreViewPending />}>
              <ExploreView
                isActive={activeView === 'explore-view'}
                approvedPhotos={approvedPhotos}
                allPhotos={allPhotos}
                isLoading={isPhotoDataLoading}
                browserLocation={browserLocation}
                onShowLocationPanel={setLocationPanel}
                onPhotoClick={openLightboxPhoto}
              />
            </Suspense>
          </div>
        )}
      </main>

      <LocationPanel
        data={locationPanel}
        onClose={() => setLocationPanel(null)}
        onPhotoClick={(p) => { openLightboxPhoto(p); setLocationPanel(null); }}
      />

      {/* Lightbox */}
      <div
        ref={lightboxRef}
        className={`lightbox ${lightboxPresent ? 'active' : ''}`}
        data-state={lightboxOpen ? 'open' : 'closing'}
        aria-hidden={lightboxPresent ? 'false' : 'true'}
        role={lightboxPresent ? 'dialog' : undefined}
        aria-modal={lightboxPresent ? 'true' : undefined}
        aria-labelledby={lightboxPresent ? 'lightbox-title' : undefined}
        tabIndex={lightboxPresent ? -1 : undefined}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeLightbox();
        }}
      >
        <div
          className={`lightbox-panel lightbox-panel--photo-only${isFilmSection ? ' lightbox-panel--film' : ''}${isFilmPortrait ? ' lightbox-panel--film-portrait' : ''}${lightboxFrameStock ? ` lightbox-panel--${lightboxFrameStock}` : ''}`}
          style={{
            '--lightbox-aspect-ratio': lightboxAspectRatio || undefined,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {isFilmSection && (
            <div className="lightbox-film-frame" aria-hidden="true">
              <FilmFrameEdges orientation={isFilmPortrait ? 'portrait' : 'landscape'}
                filmStock={lightboxFilmStock}
                repeatHorizontal={!isFilmPortrait} repeatVertical={isFilmPortrait} />
            </div>
          )}
          {lightboxPhoto && <h2 id="lightbox-title" className="lightbox-accessible-title">{lightboxPhoto.title || '未命名照片'}</h2>}
          <div className="lightbox-actions">
            {lightboxPhoto && (
              <div className="lightbox-action-group" role="group" aria-label="照片操作">
                <button type="button" className="lightbox-details-trigger" aria-label="基本参数" title="基本参数"
                  aria-haspopup="dialog" aria-expanded={Boolean(showPhotoDetails)} onClick={openPhotoDetails}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                    <path d="M7 6h13M7 12h13M7 18h13M3 6h.01M3 12h.01M3 18h.01" />
                  </svg>
                  <span>基本参数</span>
                </button>
                <SpatialSceneControls scene={spatialScene} disabled={lightboxPreviewFailed || !lightboxAspectRatio} />
                <button className="lightbox-download" aria-label="下载原图" title="下载原图" onClick={handleDownloadOriginal}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
                  </svg>
                  <span>下载原图</span>
                </button>
              </div>
            )}
            <button className="lightbox-close" aria-label="关闭" onClick={closeLightbox}>
              &times;
            </button>
          </div>
          {canNavigateLightbox && (
            <div className="lightbox-navigation" role="group" aria-label="照片切换">
              <button
                type="button"
                className="lightbox-nav lightbox-nav-prev"
                aria-label="上一张照片"
                onClick={(e) => {
                  e.stopPropagation();
                  goToAdjacentLightboxPhoto(-1);
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 6-6 6 6 6" />
                </svg>
              </button>
              <button
                type="button"
                className="lightbox-nav lightbox-nav-next"
                aria-label="下一张照片"
                onClick={(e) => {
                  e.stopPropagation();
                  goToAdjacentLightboxPhoto(1);
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </button>
            </div>
          )}
          <div className="lightbox-content-wrapper">
            <div ref={lightboxMediaRef} className={`lightbox-media ${isLightboxPortrait ? 'portrait-fit' : ''} ${lightboxAspectRatio ? 'aspect-fit' : ''} ${spatialScene.ready ? 'spatial-scene-active' : ''}`}
              style={lightboxAspectRatio ? { '--lightbox-aspect-ratio': lightboxAspectRatio } : undefined}
              onPointerDown={handleLightboxPointerDown}
              onPointerUp={handleLightboxPointerUp}
              onPointerCancel={handleLightboxPointerCancel}>
              {lightboxPhoto && lightboxVisualSrc && !lightboxPreviewFailed ? (
                <img
                  ref={lightboxImageRef}
                  key={lightboxPhoto.id}
                  src={lightboxVisualSrc}
                  srcSet={lightboxVisualSrcSet || undefined}
                  sizes={lightboxVisualSrcSet ? (isFilmSection ? '100vw' : LIGHTBOX_IMAGE_SIZES) : undefined}
                  alt={lightboxPhoto.title}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    delete img.dataset.previewFallbackIndex;
                    setIsLightboxPortrait(img.naturalHeight > img.naturalWidth);
                    setLightboxAspectRatio(img.naturalWidth / img.naturalHeight);
                  }}
                  onError={(e) => {
                    if (advanceImageFallback(e.currentTarget, lightboxFallbackUrls)) return;

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
              {lightboxPhoto && (
                <canvas ref={spatialCanvasRef} className={`spatial-scene-canvas ${spatialScene.ready ? 'is-ready' : ''}`} aria-hidden="true" />
              )}
              {lightboxPhoto && <SpatialSceneStatus scene={spatialScene} />}
              {lightboxPhoto && lightboxVisualSrc && !lightboxPreviewFailed && (
                <span className="lightbox-watermark-frame" aria-hidden="true">
                  <span className="lightbox-watermark" />
                </span>
              )}
            </div>

          </div>
        </div>

        {lightboxPhoto && (
          <PhotoDetailsSheet open={showPhotoDetails} photo={lightboxPhoto} geoInfo={getGeoInfo} address={photoAddress}
            shotInfo={lightboxShotInfo} filmStock={lightboxFilmStock} isFilm={isFilmSection}
            cameraArtwork={lightboxCameraArtwork} filmStockArtwork={lightboxFilmStockArtwork}
            locationStatus={locationStatus} onRequestLocation={requestLocation}
            onClose={() => setShowPhotoDetails(false)} />
        )}
      </div>
    </div>
  );
}
