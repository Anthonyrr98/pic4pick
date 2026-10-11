/**
 * 精选面板组件 - 显示省份和城市的精选卡片
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CurationGroup, CityEntry } from '../utils/photoDataUtils';

interface CurationPanelProps {
  groups: CurationGroup[];
  isLoading: boolean;
  expandedCategories: Record<string, boolean>;
  onToggleCategory: (categoryId: string) => void;
  onCityClick: (province: CurationGroup, city: CityEntry) => void;
  activeCitySelection: { provinceId: string; cityId: string } | null;
  isPanelCollapsed: boolean;
  onTogglePanelCollapse: () => void;
}

export const CurationPanel: React.FC<CurationPanelProps> = ({
  groups,
  isLoading,
  expandedCategories,
  onToggleCategory,
  onCityClick,
  activeCitySelection,
  isPanelCollapsed,
  onTogglePanelCollapse,
}) => {
  const [loadedImageIds, setLoadedImageIds] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const firstSearchResultRef = useRef<HTMLButtonElement>(null);
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
      className={`curation-panel ${isPanelCollapsed ? 'collapsed' : ''} ${
        isLoading ? 'loading' : groups.length === 0 ? 'empty' : ''
      }`}
    >
      <button
        className="curation-panel-toggle"
        onClick={onTogglePanelCollapse}
        aria-label={isPanelCollapsed ? '展开面板' : '收起面板'}
        type="button"
      >
        <span className={`curation-panel-toggle-icon ${isPanelCollapsed ? 'collapsed' : ''}`}></span>
      </button>
      {!isPanelCollapsed && (
        <form className="discover-search" role="search" aria-label="发现地点搜索"
          onSubmit={event => {
            event.preventDefault();
            if (isLoading) return;
            if (searchResults.length === 1) {
              const { group, city } = searchResults[0];
              onCityClick(group, city);
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
      {!isPanelCollapsed && !isLoading && isSearching && (
        <div className="discover-search-results">
          <p className="discover-search-status" role="status">
            {searchResults.length ? `找到 ${searchResults.length} 个地点` : '未找到相关地点'}
          </p>
          {searchResults.length === 0 && <p className="discover-search-hint">试试其他省份或城市，或清除搜索查看全部地点。</p>}
          <ul>
            {searchResults.map(({ group, city }, index) => (
              <li key={city.id}>
                <button ref={index === 0 ? firstSearchResultRef : undefined} type="button"
                  className="discover-search-result"
                  aria-pressed={activeCitySelection?.provinceId === group.id && activeCitySelection?.cityId === city.id}
                  onClick={() => onCityClick(group, city)}>
                  <span><strong>{city.label}</strong><small>{group.title}</small></span>
                  <span className="discover-search-count">{city.photoCount} 张<span aria-hidden="true"> ›</span></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!isLoading && (!isSearching || isPanelCollapsed) && groups.map((group) => (
        <div key={group.id} className="curation-category">
          <button
            className="curation-category-header"
            onClick={() => {
              if (!isPanelCollapsed) {
                onToggleCategory(group.id);
              }
            }}
          >
            <h3 className="curation-category-title">{group.title}</h3>
            <span
              className={`curation-category-arrow ${
                expandedCategories[group.id] ? 'expanded' : ''
              }`}
            />
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
                    className={`curation-card ${isActiveCity ? 'active' : ''}`}
                    onMouseMove={handleCurationCardMouseMove}
                    onMouseLeave={handleCurationCardMouseLeave}
                    onClick={() => onCityClick(group, item)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isActiveCity}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onCityClick(group, item);
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
    </aside>
  );
};
