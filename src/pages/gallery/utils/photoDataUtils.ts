/**
 * 照片数据处理和映射工具
 */

import { getProvinceFromCoords } from './geoUtils';
import { provinceCityData, cityMeta, MUNICIPALITY_PROVINCES } from '../constants/locationData';

export interface GalleryPhoto {
  id: string;
  title: string;
  country: string;
  location: string;
  category: string;
  image: string;
  focal: string;
  aperture: string;
  shutter: string;
  iso: string;
  camera: string;
  lens: string;
  mood: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  tags: string;
  createdAt: string | null;
  thumbnail: string;
  hidden: boolean;
  shotDate: string | null;
  rating: number | null;
  likes: number;
}

export interface LocationGroup {
  key: string;
  lat: number;
  lng: number;
  country: string;
  location: string;
  photos: GalleryPhoto[];
}

export interface CityEntry {
  id: string;
  label: string;
  image: string;
  photoCount: number;
  lat: number | null;
  lng: number | null;
  provinceId: string;
}

export interface CurationGroup {
  id: string;
  title: string;
  items: CityEntry[];
  totalCount: number;
}

const normalizeText = (text = ''): string => text.toLowerCase();

// 从文本中提取省、市、县名
export const extractLocationParts = (location: string, country: string) => {
  if (!location && !country) return { province: null, city: null, county: null };

  const text = `${country || ''}${location || ''}`;
  const provinces = provinceCityData.map(p => p.title);

  let province = null;
  let city = null;
  let county = null;

  // 优先从 country 字段查找省份
  if (country) {
    for (const p of provinces) {
      const provinceRegex = new RegExp(`^${p}|${p}$|\\s${p}\\s|${p}省|${p}市|${p}自治区|${p}特别行政区`);
      if (provinceRegex.test(country)) {
        province = provinceCityData.find(pr => pr.title === p);
        break;
      }
    }
  }

  // 如果 country 中没有找到省份，再从 location 中查找
  if (!province && location) {
    for (const p of provinces) {
      const provinceRegex = new RegExp(`^${p}|${p}$|\\s${p}\\s|${p}省|${p}市|${p}自治区|${p}特别行政区`);
      if (provinceRegex.test(location)) {
        province = provinceCityData.find(pr => pr.title === p);
        break;
      }
    }
  }

  // 提取县名
  const countyMatch = text.match(/([\u4e00-\u9fa5]+(?:县|区|市|镇|乡))/);
  if (countyMatch) {
    county = countyMatch[1];
  }

  // 如果没有找到县，尝试提取市名
  if (!county) {
    const cityMatch = text.match(/([\u4e00-\u9fa5]+(?:市|州))/);
    if (cityMatch) {
      city = cityMatch[1];
    }
  }

  return { province, city, county };
};

// 构建城市-照片映射
export const buildCityPhotoMap = (photos: GalleryPhoto[]): Map<string, any> => {
  const map = new Map();
  if (!photos || photos.length === 0) return map;

  photos.forEach((photo) => {
    let province = null;
    let cityName = null;

    // 1) 优先使用文本解析
    const parts = extractLocationParts(photo.location, photo.country);
    if (parts.province) {
      province = {
        id: parts.province.id || parts.province.title,
        title: parts.province.title,
      };
    }
    cityName =
      parts.county ||
      parts.city ||
      photo.location ||
      photo.country ||
      '未知地点';

    // 2) 如果文字里完全看不出省份，再尝试用经纬度推断
    if (!province && photo.latitude != null && photo.longitude != null) {
      const lat = Number(photo.latitude);
      const lng = Number(photo.longitude);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        province = getProvinceFromCoords(lat, lng);
        if (!cityName) {
          cityName = photo.location || photo.country || '未知地点';
        }
      }
    }

    // 3) 如果还是找不到，尝试匹配预定义的城市列表
    if (!province) {
      const location = normalizeText(photo.location);
      const country = normalizeText(photo.country);

      const provincePriority: Record<string, number> = {
        'beijing': 1, 'tianjin': 1, 'shanghai': 1, 'chongqing': 1,
        'hongkong': 1, 'macao': 1, 'taiwan': 1, 'hainan': 1, 'ningxia': 1,
        'jiangxi': 2, 'zhejiang': 2, 'fujian': 2, 'anhui': 2, 'jiangsu': 2,
        'henan': 2, 'shandong': 2, 'hubei': 2, 'hunan': 2, 'guangdong': 2,
        'guangxi': 2, 'guizhou': 2, 'shaanxi': 2, 'jilin': 2, 'hebei': 2,
        'shanxi': 2, 'heilongjiang': 2, 'sichuan': 2, 'yunnan': 2,
        'qinghai': 3, 'liaoning': 3, 'gansu': 4, 'xizang': 4, 'xinjiang': 4,
        'neimenggu': 5,
      };

      const sortedProvinces = [...provinceCityData].sort((a, b) => {
        const priorityA = provincePriority[a.id] || 99;
        const priorityB = provincePriority[b.id] || 99;
        return priorityA - priorityB;
      });

      for (const p of sortedProvinces) {
        const targets = [...p.cities];
        if (MUNICIPALITY_PROVINCES.has(p.id)) {
          targets.push(p.title);
        }

        for (const city of targets) {
          const cityLower = normalizeText(city);
          if (location === cityLower || location.includes(cityLower) ||
              country === cityLower || country.includes(cityLower)) {
            province = { id: p.id, title: p.title };
            cityName = city;
            break;
          }
        }
        if (province) break;
      }
    }

    // 4) 确定省份后，归入对应的「省份-城市」桶
    if (province && cityName) {
      const provinceId = province.id || province.title || 'unknown';
      const provinceTitle = province.title || province.id || '未知地区';
      const key = `${provinceId}-${cityName}`;

      if (!map.has(key)) {
        map.set(key, {
          provinceId,
          provinceTitle,
          cityName,
          photos: [],
        });
      }

      map.get(key).photos.push(photo);
    }
  });

  // 每个城市内部按时间从新到旧排序
  map.forEach((group) => {
    group.photos.sort((a: GalleryPhoto, b: GalleryPhoto) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });
  });

  return map;
};

// 构建精选分组
export const buildCurationGroups = (cityPhotoMap: Map<string, any>): CurationGroup[] => {
  const provinceMap = new Map();

  cityPhotoMap.forEach((group) => {
    const { provinceId, provinceTitle, cityName, photos } = group;
    if (!provinceId || !provinceTitle || !cityName || !photos || photos.length === 0) return;

    if (!provinceMap.has(provinceId)) {
      provinceMap.set(provinceId, {
        id: provinceId,
        title: provinceTitle,
        cities: new Map(),
      });
    }

    const provinceData = provinceMap.get(provinceId);
    if (!provinceData.cities.has(cityName)) {
      let coords = cityMeta[cityName] || {};
      if (
        !coords.lat &&
        photos.length > 0 &&
        photos[0].latitude != null &&
        photos[0].longitude != null
      ) {
        coords = {
          lat: Number(photos[0].latitude),
          lng: Number(photos[0].longitude),
        };
      }

      provinceData.cities.set(cityName, {
        id: `${provinceId}-${cityName}`,
        label: cityName,
        image: photos[0].thumbnail || photos[0].image,
        photoCount: photos.length,
        lat: coords.lat ?? null,
        lng: coords.lng ?? null,
        provinceId,
      });
    } else {
      const cityEntry = provinceData.cities.get(cityName);
      cityEntry.photoCount += photos.length;
    }
  });

  const groups = Array.from(provinceMap.values()).map((provinceData) => {
    const items = Array.from(provinceData.cities.values()).sort(
      (a: CityEntry, b: CityEntry) => b.photoCount - a.photoCount,
    );

    const totalCount = items.reduce((sum, item) => sum + item.photoCount, 0);

    return {
      id: provinceData.id,
      title: provinceData.title,
      items,
      totalCount,
    };
  });

  groups.sort((a, b) => {
    if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
    return a.title.localeCompare(b.title, 'zh-Hans-CN');
  });

  return groups;
};

// 构建按地点聚合的照片列表
export const buildPhotosByLocation = (photos: GalleryPhoto[]): LocationGroup[] => {
  if (!photos || photos.length === 0) return [];

  const groups = new Map<string, LocationGroup>();

  photos.forEach((p) => {
    if (p.latitude == null || p.longitude == null) return;
    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        lat,
        lng,
        country: p.country || '',
        location: p.location || '',
        photos: [],
      });
    }
    groups.get(key)!.photos.push(p);
  });

  const result = Array.from(groups.values());
  result.forEach((g) => {
    g.photos.sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });
  });

  return result;
};
