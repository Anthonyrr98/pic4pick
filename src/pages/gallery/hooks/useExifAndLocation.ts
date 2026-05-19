/**
 * EXIF 数据读取和浏览器位置获取 Hooks
 */

import { useEffect, useState } from 'react';
import exifr from 'exifr';
import { GalleryPhoto } from '../utils/photoDataUtils';

export interface ExifData {
  latitude: number;
  longitude: number;
  GPSAltitude?: number;
}

export interface BrowserLocation {
  lat: number;
  lon: number;
}

// 通过经纬度获取海拔（免费 API：Open-Meteo Elevation）
export const useAltitudeFromCoords = (lat?: number | null, lon?: number | null) => {
  const [altitude, setAltitude] = useState<number | null>(null);

  useEffect(() => {
    if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) {
      setAltitude(null);
      return;
    }

    const controller = new AbortController();

    const loadAltitude = async () => {
      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/elevation?latitude=${encodeURIComponent(
            String(lat)
          )}&longitude=${encodeURIComponent(String(lon))}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(`elevation-api-${response.status}`);
        }
        const data = await response.json();
        const value = Array.isArray(data?.elevation) ? data.elevation[0] : data?.elevation;
        setAltitude(typeof value === 'number' && Number.isFinite(value) ? value : null);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setAltitude(null);
      }
    };

    loadAltitude();
    return () => controller.abort();
  }, [lat, lon]);

  return altitude;
};

// 从图片读取 EXIF 数据
export const useExifData = (photo: GalleryPhoto | null) => {
  const [exifData, setExifData] = useState<ExifData | null>(null);

  useEffect(() => {
    if (!photo?.image) {
      setExifData(null);
      return;
    }

    const loadExif = async () => {
      try {
        const exif = await exifr.parse(photo.image, {
          gps: true,
          translateKeys: false,
        });
        if (exif?.GPSLatitude && exif?.GPSLongitude) {
          setExifData({
            latitude: exif.GPSLatitude,
            longitude: exif.GPSLongitude,
            GPSAltitude: exif.GPSAltitude,
          });
        } else {
          setExifData(null);
        }
      } catch (error) {
        console.log('无法读取EXIF数据，使用照片数据中的地理位置');
        setExifData(null);
      }
    };

    loadExif();
  }, [photo]);

  return exifData;
};

// 获取浏览器位置
export const useBrowserLocation = () => {
  const [browserLocation, setBrowserLocation] = useState<BrowserLocation | null>(null);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setBrowserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        (error) => {
          console.log('无法获取浏览器位置:', error.message);
        },
        {
          // 关闭高精度可避免 Chrome 请求 Google 网络定位（国内常被 403 拦截）
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 600000,
        }
      );
    }
  }, []);

  return browserLocation;
};
