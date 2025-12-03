/**
 * 位置选择器 Hook
 * 处理地理位置搜索和选择
 */

import { useState, useCallback, useRef } from 'react';
import { getEnvValue } from '../utils/envConfig';
import { getAmapApiUrl } from '../utils/adminUtils';
import { handleError, ErrorType } from '../utils/errorHandler';

export const useLocationPicker = () => {
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const locationMapContainerRef = useRef(null);
  const locationMapInstance = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  /**
   * 搜索位置
   */
  const searchLocation = useCallback(async (query, isEdit = false) => {
    if (!query.trim()) {
      if (isEdit) {
        // setEditSearchResults([]);
      } else {
        setSearchResults([]);
      }
      return;
    }

    if (isEdit) {
      // setIsEditSearching(true);
    } else {
      setIsSearching(true);
    }

    try {
      const amapKey = getEnvValue('VITE_AMAP_KEY', '');
      if (!amapKey) {
        // 未配置高德地图API Key，静默处理
        return;
      }

      const searchUrl = getAmapApiUrl(`/v3/place/text?key=${amapKey}&keywords=${encodeURIComponent(query)}&city=&output=json&offset=10&page=1&extensions=all`);

      const response = await fetch(searchUrl);
      if (!response.ok) {
        throw new Error(`搜索失败: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.status === '1' && data.pois && data.pois.length > 0) {
        const results = data.pois.map((poi) => ({
          name: poi.name,
          address: poi.address || poi.pname + poi.cityname + poi.adname,
          location: poi.location,
          lat: parseFloat(poi.location.split(',')[1]),
          lon: parseFloat(poi.location.split(',')[0]),
        }));

        if (isEdit) {
          // setEditSearchResults(results);
        } else {
          setSearchResults(results);
        }
      } else {
        if (isEdit) {
          // setEditSearchResults([]);
        } else {
          setSearchResults([]);
        }
      }
    } catch (error) {
      handleError(error, {
        context: 'searchLocation',
        type: ErrorType.NETWORK,
        silent: true,
      });
      if (isEdit) {
        // setEditSearchResults([]);
      } else {
        setSearchResults([]);
      }
    } finally {
      if (isEdit) {
        // setIsEditSearching(false);
      } else {
        setIsSearching(false);
      }
    }
  }, []);

  return {
    showLocationPicker,
    setShowLocationPicker,
    locationMapContainerRef,
    locationMapInstance,
    selectedLocation,
    setSelectedLocation,
    locationSearchQuery,
    setLocationSearchQuery,
    isSearching,
    searchResults,
    searchLocation,
  };
};

