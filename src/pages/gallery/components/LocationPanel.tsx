/**
 * 位置面板组件 - 显示地点的照片列表
 */

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { GalleryPhoto } from '../utils/photoDataUtils';
import { useAnimatedPresence } from '../../../hooks/useAnimatedPresence';

export interface LocationPanelData {
  title: string;
  subtitle: string;
  photos: GalleryPhoto[];
  emptyMessage?: string;
}

interface LocationPanelProps {
  data: LocationPanelData | null;
  onClose: () => void;
  onPhotoClick: (photo: GalleryPhoto) => void;
}

export const LocationPanel: React.FC<LocationPanelProps> = ({
  data,
  onClose,
  onPhotoClick,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasPresentRef = useRef(false);
  const selectedRef = useRef<GalleryPhoto | null>(null);
  const [retainedData, setRetainedData] = useState(data);
  const titleId = useId();
  useLayoutEffect(() => {
    if (data) {
      setRetainedData(data);
      selectedRef.current = null;
    }
  }, [data]);
  const finishExit = useCallback(() => {
    const selected = selectedRef.current;
    selectedRef.current = null;
    setRetainedData(null);
    // Restore the map trigger first, so the lightbox can return to it later.
    if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
    if (selected) onPhotoClick(selected);
  }, [onPhotoClick]);
  const present = useAnimatedPresence(Boolean(data), rootRef, {
    panelSelector: '.location-panel', onExited: finishExit,
  });
  useLayoutEffect(() => {
    if (!present) { wasPresentRef.current = false; return; }
    if (!wasPresentRef.current) returnFocusRef.current = document.activeElement as HTMLElement;
    wasPresentRef.current = true;
    if (data) closeRef.current?.focus({ preventScroll: true });
    else rootRef.current?.focus({ preventScroll: true });
  }, [data, present]);
  useEffect(() => {
    if (!present) return;
    return () => {
      if (returnFocusRef.current?.isConnected && (rootRef.current?.contains(document.activeElement)
        || document.activeElement === document.body)) {
        returnFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, [present]);
  const shown = data || retainedData;
  if (!present || !shown) return null;

  return (
    <div
      ref={rootRef}
      className="location-panel-backdrop"
      data-state={data ? 'open' : 'closing'}
      tabIndex={-1}
      onClick={() => { if (data) onClose(); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          if (data) onClose();
        }
        if (event.key !== 'Tab') return;
        if (!data) { event.preventDefault(); return; }
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
    >
      <div
        className="location-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        inert={!data}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="location-panel-header">
          <div>
            <h3 id={titleId} className="location-panel-title">{shown.title}</h3>
            {shown.subtitle && (
              <p className="location-panel-subtitle">{shown.subtitle}</p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="location-panel-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="location-panel-body">
          {shown.photos.length === 0 ? (
            <div className="location-panel-empty">
              {shown.emptyMessage || '当前没有可用的图库照片'}
            </div>
          ) : (
            <div className="location-panel-grid">
              {shown.photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="location-panel-photo"
                  aria-label={`查看作品：${p.title || '未命名照片'}`}
                  onClick={() => {
                    if (!data || selectedRef.current) return;
                    selectedRef.current = p;
                    onClose();
                  }}
                >
                  <img src={p.thumbnail || p.image} alt={p.title} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
