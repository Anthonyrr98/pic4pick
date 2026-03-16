/**
 * Lightbox 面板组件 - 显示照片详情和参数
 */

import React, { useState, useEffect } from 'react';
import { GalleryPhoto } from '../utils/photoDataUtils';
import { getShotTimeInfo } from '../utils/timeUtils';
import { decimalToDMS } from '../utils/geoUtils';

export interface GeoInfo {
  place: string;
  latDms: string;
  lonDms: string;
  lat: string;
  lon: string;
  latitude: number;
  longitude: number;
  altitude: string;
  distance: string;
  browserLocation?: { lat: number; lon: number };
}

interface LightboxPanelProps {
  photo: GalleryPhoto | null;
  geoInfo: GeoInfo | null;
  likedPhotoIds: string[];
  onClose: () => void;
  onToggleLike: (photo: GalleryPhoto) => void;
  onOpenMetaPopover: (tab: 'basic' | 'geo', event: React.MouseEvent) => void;
  showMobileMeta: boolean;
  onToggleMobileMeta: () => void;
}

export const LightboxPanel: React.FC<LightboxPanelProps> = ({
  photo,
  geoInfo,
  likedPhotoIds,
  onClose,
  onToggleLike,
  onOpenMetaPopover,
  showMobileMeta,
  onToggleMobileMeta,
}) => {
  if (!photo) return null;

  const liked = likedPhotoIds.includes(photo.id);
  const likeCount = typeof photo.likes === 'number' ? photo.likes : 0;

  return (
    <div
      className="lightbox active"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <button className="lightbox-close" aria-label="关闭" onClick={onClose}>
        &times;
      </button>
      <div
        className="lightbox-panel"
        style={{
          backgroundImage: `url(${photo.image})`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`lightbox-content-wrapper ${showMobileMeta ? 'meta-visible' : ''}`}>
          <div
            className="lightbox-media"
            onClick={() => {
              if (window.innerWidth <= 768) {
                onToggleMobileMeta();
              }
            }}
          >
            <img src={photo.image} alt={photo.title} />
          </div>

          <div className={`lightbox-meta ${showMobileMeta ? 'mobile-visible' : ''}`}>
            <div className="lightbox-title-section">
              <h3>{photo.title}</h3>
              <p className="subtitle">
                {photo.country} · {photo.location}
              </p>
            </div>

            <div
              className="lightbox-params-grid"
              onClick={(e) => {
                if (window.innerWidth <= 768) {
                  e.stopPropagation();
                }
              }}
            >
              <div
                className="lightbox-param-card"
                onClick={(event) => onOpenMetaPopover('basic', event)}
              >
                <span className="param-label">焦距</span>
                <span className="param-value">{photo.focal}</span>
              </div>
              <div
                className="lightbox-param-card"
                onClick={(event) => onOpenMetaPopover('basic', event)}
              >
                <span className="param-label">光圈</span>
                <span className="param-value">{photo.aperture}</span>
              </div>
              <div
                className="lightbox-param-card"
                onClick={(event) => onOpenMetaPopover('basic', event)}
              >
                <span className="param-label">快门</span>
                <span className="param-value">{photo.shutter}</span>
              </div>
              <div
                className="lightbox-param-card"
                onClick={(event) => onOpenMetaPopover('basic', event)}
              >
                <span className="param-label">ISO</span>
                <span className="param-value">{photo.iso}</span>
              </div>
              <div
                className="lightbox-param-card"
                onClick={(event) => onOpenMetaPopover('basic', event)}
              >
                <span className="param-label">相机</span>
                <span className="param-value">{photo.camera}</span>
              </div>
              <div
                className="lightbox-param-card"
                onClick={(event) => onOpenMetaPopover('basic', event)}
              >
                <span className="param-label">镜头</span>
                <span className="param-value">{photo.lens}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
