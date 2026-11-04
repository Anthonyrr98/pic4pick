import { useEffect, useRef } from 'react';
import { PhotoLocationMap } from './PhotoLocationMap';
import { useAnimatedPresence } from '../../../hooks/useAnimatedPresence';
import './PhotoDetailsSheet.css';

function DetailIcon({ kind }) {
  return (
    <svg className="photo-detail-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === 'aperture' && <>
        <circle cx="24" cy="24" r="20" />
        <path d="M28.62 16 40.1 35.88M19.38 16h22.96M14.76 24 26.24 4.12M19.38 32 7.9 12.12M28.62 32H5.66M33.24 24 21.76 43.88" />
      </>}
      {kind === 'shutter' && <>
        <path d="M31 7a19 19 0 1 1-19 2M24 14v11l-9-8" />
        <circle cx="24" cy="5" r="1.4" fill="currentColor" stroke="none" />
      </>}
      {kind === 'focal' && <>
        <path d="M17 6H6v11m25-11h11v11M6 31v11h11m25-11v11H31M14 24h20m-10-10v20" />
      </>}
      {kind === 'iso' && <>
        <rect x="6" y="6" width="36" height="36" rx="5" />
        <path d="m8 40 32-32M13 17h10m-5-5v10m8 12h10" />
      </>}
    </svg>
  );
}

function DetailCard({ label, value, sub, icon, artwork, children, className = '' }) {
  return (
    <article className={`photo-detail-card ${className}`}>
      <h3>{label}</h3>
      {value && <p className="photo-detail-value">{value}</p>}
      {children}
      {sub && <p className="photo-detail-sub">{sub}</p>}
      {icon && <DetailIcon kind={icon} />}
      {artwork && <img className="photo-detail-artwork" src={artwork} alt="" decoding="async" />}
    </article>
  );
}

export function PhotoDetailsSheet({ open = true, photo, geoInfo, address, shotInfo, filmStock, isFilm, cameraArtwork, filmStockArtwork, locationStatus, onRequestLocation, onClose }) {
  const backdropRef = useRef(null);
  const sheetRef = useRef(null);
  const closeRef = useRef(null);
  const present = useAnimatedPresence(open, backdropRef, { panelSelector: '.photo-details-sheet' });
  const rating = Math.round(Math.max(1, Math.min(10, Number(photo.rating) || 7)));
  const place = geoInfo?.place || [photo.country, photo.location].filter(Boolean).join(' · ') || '未记录拍摄地点';
  const category = { latest: '最新', random: '随览', nearby: '附近', far: '远方', film: '胶片' }[photo.category] || '未分类';

  useEffect(() => {
    if (!present) return;
    const returnFocus = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [present]);

  const handleKeyDown = (event) => {
    if (event.key !== 'Tab') return;
    // Keep the nested sheet's keyboard navigation inside its own controls.
    event.stopPropagation();
    const controls = Array.from(sheetRef.current.querySelectorAll(
      'button:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])'
    )).filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  if (!present) return null;

  return (
    <div ref={backdropRef} className="photo-details-backdrop" data-state={open ? 'open' : 'closing'}
      onClick={event => { event.stopPropagation(); onClose(); }}>
      <aside ref={sheetRef} className="photo-details-sheet" role="dialog" aria-modal="true" aria-labelledby="photo-details-heading"
        onClick={event => event.stopPropagation()} onKeyDown={handleKeyDown}>
        <header className="photo-details-header">
          <h2 id="photo-details-heading">照片详情<span>{photo.title}</span></h2>
          <button ref={closeRef} className="photo-details-close" type="button" aria-label="收起照片详情" onClick={onClose}>
            <svg viewBox="0 0 32 16" fill="none" aria-hidden="true"><path d="m5 4 11 6L27 4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </header>
        <div className="photo-details-scroll">
          <div className="photo-details-intro">
            <h3>{photo.title || '未命名照片'}</h3>
            <p>{[photo.country, photo.location].filter(Boolean).join(' · ')}</p>
          </div>
          <div className={`photo-details-map-card${geoInfo ? '' : ' photo-details-map-card--empty'}`}>
            {geoInfo && <PhotoLocationMap geoInfo={geoInfo} title={photo.title} thumbnail={photo.thumbnail || photo.image} compact />}
            <p className="photo-details-place" aria-live="polite" aria-busy={address.loading}>{place}</p>
            {!geoInfo && <p className="photo-details-no-location">这张照片没有记录坐标</p>}
          </div>
          {geoInfo?.fullAddress && geoInfo.fullAddress !== place && (
            <details className="photo-details-address"><summary>查看完整地址</summary><p>{geoInfo.fullAddress}</p></details>
          )}
          <div className="photo-details-grid">
            {geoInfo && <>
              <DetailCard label="纬度" value={geoInfo.latDms} sub={geoInfo.lat} className="photo-detail-card--coordinate" />
              <DetailCard label="经度" value={geoInfo.lonDms} sub={geoInfo.lon} className="photo-detail-card--coordinate" />
              <DetailCard label="海拔高度" value={geoInfo.altitude} />
              <DetailCard label="距离" value={geoInfo.browserLocation ? geoInfo.distance : null} sub={geoInfo.browserLocation ? '距你当前的位置' : null}>
                {!geoInfo.browserLocation && <>
                  <p className="photo-detail-location-copy" role="status">{locationStatus === 'denied' ? '定位未获允许，请在浏览器设置中开启后重试' : locationStatus === 'error' ? '暂时无法获取位置，请重试' : locationStatus === 'unsupported' ? '当前浏览器不支持定位' : '显示拍摄地点与你的距离'}</p>
                  <button className="photo-detail-locate" type="button" disabled={locationStatus === 'loading' || locationStatus === 'unsupported'} onClick={onRequestLocation}>
                    {locationStatus === 'loading' ? '正在定位…' : locationStatus === 'denied' || locationStatus === 'error' ? '重新定位' : '开启定位权限'}
                  </button>
                </>}
              </DetailCard>
            </>}
            <DetailCard label="评级">
              <div className="photo-detail-rating" role="img" aria-label={`评级 ${rating}，满分 10`}>
                <strong>{rating}</strong>
                {Array.from({ length: 10 }, (_, index) => {
                  const angle = index * Math.PI / 5 - Math.PI / 2;
                  return <span key={index} className={index < rating ? 'is-filled' : ''} aria-hidden="true"
                    style={{ left: `${50 + Math.cos(angle) * 42}%`, top: `${50 + Math.sin(angle) * 42}%` }}>★</span>;
                })}
              </div>
            </DetailCard>
            <DetailCard label="拍摄于" value={shotInfo.yearsAgoText} sub={shotInfo.dateText} />
            {!isFilm && <>
              <DetailCard label="光圈" value={photo.aperture || '未记录'} icon="aperture" />
              <DetailCard label="快门" value={photo.shutter || '未记录'} icon="shutter" />
              <DetailCard label="焦距" value={photo.focal || '未记录'} icon="focal" />
              <DetailCard label="感光度" value={photo.iso || '未记录'} icon="iso" />
            </>}
            <DetailCard label="相机" value={photo.camera || '未记录'} artwork={cameraArtwork} className="photo-detail-card--equipment" />
            <DetailCard label="镜头" value={photo.lens || '未记录'} className="photo-detail-card--equipment" />
            <DetailCard label="分类" value={category} sub={String(photo.mood || '').trim() || undefined} />
            {!isFilm && <DetailCard label="喜欢" value={String(typeof photo.likes === 'number' ? photo.likes : 0)} sub="次" />}
            {isFilm && <DetailCard label="胶卷类型" value={filmStock || '未记录'} artwork={filmStockArtwork} className="photo-detail-card--equipment" />}
          </div>
        </div>
      </aside>
    </div>
  );
}
