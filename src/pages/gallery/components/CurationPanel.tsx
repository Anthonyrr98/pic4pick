/**
 * 精选面板组件 - 显示省份和城市的精选卡片
 */

import React, { useEffect, useState } from 'react';
import { CurationGroup, CityEntry } from '../utils/photoDataUtils';

interface CurationPanelProps {
  groups: CurationGroup[];
  expandedCategories: Record<string, boolean>;
  onToggleCategory: (categoryId: string) => void;
  onCityClick: (province: CurationGroup, city: CityEntry) => void;
  activeCitySelection: { provinceId: string; cityId: string } | null;
  isPanelCollapsed: boolean;
  onTogglePanelCollapse: () => void;
}

export const CurationPanel: React.FC<CurationPanelProps> = ({
  groups,
  expandedCategories,
  onToggleCategory,
  onCityClick,
  activeCitySelection,
  isPanelCollapsed,
  onTogglePanelCollapse,
}) => {
  const [loadedImageIds, setLoadedImageIds] = useState<Record<string, boolean>>({});

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
    <aside className={`curation-panel ${isPanelCollapsed ? 'collapsed' : ''}`}>
      <button
        className="curation-panel-toggle"
        onClick={onTogglePanelCollapse}
        aria-label={isPanelCollapsed ? '展开面板' : '收起面板'}
        type="button"
      >
        <span className={`curation-panel-toggle-icon ${isPanelCollapsed ? 'collapsed' : ''}`}></span>
      </button>
      {groups.map((group) => (
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
