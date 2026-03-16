/**
 * 照片排序和筛选逻辑
 */

import { GalleryPhoto } from './photoDataUtils';
import { getTimeValue } from './timeUtils';

export type FilterType = 'latest' | 'featured' | 'random' | 'nearby' | 'far';

export interface BrowserLocation {
  lat: number;
  lon: number;
}

// 按最新排序
const sortByLatest = (list: GalleryPhoto[]): GalleryPhoto[] =>
  [...list].sort((a, b) => getTimeValue(b) - getTimeValue(a));

// 按精选排序（星级从高到低，相同星级按时间从新到旧）
const sortByFeatured = (list: GalleryPhoto[]): GalleryPhoto[] =>
  [...list].sort((a, b) => {
    const aRating = typeof a.rating === 'number' ? a.rating : 0;
    const bRating = typeof b.rating === 'number' ? b.rating : 0;
    if (bRating !== aRating) return bRating - aRating;
    return getTimeValue(b) - getTimeValue(a);
  });

// 随机排序
const sortByRandom = (list: GalleryPhoto[]): GalleryPhoto[] => {
  const shuffled = [...list];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// 添加距离信息
const withDistance = (
  list: GalleryPhoto[],
  browserLocation: BrowserLocation | null,
  calculateDistance: (lat1: number, lon1: number, lat2: number, lon2: number) => number
): Array<GalleryPhoto & { _distance: number }> => {
  if (!browserLocation) return [];
  return list
    .filter((p) => p.latitude != null && p.longitude != null)
    .map((p) => ({
      ...p,
      _distance: calculateDistance(
        browserLocation.lat,
        browserLocation.lon,
        p.latitude!,
        p.longitude!
      ),
    }));
};

// 按附近排序（从近到远）
const sortByNearby = (
  list: GalleryPhoto[],
  browserLocation: BrowserLocation | null,
  calculateDistance: (lat1: number, lon1: number, lat2: number, lon2: number) => number
): GalleryPhoto[] => {
  const withDist = withDistance(list, browserLocation, calculateDistance);
  if (withDist.length === 0) return sortByLatest(list);
  return withDist.sort((a, b) => a._distance - b._distance);
};

// 按远方排序（从远到近）
const sortByFar = (
  list: GalleryPhoto[],
  browserLocation: BrowserLocation | null,
  calculateDistance: (lat1: number, lon1: number, lat2: number, lon2: number) => number
): GalleryPhoto[] => {
  const withDist = withDistance(list, browserLocation, calculateDistance);
  if (withDist.length === 0) return sortByLatest(list);
  return withDist.sort((a, b) => b._distance - a._distance);
};

// 主筛选函数
export const filterAndSortPhotos = (
  allPhotos: GalleryPhoto[],
  filterType: FilterType,
  browserLocation: BrowserLocation | null,
  calculateDistance: (lat1: number, lon1: number, lat2: number, lon2: number) => number
): GalleryPhoto[] => {
  if (!allPhotos || allPhotos.length === 0) return [];

  switch (filterType) {
    case 'featured':
      return sortByFeatured(allPhotos);
    case 'latest':
      return sortByLatest(allPhotos);
    case 'random':
      return sortByRandom(allPhotos);
    case 'nearby':
      return sortByNearby(allPhotos, browserLocation, calculateDistance);
    case 'far':
      return sortByFar(allPhotos, browserLocation, calculateDistance);
    default:
      return sortByLatest(allPhotos);
  }
};
