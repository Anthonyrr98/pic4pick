/**
 * 地理位置相关工具函数
 */

// 将十进制度数转换为度分秒格式
export const decimalToDMS = (decimal: number, isLatitude: boolean): string => {
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60);

  const direction = isLatitude ? (decimal >= 0 ? 'N' : 'S') : decimal >= 0 ? 'E' : 'W';

  return `${degrees}°${minutes.toString().padStart(2, '0')}′${direction}`;
};

// 计算两点之间的距离（公里）
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // 地球半径（公里）
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

// 根据经纬度判断省份
export const getProvinceFromCoords = (lat: number, lng: number): { id: string; title: string } | null => {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;

  const provinceRanges = [
    { id: 'beijing', title: '北京', latRange: [39.4, 40.2], lngRange: [116.0, 116.8], priority: 1 },
    { id: 'tianjin', title: '天津', latRange: [38.5, 40.0], lngRange: [116.7, 118.0], priority: 1 },
    { id: 'shanghai', title: '上海', latRange: [30.7, 31.9], lngRange: [120.8, 122.0], priority: 1 },
    { id: 'chongqing', title: '重庆', latRange: [28.1, 32.2], lngRange: [105.2, 110.2], priority: 1 },
    { id: 'hongkong', title: '香港', latRange: [22.1, 22.6], lngRange: [113.8, 114.5], priority: 1 },
    { id: 'macao', title: '澳门', latRange: [22.1, 22.2], lngRange: [113.5, 113.6], priority: 1 },
    { id: 'taiwan', title: '台湾', latRange: [21.9, 25.3], lngRange: [119.3, 122.0], priority: 1 },
    { id: 'hainan', title: '海南', latRange: [18.1, 20.1], lngRange: [108.6, 111.0], priority: 1 },
    { id: 'ningxia', title: '宁夏', latRange: [35.2, 39.4], lngRange: [104.2, 107.6], priority: 1 },
    { id: 'jiangxi', title: '江西', latRange: [24.3, 30.0], lngRange: [113.5, 118.5], priority: 2 },
    { id: 'zhejiang', title: '浙江', latRange: [27.0, 31.5], lngRange: [118.0, 123.0], priority: 2 },
    { id: 'fujian', title: '福建', latRange: [23.5, 28.3], lngRange: [115.8, 120.7], priority: 2 },
    { id: 'anhui', title: '安徽', latRange: [29.4, 34.7], lngRange: [114.9, 119.8], priority: 2 },
    { id: 'jiangsu', title: '江苏', latRange: [30.7, 35.1], lngRange: [116.2, 121.9], priority: 2 },
    { id: 'henan', title: '河南', latRange: [31.2, 36.5], lngRange: [110.3, 116.6], priority: 2 },
    { id: 'shandong', title: '山东', latRange: [34.4, 38.4], lngRange: [115.0, 122.7], priority: 2 },
    { id: 'hubei', title: '湖北', latRange: [29.0, 33.3], lngRange: [108.2, 116.1], priority: 2 },
    { id: 'hunan', title: '湖南', latRange: [24.6, 30.1], lngRange: [108.8, 114.3], priority: 2 },
    { id: 'guangdong', title: '广东', latRange: [20.1, 25.5], lngRange: [109.6, 117.3], priority: 2 },
    { id: 'guangxi', title: '广西', latRange: [20.9, 26.4], lngRange: [104.3, 112.0], priority: 2 },
    { id: 'guizhou', title: '贵州', latRange: [24.6, 29.2], lngRange: [103.6, 109.3], priority: 2 },
    { id: 'shaanxi', title: '陕西', latRange: [31.4, 39.6], lngRange: [105.5, 111.3], priority: 2 },
    { id: 'jilin', title: '吉林', latRange: [40.8, 46.3], lngRange: [121.3, 131.2], priority: 2 },
    { id: 'hebei', title: '河北', latRange: [36.0, 42.6], lngRange: [113.4, 120.0], priority: 2 },
    { id: 'shanxi', title: '山西', latRange: [34.5, 40.7], lngRange: [110.2, 114.5], priority: 2 },
    { id: 'liaoning', title: '辽宁', latRange: [38.7, 43.4], lngRange: [119.0, 125.5], priority: 3 },
    { id: 'heilongjiang', title: '黑龙江', latRange: [43.4, 53.6], lngRange: [121.1, 135.1], priority: 3 },
    { id: 'sichuan', title: '四川', latRange: [26.0, 34.3], lngRange: [100.8, 108.5], priority: 3 },
    { id: 'yunnan', title: '云南', latRange: [21.1, 29.2], lngRange: [97.5, 106.2], priority: 3 },
    { id: 'qinghai', title: '青海', latRange: [31.6, 39.2], lngRange: [89.4, 103.0], priority: 4 },
    { id: 'gansu', title: '甘肃', latRange: [32.1, 42.8], lngRange: [92.3, 108.7], priority: 4 },
    { id: 'xizang', title: '西藏', latRange: [26.9, 36.5], lngRange: [78.4, 99.1], priority: 4 },
    { id: 'xinjiang', title: '新疆', latRange: [34.3, 49.2], lngRange: [73.5, 96.4], priority: 4 },
    { id: 'neimenggu', title: '内蒙古', latRange: [37.4, 53.3], lngRange: [97.2, 126.0], priority: 5 },
  ];

  const sortedProvinces = [...provinceRanges].sort((a, b) => a.priority - b.priority);

  for (const province of sortedProvinces) {
    if (
      lat >= province.latRange[0] && lat <= province.latRange[1] &&
      lng >= province.lngRange[0] && lng <= province.lngRange[1]
    ) {
      return { id: province.id, title: province.title };
    }
  }
  return null;
};
