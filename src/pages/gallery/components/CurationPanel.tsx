/**
 * 地点面板组件 - 显示省份、城市卡片和地点照片
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CurationGroup, CityEntry, GalleryPhoto } from '../utils/photoDataUtils';
import './CurationPanel.css';

interface CurationPanelProps {
  isActive: boolean;
  groups: CurationGroup[];
  isLoading: boolean;
  expandedCategories: Record<string, boolean>;
  onToggleCategory: (categoryId: string) => void;
  onCityClick: (province: CurationGroup, city: CityEntry) => void;
  onPhotoClick: (photo: GalleryPhoto) => void;
  activeCitySelection: { provinceId: string; cityId: string } | null;
  isPanelCollapsed: boolean;
  onTogglePanelCollapse: () => void;
}

const getSheetViewport = () => {
  const visual = window.visualViewport;
  const height = visual && visual.scale === 1 ? visual.height : window.innerHeight;
  const inset = Math.max(0, window.innerHeight - height - (visual?.offsetTop || 0));
  return { mobile: window.innerWidth <= 768, height, keyboard: inset > 80 ? inset : 0 };
};

export const CurationPanel: React.FC<CurationPanelProps> = ({
  isActive,
  groups,
  isLoading,
  expandedCategories,
  onToggleCategory,
  onCityClick,
  onPhotoClick,
  activeCitySelection,
  isPanelCollapsed,
  onTogglePanelCollapse,
}) => {
  const [loadedImageIds, setLoadedImageIds] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [galleryCityId, setGalleryCityId] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const galleryBackRef = useRef<HTMLButtonElement>(null);
  const listScrollTopRef = useRef(0);
  const returnCityIdRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const firstSearchResultRef = useRef<HTMLButtonElement>(null);
  const [sheetViewport, setSheetViewport] = useState(getSheetViewport);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const selectionFrameRef = useRef(0);
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureRef = useRef<{ y: number; moved: boolean } | null>(null);
  const suppressHandleClickRef = useRef(false);
  const sheetHeight = isPanelCollapsed ? 78 : isSheetExpanded
    ? Math.max(180, Math.min(sheetViewport.height * 0.78, sheetViewport.height - 104))
    : Math.min(380, sheetViewport.height * 0.46);
  const selectedCity = groups.flatMap(group => group.items).find(city => city.id === activeCitySelection?.cityId);
  const galleryCity = groups.flatMap(group => group.items).find(city => city.id === galleryCityId);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const scroller = window.innerWidth <= 768 ? scrollRef.current : panelRef.current;
      if (scroller) scroller.scrollTop = galleryCityId ? 0 : listScrollTopRef.current;
      if (galleryCityId) galleryBackRef.current?.focus({ preventScroll: true });
      else if (returnCityIdRef.current) {
        panelRef.current?.querySelector<HTMLElement>(`[data-city-id="${CSS.escape(returnCityIdRef.current)}"]`)?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [galleryCityId]);

  useEffect(() => () => {
    cancelAnimationFrame(selectionFrameRef.current);
    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
  }, [isActive]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = getSheetViewport();
        setSheetViewport(prev => prev.mobile === next.mobile && prev.height === next.height && prev.keyboard === next.keyboard ? prev : next);
      });
    };
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(selectionFrameRef.current);
      if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  const selectCity = (group: CurationGroup, city: CityEntry) => {
    const scroller = sheetViewport.mobile ? scrollRef.current : panelRef.current;
    listScrollTopRef.current = scroller?.scrollTop || 0;
    returnCityIdRef.current = city.id;
    setGalleryCityId(city.id);
    if (!sheetViewport.mobile) { onCityClick(group, city); return; }
    setIsSheetExpanded(false);
    searchInputRef.current?.blur();
    cancelAnimationFrame(selectionFrameRef.current);
    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
    const focus = () => {
      selectionFrameRef.current = requestAnimationFrame(() => onCityClick(group, city));
    };
    // Let the keyboard dismiss before measuring the destination's visible area.
    if (sheetViewport.keyboard) selectionTimerRef.current = setTimeout(focus, 250);
    else focus();
  };

  const togglePanel = () => {
    if (suppressHandleClickRef.current) { suppressHandleClickRef.current = false; return; }
    setIsSheetExpanded(false);
    searchInputRef.current?.blur();
    onTogglePanelCollapse();
  };
  const searchTerms = searchQuery.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const isSearching = searchTerms.length > 0;
  const searchResults = useMemo(() => {
    const terms = searchQuery.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return groups.flatMap(group => group.items
      .filter(city => terms.every(term => `${group.title} ${city.label}`.normalize('NFKC').toLocaleLowerCase().includes(term)))
      .map(city => ({ group, city })));
  }, [groups, searchQuery]);
  const clearSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  useEffect(() => {
    const currentIds = new Set(groups.flatMap((group) => group.items.map((item) => item.id)));
    setLoadedImageIds((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([id, loaded]) => {
        if (currentIds.has(id)) next[id] = loaded;
      });
      return next;
    });
  }, [groups]);

  const handleCurationCardMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    if (sheetViewport.mobile) return;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width - 0.5;
    const relativeY = (event.clientY - rect.top) / rect.height - 0.5;

    const percentX = ((event.clientX - rect.left) / rect.width) * 100;
    const percentY = ((event.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--cursor-x', `${percentX}%`);
    card.style.setProperty('--cursor-y', `${percentY}%`);

    const maxTilt = 9;
    const rotateY = relativeX * maxTilt * 2;
    const rotateX = -relativeY * maxTilt * 2;

    card.style.transform = `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(
      2,
    )}deg) translateZ(18px)`;
  };

  const handleCurationCardMouseLeave = (event: React.MouseEvent<HTMLElement>) => {
    const card = event.currentTarget;
    card.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0)';
    card.style.setProperty('--cursor-x', '50%');
    card.style.setProperty('--cursor-y', '50%');
  };

  return (
    <aside
      ref={panelRef}
      className={`curation-panel ${galleryCity ? 'showing-photos' : ''} ${isPanelCollapsed ? 'collapsed' : ''} ${
        isLoading ? 'loading' : groups.length === 0 ? 'empty' : ''
      }`}
      aria-label="探索地点"
      data-mobile={sheetViewport.mobile}
      data-sheet-state={isPanelCollapsed ? 'peek' : isSheetExpanded ? 'expanded' : 'compact'}
      data-focus-height={sheetViewport.mobile ? sheetHeight : undefined}
      style={{ '--curation-sheet-height': `${sheetHeight}px`, '--curation-keyboard-inset': `${sheetViewport.keyboard}px` } as React.CSSProperties}
    >
      <div className="curation-panel-heading">
      <button
        className="curation-panel-toggle"
        onClick={togglePanel}
        aria-label={isPanelCollapsed ? '展开面板' : '收起面板'}
        aria-expanded={!isPanelCollapsed}
        type="button"
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') suppressHandleClickRef.current = false;
        }}
        onPointerDown={event => {
          if (!sheetViewport.mobile) return;
          suppressHandleClickRef.current = false;
          gestureRef.current = { y: event.clientY, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (gestureRef.current && Math.abs(event.clientY - gestureRef.current.y) > 10) gestureRef.current.moved = true;
        }}
        onPointerCancel={() => { gestureRef.current = null; }}
        onPointerUp={event => {
          const gesture = gestureRef.current;
          gestureRef.current = null;
          if (!gesture?.moved) return;
          suppressHandleClickRef.current = true;
          const delta = event.clientY - gesture.y;
          if (Math.abs(delta) < 35) return;
          searchInputRef.current?.blur();
          if (delta < 0) {
            if (isPanelCollapsed) { setIsSheetExpanded(false); onTogglePanelCollapse(); }
            else setIsSheetExpanded(true);
          } else if (isSheetExpanded) setIsSheetExpanded(false);
          else if (!isPanelCollapsed) onTogglePanelCollapse();
        }}
      >
        <span className={`curation-panel-toggle-icon ${isPanelCollapsed ? 'collapsed' : ''}`}></span>
      </button>
      <div className="curation-mobile-heading">
        <strong>{galleryCity ? '地点照片' : '探索地点'}</strong>
        <span>{galleryCity ? `${galleryCity.photos.length} 张` : selectedCity ? `${selectedCity.label} · ${selectedCity.photoCount} 张` : `${groups.length} 个地区`}</span>
      </div>
      <button className="curation-sheet-expand" type="button"
        aria-label={isSheetExpanded && !isPanelCollapsed ? '缩小地点列表' : '展开地点列表'}
        aria-expanded={isSheetExpanded && !isPanelCollapsed}
        onClick={() => {
          if (isPanelCollapsed) onTogglePanelCollapse();
          searchInputRef.current?.blur();
          setIsSheetExpanded(prev => isPanelCollapsed ? true : !prev);
        }}>{isSheetExpanded && !isPanelCollapsed ? '收起' : '展开'}</button>
      </div>
      {galleryCity && !isPanelCollapsed && (
        <div className="curation-gallery-header">
          <button ref={galleryBackRef} className="curation-gallery-back" type="button"
            aria-label="返回地点列表" onClick={() => setGalleryCityId(null)}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 5-7 7 7 7M5 12h14" />
            </svg>
          </button>
          <h3 id="curation-gallery-title">{galleryCity.label}</h3>
          <span>{galleryCity.photos.length} 张</span>
        </div>
      )}
      {galleryCity && isPanelCollapsed && <div className="curation-gallery-peek">{galleryCity.label} · {galleryCity.photos.length} 张</div>}
      {!galleryCity && !isPanelCollapsed && (
        <form className="discover-search" role="search" aria-label="发现地点搜索"
          onSubmit={event => {
            event.preventDefault();
            if (isLoading) return;
            if (searchResults.length === 1) {
              const { group, city } = searchResults[0];
              selectCity(group, city);
            } else {
              firstSearchResultRef.current?.focus();
            }
          }}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" />
          </svg>
          <input ref={searchInputRef} type="search" aria-label="搜索地点"
            placeholder="搜索省份或城市" value={searchQuery} autoComplete="off"
            onChange={event => setSearchQuery(event.target.value)}
            onFocus={() => { if (sheetViewport.mobile) setIsSheetExpanded(true); }}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Escape' && searchQuery) {
                event.preventDefault();
                clearSearch();
              }
              if (event.key === 'ArrowDown' && searchResults.length) {
                event.preventDefault();
                firstSearchResultRef.current?.focus();
              }
            }} />
          {searchQuery && <button type="button" aria-label="清除地点搜索" onClick={clearSearch}>×</button>}
        </form>
      )}
      <div ref={scrollRef} className="curation-panel-scroll">
      {galleryCity && !isPanelCollapsed && (
        <div className="curation-photo-grid" role="group" aria-labelledby="curation-gallery-title">
          {galleryCity.photos.map((photo, index) => (
            <button key={photo.id} className="curation-photo-thumb" type="button"
              aria-label={`查看照片：${photo.title || `${galleryCity.label}照片 ${index + 1}`}`}
              onClick={() => onPhotoClick(photo)}>
              <img src={photo.thumbnail || photo.preview || photo.image}
                alt={photo.title || `${galleryCity.label}照片 ${index + 1}`}
                loading="lazy" decoding="async" referrerPolicy="no-referrer"
                onError={event => {
                  const image = event.currentTarget;
                  if (!image.dataset.fallback && image.getAttribute('src') !== photo.image) {
                    image.dataset.fallback = 'true';
                    image.src = photo.image;
                  } else {
                    image.hidden = true;
                  }
                }} />
              <span className="curation-photo-fallback" aria-hidden="true">{photo.title || '查看照片'}</span>
            </button>
          ))}
        </div>
      )}
      {!isPanelCollapsed && isLoading && (
        <div className="curation-panel-status" role="status" aria-live="polite">
          <div className="curation-panel-status-copy">
            <span>正在整理地点</span>
            <small>照片与城市信息加载中</small>
          </div>
          <div className="curation-panel-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
      {!isPanelCollapsed && !isLoading && groups.length === 0 && (
        <div className="curation-panel-status empty" role="status">
          <div className="curation-panel-status-copy">
            <span>暂无可探索地点</span>
            <small>带有地点信息的照片会显示在这里</small>
          </div>
        </div>
      )}
      {!galleryCity && !isPanelCollapsed && !isLoading && isSearching && (
        <div className="discover-search-results">
          <p className="discover-search-status" role="status">
            {searchResults.length ? `找到 ${searchResults.length} 个地点` : '未找到相关地点'}
          </p>
          {searchResults.length === 0 && <p className="discover-search-hint">试试其他省份或城市，或清除搜索查看全部地点。</p>}
          <ul>
            {searchResults.map(({ group, city }, index) => (
              <li key={city.id}>
                <button ref={index === 0 ? firstSearchResultRef : undefined} type="button"
                  data-city-id={city.id}
                  className="discover-search-result"
                  aria-pressed={activeCitySelection?.provinceId === group.id && activeCitySelection?.cityId === city.id}
                  onClick={() => selectCity(group, city)}>
                  <span><strong>{city.label}</strong><small>{group.title}</small></span>
                  <span className="discover-search-count">{city.photoCount} 张<span aria-hidden="true"> ›</span></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!galleryCity && !isLoading && (!isSearching || isPanelCollapsed) && groups.map((group) => (
        <div key={group.id} className="curation-category">
          <button
            className="curation-category-header"
            aria-expanded={!isPanelCollapsed && !!expandedCategories[group.id]}
            onClick={() => {
              if (!isPanelCollapsed) {
                onToggleCategory(group.id);
              }
            }}
          >
            <h3 className="curation-category-title">{group.title}</h3>
            <span className="curation-category-trailing"><span className="curation-mobile-count" aria-hidden="true">{group.items.length} 个地点</span><span
              className={`curation-category-arrow ${
                expandedCategories[group.id] ? 'expanded' : ''
              }`}
            /></span>
          </button>
          {!isPanelCollapsed && expandedCategories[group.id] && (
            <div className="curation-category-content">
              {group.items.map((item) => {
                const isActiveCity =
                  activeCitySelection?.provinceId === group.id &&
                  activeCitySelection?.cityId === item.id;
                const cityCount = item.photoCount ?? 0;
                const isImageLoaded = !!loadedImageIds[item.id];
                return (
                  <article
                    key={item.id}
                    data-city-id={item.id}
                    className={`curation-card ${isActiveCity ? 'active' : ''}`}
                    onMouseMove={handleCurationCardMouseMove}
                    onMouseLeave={handleCurationCardMouseLeave}
                    onClick={() => selectCity(group, item)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isActiveCity}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectCity(group, item);
                      }
                    }}
                  >
                    <figure>
                      <div className={`curation-skeleton ${isImageLoaded ? 'loaded' : ''}`} aria-hidden="true" />
                      <img
                        src={item.image}
                        alt={item.label}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        decoding="async"
                        className={isImageLoaded ? 'loaded' : ''}
                        onLoad={() => {
                          setLoadedImageIds((prev) => (prev[item.id] ? prev : { ...prev, [item.id]: true }));
                        }}
                        onError={() => {
                          setLoadedImageIds((prev) => (prev[item.id] ? prev : { ...prev, [item.id]: true }));
                        }}
                      />
                      <div className="curation-card-label">
                        {cityCount > 0 ? `${item.label} · ${cityCount} 张` : item.label}
                      </div>
                    </figure>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ))}
      </div>
    </aside>
  );
};
