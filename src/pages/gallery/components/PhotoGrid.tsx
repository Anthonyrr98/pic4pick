/**
 * 照片网格组件 - 显示照片卡片列表
 */

import React, { memo, useRef, useState } from 'react';
import { GalleryPhoto } from '../utils/photoDataUtils';
import { handleError, ErrorType } from '../../../utils/errorHandler';
import { getPreviewMediaFallbackUrls, getPreviewMediaSrcSet, getPreviewMediaUrl } from '../../../utils/urlUtils';
import { FilmFrame } from './FilmFrame';
import { advanceImageFallback } from '../../../utils/imageFallback';
import { usePhotoCardMotion } from '../../../hooks/usePhotoCardMotion';
import { usePhotoGridEntry } from '../../../hooks/useGalleryEntryMotion';

// Keep enough source pixels for high-DPI displays; 360px previews looked soft after cover cropping.
const GRID_IMAGE_WIDTHS = [540, 720, 900, 1200, 1440];
const GRID_IMAGE_SIZES =
  [
    '(max-width: 768px) calc((100vw - 40px) / 2)',
    '(max-width: 920px) calc((100vw - 10vw - 24px) / 2)',
    '(max-width: 1236px) calc((100vw - 10vw - 48px) / 3)',
    '(max-width: 1584px) calc((100vw - 216px) / 4)',
    'calc((100vw - 240px) / 5)',
  ].join(', ');
const GRID_IMAGE_FALLBACKS = [
  { width: 900, quality: 90 },
  { width: 720, quality: 88, format: false },
];

interface PhotoGridProps {
  photos: GalleryPhoto[];
  likedPhotoIds: string[];
  onPhotoClick: (photo: GalleryPhoto) => void;
  onToggleLike: (photo: GalleryPhoto) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  loadMoreRef: React.RefObject<HTMLDivElement>;
  totalCount: number;
  filmFrames?: boolean;
  isActive?: boolean;
}

interface PhotoCardProps {
  item: GalleryPhoto;
  index: number;
  liked: boolean;
  eager: boolean;
  filmFrames: boolean;
  onPhotoClick: PhotoGridProps['onPhotoClick'];
  onToggleLike: PhotoGridProps['onToggleLike'];
}

// Image loading updates only this card, not every previously loaded photograph.
const PhotoCard = memo(function PhotoCard({
  item, index, liked, eager, filmFrames, onPhotoClick, onToggleLike,
}: PhotoCardProps) {
  const [isImageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [photoAspect, setPhotoAspect] = useState(2 / 3);
  const categoryLabels: Record<string, string> = {
    latest: '最新',
    random: '随览',
    nearby: '附近',
    far: '远方',
    film: '胶片',
  };

  const formatBadgeText = (photo: GalleryPhoto) => {
    const mood = String(photo.mood || '').trim();
    const categoryLabel = categoryLabels[String(photo.category || '').trim()] || '';

    if (mood.toLowerCase().startsWith('film_stock:')) {
      const filmStock = mood.slice('film_stock:'.length).trim();
      return filmStock || categoryLabel || '胶片';
    }

    if (mood && mood !== '未分类' && mood !== '原创作品') return mood;
    return categoryLabel || '未分类';
  };

  const filmStockLabel = (photo: GalleryPhoto) => {
    if (photo.filmStock?.trim()) return photo.filmStock.trim();
    const tag = String(photo.tags || '').split(',').map(tag => tag.trim())
      .find(tag => tag.toLowerCase().startsWith('film_stock:'));
    if (tag) return tag.slice('film_stock:'.length).trim() || '胶片';
    return photo.category === 'film' ? formatBadgeText(photo) : '胶片';
  };

  const likeCount = typeof item.likes === 'number' ? item.likes : 0;
  const imageSrc = getPreviewMediaUrl(item, { width: 1200, quality: 92 });
  const imageSrcSet = getPreviewMediaSrcSet(item, GRID_IMAGE_WIDTHS, { quality: 92 });
  const imageFallbackUrls = getPreviewMediaFallbackUrls(item, GRID_IMAGE_FALLBACKS);
  return (
    <article
      className={`photo-card${filmFrames ? ' has-film-negative' : ''}`}
      data-photo-id={item.id}
      onClick={() => onPhotoClick(item)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPhotoClick(item);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`查看作品：${item.title || '未命名照片'}`}
      style={{ ['--stagger' as any]: index }}
    >
      <FilmFrame enabled={filmFrames} aspectRatio={photoAspect} filmStock={filmStockLabel(item)}>
      {item.image ? (
        <>
          <div
            className={`photo-skeleton ${isImageLoaded ? 'loaded' : ''}`}
            aria-hidden="true"
          />
          {imageFailed ? (
            <div className="photo-load-failed" aria-label="图片加载失败">
              图片暂不可用
            </div>
          ) : (
            <img
              className={isImageLoaded ? 'loaded' : ''}
              src={imageSrc}
              srcSet={imageSrcSet || undefined}
              sizes={imageSrcSet ? GRID_IMAGE_SIZES : undefined}
              alt={item.title}
              loading={eager ? 'eager' : 'lazy'}
              fetchPriority={index === 0 ? 'high' : 'auto'}
              referrerPolicy="no-referrer"
              decoding="async"
              onLoad={(e) => {
                delete e.currentTarget.dataset.previewFallbackIndex;
                if (filmFrames && e.currentTarget.naturalHeight > 0) {
                  const ratio = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight;
                  setPhotoAspect(ratio);
                }
                setImageLoaded(true);
              }}
              onError={(e) => {
                if (advanceImageFallback(e.currentTarget, imageFallbackUrls)) return;

                handleError(new Error(`图片加载失败: ${item.title}`), {
                  context: 'PhotoGrid.imageLoad',
                  type: ErrorType.NETWORK,
                  silent: true,
                });
                setImageLoaded(true);
                setImageFailed(true);
              }}
            />
          )}
        </>
      ) : (
        <div
          style={{
            width: '100%',
            height: '200px',
            background: 'var(--panel)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
          }}
        >
          图片加载中...
        </div>
      )}
      </FilmFrame>
      {!filmFrames && <>
      <span className="badge">{formatBadgeText(item)}</span>
      <div className="caption">
        <h4>{item.title}</h4>
        <span className="photo-location">
          {item.country || ''} {item.country && item.location ? '·' : ''} {item.location || ''}
        </span>
        <div className="film-print-meta">
          <span className="film-print-stock">{filmStockLabel(item)}</span>
          <span className="film-print-number" aria-label={`第 ${index + 1} 张`}>{String(index + 1).padStart(2, '0')}</span>
        </div>
        <button
          type="button"
          className={`like-badge ${liked ? 'liked' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLike(item);
          }}
          aria-label={liked ? '取消点赞' : '点赞'}
        >
          <span className="like-badge-heart" aria-hidden="true">
            <svg viewBox="0 0 1024 1024" width="14" height="14">
              <path
                d="M667.786667 117.333333C832.864 117.333333 938.666667 249.706667 938.666667 427.861333c0 138.250667-125.098667 290.506667-371.573334 461.589334a96.768 96.768 0 0 1-110.186666 0C210.432 718.368 85.333333 566.112 85.333333 427.861333 85.333333 249.706667 191.136 117.333333 356.213333 117.333333c59.616 0 100.053333 20.832 155.786667 68.096C567.744 138.176 608.170667 117.333333 667.786667 117.333333z m0 63.146667c-41.44 0-70.261333 15.189333-116.96 55.04-2.165333 1.845333-14.4 12.373333-17.941334 15.381333a32.32 32.32 0 0 1-41.770666 0c-3.541333-3.018667-15.776-13.536-17.941334-15.381333-46.698667-39.850667-75.52-55.04-116.96-55.04C230.186667 180.48 149.333333 281.258667 149.333333 426.698667 149.333333 537.6 262.858667 675.242667 493.632 834.826667a32.352 32.352 0 0 0 36.736 0C761.141333 675.253333 874.666667 537.6 874.666667 426.698667c0-145.44-80.853333-246.218667-206.88-246.218667z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className="like-badge-count">{likeCount}</span>
        </button>
      </div>
      </>}
    </article>
  );
});

export const PhotoGrid: React.FC<PhotoGridProps> = ({
  photos, likedPhotoIds, onPhotoClick, onToggleLike, hasMore, isLoadingMore,
  onLoadMore, loadMoreRef, totalCount, filmFrames = false, isActive = true,
}) => {
  const gridRef = useRef<HTMLDivElement>(null);
  usePhotoCardMotion(gridRef, isActive, filmFrames);
  usePhotoGridEntry(gridRef, isActive, photos);
  const eagerImageCount = typeof window !== 'undefined' && window.innerWidth <= 768 ? 4 : 6;
  const likedIds = new Set(likedPhotoIds);

  return (
    <div className="gallery-grid" ref={gridRef}>
      {photos.map((item, index) => (
        <PhotoCard
          key={`${item.id}:${item.image}:${item.thumbnail || ''}:${item.preview || ''}`}
          item={item}
          index={index}
          liked={likedIds.has(item.id)}
          eager={index < eagerImageCount}
          filmFrames={filmFrames}
          onPhotoClick={onPhotoClick}
          onToggleLike={onToggleLike}
        />
      ))}
      {/* 无限滚动触发器 */}
      {hasMore && (
        <div
          ref={loadMoreRef}
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            justifyContent: 'center',
            padding: '40px 20px',
            minHeight: '100px',
          }}
        >
          {isLoadingMore ? (
            <div
              style={{
                color: 'var(--muted)',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  border: '2px solid var(--muted)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              ></span>
              加载更多照片...
            </div>
          ) : (
            <button
              onClick={onLoadMore}
              className="load-more-btn pressable"
            >
              加载更多 ({totalCount - photos.length} 张)
            </button>
          )}
        </div>
      )}
      {/* 显示已加载所有照片的提示 */}
      {!hasMore && photos.length > 0 && (
        <div
          style={{
            gridColumn: '1 / -1',
            textAlign: 'center',
            color: 'var(--muted)',
            padding: '40px 20px',
            fontSize: '0.9rem',
          }}
        >
          已显示全部 {totalCount} 张照片
        </div>
      )}
    </div>
  );
};
