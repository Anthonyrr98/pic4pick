/**
 * 标签页组件 - 显示筛选标签
 */

import React, { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { tabs } from '../constants/locationData';
import { FilterType } from '../utils/photoFilterUtils';
import { FilmControlFrame } from './FilmFrame';

gsap.registerPlugin(useGSAP);

interface TabStripProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
}

export const TabStrip: React.FC<TabStripProps> = ({
  activeFilter,
  onFilterChange,
}) => {
  const tabStripRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const updateRef = useRef<((animate: boolean) => void) | null>(null);

  useGSAP(() => {
    const strip = tabStripRef.current;
    const indicator = indicatorRef.current;
    if (!strip || !indicator) return;
    const media = gsap.matchMedia();
    media.add({ reduce: '(prefers-reduced-motion: reduce)', animate: '(prefers-reduced-motion: no-preference)' }, (_context, contextSafe) => {
      let previous: { x: number; width: number } | null = null;
      const update = contextSafe!((animate: boolean) => {
        const activeTab = strip.querySelector<HTMLElement>('.tab.active');
        if (!activeTab || activeTab.offsetWidth === 0) return;
        const x = activeTab.offsetLeft;
        const width = activeTab.offsetWidth;
        if (previous?.x === x && previous.width === width) return;
        const duration = animate && previous && !_context.conditions?.reduce ? 0.4 : 0;
        // Width is measured once per layout change; only movement is interpolated.
        gsap.set(indicator, { width });
        gsap.to(indicator, { x, duration, ease: 'power3.out', overwrite: true });
        previous = { x, width };
      }) as (animate: boolean) => void;
      updateRef.current = update;
      update(false);
      const resize = () => update(false);
      const observer = new ResizeObserver(resize);
      observer.observe(strip);
      strip.querySelectorAll('.tab').forEach(tab => observer.observe(tab));
      document.fonts.addEventListener('loadingdone', resize);
      return () => {
        observer.disconnect();
        document.fonts.removeEventListener('loadingdone', resize);
        updateRef.current = null;
      };
    }, strip);
    return () => media.revert();
  }, { scope: tabStripRef });

  useGSAP(() => { updateRef.current?.(true); }, { dependencies: [activeFilter] });

  return (
    <div className={`tab-strip${activeFilter === 'film' ? ' film-label-selected' : ''}`} ref={tabStripRef} role="tablist" aria-label="作品分类">
      <span ref={indicatorRef} className="tab-indicator" aria-hidden="true" />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab ${activeFilter === tab.id ? 'active' : ''}${tab.id === 'film' && activeFilter === 'film' ? ' tab--film' : ''}`}
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
      {activeFilter === 'film' && <FilmControlFrame />}
    </div>
  );
};
