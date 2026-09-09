/**
 * 标签页组件 - 显示筛选标签
 */

import React, { useEffect, useRef } from 'react';
import { tabs } from '../constants/locationData';
import { FilterType } from '../utils/photoFilterUtils';

interface TabStripProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
}

export const TabStrip: React.FC<TabStripProps> = ({
  activeFilter,
  onFilterChange,
}) => {
  const tabStripRef = useRef<HTMLDivElement>(null);

  // 更新标签页滑动背景位置
  useEffect(() => {
    const updateTabIndicator = () => {
      if (!tabStripRef.current) return;

      const activeTab = tabStripRef.current.querySelector('.tab.active');
      if (!activeTab) return;

      const stripRect = tabStripRef.current.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();

      const left = tabRect.left - stripRect.left;
      const width = tabRect.width;

      tabStripRef.current.style.setProperty('--tab-indicator-left', `${left}px`);
      tabStripRef.current.style.setProperty('--tab-indicator-width', `${width}px`);
    };

    updateTabIndicator();
    window.addEventListener('resize', updateTabIndicator);
    const timeout = setTimeout(updateTabIndicator, 100);

    return () => {
      window.removeEventListener('resize', updateTabIndicator);
      clearTimeout(timeout);
    };
  }, [activeFilter]);

  return (
    <div className="tab-strip" ref={tabStripRef} role="tablist" aria-label="作品分类">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab ${activeFilter === tab.id ? 'active' : ''}`}
          onClick={() => onFilterChange(tab.id as FilterType)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const currentIndex = tabs.findIndex((item) => item.id === tab.id);
            const nextIndex = event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? tabs.length - 1
                : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            onFilterChange(tabs[nextIndex].id as FilterType);
            window.requestAnimationFrame(() => {
              const buttons = tabStripRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
              buttons?.[nextIndex]?.focus();
            });
          }}
          role="tab"
          aria-selected={activeFilter === tab.id}
          tabIndex={activeFilter === tab.id ? 0 : -1}
        >
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};
