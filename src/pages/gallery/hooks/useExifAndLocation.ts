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
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    }
  }, []);

  return browserLocation;
};
