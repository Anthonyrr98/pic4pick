/**
 * 照片网格组件 - 显示照片卡片列表
 */

import React from 'react';
import { GalleryPhoto } from '../utils/photoDataUtils';
import { handleError, ErrorType } from '../../../utils/errorHandler';

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
}

export const PhotoGrid: React.FC<PhotoGridProps> = ({
  photos,
  likedPhotoIds,
  onPhotoClick,
  onToggleLike,
  hasMore,
  isLoadingMore,
  onLoadMore,
  loadMoreRef,
  totalCount,
}) => {
  return (
    <div className="gallery-grid">
      {photos.map((item) => {
        const liked = likedPhotoIds.includes(item.id);
        const likeCount = typeof item.likes === 'number' ? item.likes : 0;
        return (
          <article
            key={item.id}
            className="photo-card"
            onClick={() => onPhotoClick(item)}
          >
            {item.image ? (
              <img
                src={item.thumbnail || item.image}
                alt={item.title}
                loading="lazy"
                onError={(e) => {
                  handleError(new Error(`图片加载失败: ${item.title}`), {
                    context: 'PhotoGrid.imageLoad',
                    type: ErrorType.NETWORK,
                    silent: true,
                  });
                  e.currentTarget.style.display = 'none';
                }}
              />
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
            <span className="badge">{item.mood || '未分类'}</span>
            <div className="caption">
              <h4>{item.title}</h4>
              <span>
                {item.country || ''} {item.country && item.location ? '·' : ''} {item.location || ''}
              </span>
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
          </article>
        );
      })}
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
              style={{
                padding: '12px 32px',
                border: 'none',
                borderRadius: '24px',
                background: 'var(--panel-dark)',
                color: '#fff',
                fontSize: '0.95rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: 'var(--shadow-soft)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
              }}
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
