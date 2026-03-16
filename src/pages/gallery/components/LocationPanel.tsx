/**
 * 位置面板组件 - 显示地点的照片列表
 */

import React from 'react';
import { GalleryPhoto } from '../utils/photoDataUtils';

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
  if (!data) return null;

  return (
    <div
      className="location-panel-backdrop"
      onClick={onClose}
    >
      <div
        className="location-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="location-panel-header">
          <div>
            <h3 className="location-panel-title">{data.title}</h3>
            {data.subtitle && (
              <p className="location-panel-subtitle">{data.subtitle}</p>
            )}
          </div>
          <button
            className="location-panel-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="location-panel-body">
          {data.photos.length === 0 ? (
            <div className="location-panel-empty">
              {data.emptyMessage || '当前没有可用的图库照片'}
            </div>
          ) : (
            <div className="location-panel-grid">
              {data.photos.map((p) => (
                <img
                  key={p.id}
                  src={p.thumbnail || p.image}
                  alt={p.title}
                  loading="lazy"
                  onClick={() => {
                    onPhotoClick(p);
                    onClose();
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
