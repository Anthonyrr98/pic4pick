import './URLBridge';
import { buildCityPhotoMap, buildCurationGroups, buildPhotosByLocation } from '../../packages/shared/photoDataUtils';
import { mapSupabaseRowToGalleryPhoto } from '../../packages/shared/photoMapper';
import { formatPhotoBadge } from '../../packages/shared/photoBadge';
import { getShotTimeInfo, getTimeValue } from '../../packages/shared/timeUtils';
import { getOriginalMediaUrl, getPreviewMediaUrl, getPreviewMediaFallbackUrls } from '../../packages/shared/mediaUrls';

export function catalog(rows: unknown[]) {
  const photos = rows.map(mapSupabaseRowToGalleryPhoto);
  return JSON.stringify({
    summaries: Object.fromEntries(photos.map(photo => [photo.id, { badge: formatPhotoBadge(photo), shot: getShotTimeInfo(photo.shotDate), time: getTimeValue(photo) }])),
    provinces: buildCurationGroups(buildCityPhotoMap(photos)).map(group => ({
      id: group.id, title: group.title, totalCount: group.totalCount,
      cities: group.items.map(city => ({ id: city.id, title: city.label, latitude: city.lat, longitude: city.lng, photoIDs: city.photos.map(photo => photo.id) })),
    })),
    locations: buildPhotosByLocation(photos).map(group => ({ id: group.key, title: group.location || group.country || '未命名地点',
      subtitle: [group.country, group.location].filter(Boolean).join(' · '), latitude: group.lat, longitude: group.lng,
      photoIDs: group.photos.map(photo => photo.id) })),
  });
}
export function details(row: unknown) {
  const photo = mapSupabaseRowToGalleryPhoto(row);
  return JSON.stringify({ badge: formatPhotoBadge(photo), shot: getShotTimeInfo(photo.shotDate), time: getTimeValue(photo) });
}
export function media(row: unknown, detail: boolean) {
  const photo = mapSupabaseRowToGalleryPhoto(row);
  const options = { width: detail ? 2000 : 900, quality: detail ? 92 : 90, preferOriginal: detail };
  return JSON.stringify({ original: getOriginalMediaUrl(photo), candidates: [...new Set([
    getPreviewMediaUrl(photo, options), ...getPreviewMediaFallbackUrls(photo, [options, { width: detail ? 1080 : 720, quality: 88, format: false }]), getOriginalMediaUrl(photo),
  ].filter(Boolean))] });
}
