import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import exifr from 'exifr';

import '../App.css';
import { getSupabaseClient } from '../utils/supabaseClient';
import { getEnvValue } from '../utils/envConfig';
import {
  BRAND_LOGO_EVENT,
  BRAND_LOGO_STORAGE_KEY,
  BRAND_LOGO_SUPABASE_ID,
  BRAND_LOGO_SUPABASE_TABLE,
  getStoredBrandLogo,
  saveBrandLogo,
  getStoredBrandText,
  saveBrandText,
} from '../utils/branding';
import { Storage, StorageString, STORAGE_KEYS } from '../utils/storage';
import { handleError, formatErrorMessage, safeAsync, safeSync, ErrorType } from '../utils/errorHandler';
import { ensureHttps } from '../utils/urlUtils';

// 从localStorage加载审核通过的作品
const loadApprovedPhotos = () => {
  const photos = Storage.get(STORAGE_KEYS.APPROVED_PHOTOS, []);
  // 确保所有 URL 都使用 HTTPS
  return photos.map(photo => ({
    ...photo,
    image: ensureHttps(photo.image || ''),
    thumbnail: ensureHttps(photo.thumbnail || photo.preview || ''),
    preview: ensureHttps(photo.preview || photo.thumbnail || ''),
  }));
};

const mapSupabaseRowToGalleryPhoto = (row) => {
  const imageUrl = row.image_url || '';
  const thumbnailUrl = row.thumbnail_url || row.thumbnail || '';
  
  return {
    id: row.id,
    title: row.title || '',
    country: row.country || '',
    location: row.location || '',
    category: row.category || 'featured',
    image: ensureHttps(imageUrl),
    focal: row.focal || '50mm',
    aperture: row.aperture || 'f/2.8',
    shutter: row.shutter || '1/125s',
    iso: row.iso || '200',
    camera: row.camera || 'Unknown',
    lens: row.lens || 'Unknown',
    mood: row.tags?.split(',')[0]?.trim() || '原创作品',
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    altitude: row.altitude ?? null,
    tags: row.tags || '',
    createdAt: row.created_at || row.createdAt || null,
    thumbnail: ensureHttps(thumbnailUrl),
    hidden: row.hidden ?? false,
    shotDate: row.shot_date || null,
    rating: typeof row.rating === 'number' ? row.rating : null,
    likes: typeof row.likes === 'number' ? row.likes : 0,
  };
};

// 预置示例照片（目前不再用于展示，仅保留为模板）
const photos = [
  {
    id: '01',
    title: '海上黎明',
    country: '美国',
    location: '圣地亚哥',
    category: 'featured',
    image:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
    focal: '200mm',
    aperture: 'f/5.6',
    shutter: '1/640s',
    iso: '100',
    camera: 'Canon EOS 5D Mark IV',
    lens: 'EF 70-200mm f/2.8L',
    mood: '黄金海岸',
    latitude: 32.7157,
    longitude: -117.1611,
    altitude: 20,
  },
  {
    id: '02',
    title: '彩虹之路',
    country: '荷兰',
    location: '北荷兰省',
    category: 'featured',
    image:
      'https://images.unsplash.com/photo-1476610182048-b716b8518aae?auto=format&fit=crop&w=1200&q=80',
    focal: '85mm',
    aperture: 'f/4',
    shutter: '1/320s',
    iso: '200',
    camera: 'Nikon D850',
    lens: '85mm f/1.8',
    mood: '彩虹平原',
    latitude: 52.3702,
    longitude: 4.8952,
    altitude: 2,
  },
  {
    id: '03',
    title: '阿尔卑斯晨雾',
    country: '瑞士',
    location: '采尔马特',
    category: 'featured',
    image:
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80',
    focal: '35mm',
    aperture: 'f/8',
    shutter: '1/400s',
    iso: '125',
    camera: 'Fujifilm X-T4',
    lens: '35mm f/1.4',
    mood: '雪峰轨迹',
    latitude: 46.0207,
    longitude: 7.7491,
    altitude: 1620,
  },
  {
    id: '04',
    title: '湖畔黄昏',
    country: '意大利',
    location: '科莫湖',
    category: 'latest',
    image:
      'https://images.unsplash.com/photo-1505764706515-aa95265c5abc?auto=format&fit=crop&w=1200&q=80',
    focal: '50mm',
    aperture: 'f/5',
    shutter: '1/250s',
    iso: '200',
    camera: 'Sony A7R IV',
    lens: 'FE 24-70mm f/2.8',
    mood: '暮色宫殿',
    latitude: 45.9872,
    longitude: 9.2581,
    altitude: 199,
  },
  {
    id: '05',
    title: '都市动脉',
    country: '阿联酋',
    location: '迪拜',
    category: 'nearby',
    image:
      'https://images.unsplash.com/photo-1438519337937-43e29d02ed5e?auto=format&fit=crop&w=1200&q=80',
    focal: '28mm',
    aperture: 'f/7.1',
    shutter: '1/80s',
    iso: '400',
    camera: 'Canon EOS R5',
    lens: 'RF 24-70mm f/2.8',
    mood: '城市星轨',
    latitude: 25.2048,
    longitude: 55.2708,
    altitude: 5,
  },
  {
    id: '06',
    title: '伦敦眼夜色',
    country: '英国',
    location: '伦敦',
    category: 'latest',
    image:
      'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=80',
    focal: '35mm',
    aperture: 'f/2',
    shutter: '1/160s',
    iso: '640',
    camera: 'Sony A7 III',
    lens: '35mm f/1.4',
    mood: '河畔光晕',
    latitude: 51.5072,
    longitude: -0.1276,
    altitude: 35,
  },
  {
    id: '07',
    title: '集市的早晨',
    country: '英国',
    location: '伦敦',
    category: 'random',
    image:
      'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=80',
    focal: '50mm',
    aperture: 'f/2.2',
    shutter: '1/250s',
    iso: '200',
    camera: 'Leica Q2',
    lens: '28mm f/1.7',
    mood: '集市漫游',
    latitude: 51.5072,
    longitude: -0.1276,
    altitude: 35,
  },
  {
    id: '08',
    title: '沙漠修行',
    country: '尼泊尔',
    location: '博卡拉',
    category: 'far',
    image:
      'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=80',
    focal: '80mm',
    aperture: 'f/3.5',
    shutter: '1/200s',
    iso: '320',
    camera: 'Canon EOS 6D',
    lens: 'EF 24-105mm f/4',
    mood: '藏地匠人',
    latitude: 28.2096,
    longitude: 83.9856,
    altitude: 827,
  },
  {
    id: '09',
    title: '市井色彩',
    country: '马来西亚',
    location: '槟城',
    category: 'random',
    image:
      'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80',
    focal: '45mm',
    aperture: 'f/6.3',
    shutter: '1/125s',
    iso: '160',
    camera: 'Fujifilm X-Pro3',
    lens: '23mm f/2',
    mood: '街头光影',
    latitude: 5.4141,
    longitude: 100.3288,
    altitude: 4,
  },
  {
    id: '10',
    title: '鸟居之光',
    country: '日本',
    location: '京都',
    category: 'featured',
    image:
      'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80',
    focal: '16mm',
    aperture: 'f/4',
    shutter: '1/60s',
    iso: '500',
    camera: 'Sony A7C',
    lens: '16-35mm f/2.8',
    mood: '千鸟秘径',
    latitude: 35.0116,
    longitude: 135.7681,
    altitude: 55,
  },
  {
    id: '11',
    title: '霓虹隧道',
    country: '香港',
    location: '中环',
    category: 'nearby',
    image:
      'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=80',
    focal: '24mm',
    aperture: 'f/2.8',
    shutter: '1/125s',
    iso: '320',
    camera: 'Nikon Z6 II',
    lens: '24-70mm f/4',
    mood: '黑白线条',
    latitude: 22.2819,
    longitude: 114.1556,
    altitude: 10,
  },
  {
    id: '12',
    title: '潮汐肌理',
    country: '泰国',
    location: '普吉岛',
    category: 'far',
    image:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
    focal: '70mm',
    aperture: 'f/8',
    shutter: '1/160s',
    iso: '200',
    camera: 'Canon EOS 5D Mark III',
    lens: '70-200mm f/4',
    mood: '海岸律动',
    latitude: 7.8804,
    longitude: 98.3923,
    altitude: 12,
  },
];

const scenicImages = [
  'https://images.unsplash.com/photo-1505761671935-60b3a7427bad?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1482192505345-5655af888cc4?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1500534314211-0a24cd00dc60?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1519817650390-64a93db511aa?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=600&q=80',
];

const provinceCityData = [
  { id: 'beijing', title: '北京', cities: ['朝阳区', '海淀区', '通州区'] },
  { id: 'tianjin', title: '天津', cities: ['河西区', '滨海新区', '武清区'] },
  { id: 'shanghai', title: '上海', cities: ['浦东新区', '徐汇区', '嘉定区'] },
  { id: 'chongqing', title: '重庆', cities: ['渝中区', '南岸区', '江北区'] },
  { id: 'hebei', title: '河北', cities: ['石家庄', '唐山', '秦皇岛', '北戴河', '承德', '张家口', '保定'] },
  { id: 'shanxi', title: '山西', cities: ['太原', '大同', '晋中'] },
  { id: 'liaoning', title: '辽宁', cities: ['沈阳', '大连', '鞍山'] },
  { id: 'jilin', title: '吉林', cities: ['长春', '吉林市', '延吉'] },
  { id: 'heilongjiang', title: '黑龙江', cities: ['哈尔滨', '齐齐哈尔', '漠河'] },
  { id: 'jiangsu', title: '江苏', cities: ['南京', '苏州', '无锡'] },
  { id: 'zhejiang', title: '浙江', cities: ['杭州', '宁波', '温州'] },
  { id: 'anhui', title: '安徽', cities: ['合肥', '黄山', '芜湖'] },
  { id: 'fujian', title: '福建', cities: ['福州', '厦门', '泉州'] },
  { id: 'jiangxi', title: '江西', cities: ['南昌', '赣州', '景德镇'] },
  { id: 'shandong', title: '山东', cities: ['济南', '青岛', '烟台'] },
  { id: 'henan', title: '河南', cities: ['郑州', '洛阳', '开封'] },
  { id: 'hubei', title: '湖北', cities: ['武汉', '宜昌', '襄阳'] },
  { id: 'hunan', title: '湖南', cities: ['长沙', '张家界', '岳阳'] },
  { id: 'guangdong', title: '广东', cities: ['广州', '深圳', '珠海'] },
  { id: 'guangxi', title: '广西', cities: ['南宁', '桂林', '北海'] },
  { id: 'hainan', title: '海南', cities: ['海口', '三亚', '琼海'] },
  { id: 'sichuan', title: '四川', cities: ['成都', '乐山', '九寨沟'] },
  { id: 'guizhou', title: '贵州', cities: ['贵阳', '遵义', '兴义'] },
  { id: 'yunnan', title: '云南', cities: ['昆明', '大理', '西双版纳'] },
  { id: 'shaanxi', title: '陕西', cities: ['西安', '榆林', '汉中'] },
  { id: 'gansu', title: '甘肃', cities: ['兰州', '张掖', '敦煌', '永登县'] },
  { id: 'qinghai', title: '青海', cities: ['西宁', '德令哈', '玉树'] },
  { id: 'neimenggu', title: '内蒙古', cities: ['呼和浩特', '呼伦贝尔', '鄂尔多斯'] },
  { id: 'xinjiang', title: '新疆', cities: ['乌鲁木齐', '喀什', '伊犁'] },
  { id: 'ningxia', title: '宁夏', cities: ['银川', '固原', '中卫'] },
  { id: 'xizang', title: '西藏', cities: ['拉萨', '林芝', '日喀则'] },
  { id: 'taiwan', title: '台湾', cities: ['台北', '台中', '高雄'] },
  { id: 'hongkong', title: '香港', cities: ['中西区', '尖沙咀', '赤柱'] },
  { id: 'macao', title: '澳门', cities: ['花地玛堂区', '望德堂区', '氹仔'] },
];

const cityMeta = {
  北京: { lat: 39.9042, lng: 116.4074 },
  '海淀区': { lat: 39.958, lng: 116.298 },
  '朝阳区': { lat: 39.9219, lng: 116.4436 },
  '通州区': { lat: 39.9096, lng: 116.6586 },
  天津: { lat: 39.3434, lng: 117.3616 },
  '河西区': { lat: 39.1099, lng: 117.223 },
  '滨海新区': { lat: 39.0339, lng: 117.7108 },
  '武清区': { lat: 39.3803, lng: 117.0479 },
  上海: { lat: 31.2304, lng: 121.4737 },
  '浦东新区': { lat: 31.2304, lng: 121.5506 },
  '徐汇区': { lat: 31.1885, lng: 121.4365 },
  '嘉定区': { lat: 31.3748, lng: 121.251 },
  重庆: { lat: 29.563, lng: 106.5516 },
  '渝中区': { lat: 29.5586, lng: 106.568 },
  '南岸区': { lat: 29.5417, lng: 106.587 },
  '江北区': { lat: 29.5883, lng: 106.532 },
  '石家庄': { lat: 38.0428, lng: 114.5149 },
  '唐山': { lat: 39.6305, lng: 118.1805 },
  '秦皇岛': { lat: 39.9354, lng: 119.5996 },
  '北戴河': { lat: 39.8231, lng: 119.4889 }, // 北戴河是秦皇岛的一个区，属于河北省
  '太原': { lat: 37.8706, lng: 112.5489 },
  '大同': { lat: 40.0768, lng: 113.3001 },
  '晋中': { lat: 37.687, lng: 112.752 },
  '沈阳': { lat: 41.8069, lng: 123.4315 },
  '大连': { lat: 38.914, lng: 121.6147 },
  '鞍山': { lat: 41.1086, lng: 122.9946 },
  '长春': { lat: 43.8171, lng: 125.3235 },
  '吉林市': { lat: 43.8379, lng: 126.5496 },
  '延吉': { lat: 42.9048, lng: 129.4271 },
  '哈尔滨': { lat: 45.8038, lng: 126.534 },
  '齐齐哈尔': { lat: 47.3543, lng: 123.917 },
  '漠河': { lat: 52.9721, lng: 122.537 },
  '南京': { lat: 32.0603, lng: 118.7969 },
  '苏州': { lat: 31.2989, lng: 120.5853 },
  '无锡': { lat: 31.4912, lng: 120.3119 },
  '杭州': { lat: 30.2741, lng: 120.1551 },
  '宁波': { lat: 29.8683, lng: 121.544 },
  '温州': { lat: 27.9938, lng: 120.6994 },
  '合肥': { lat: 31.8206, lng: 117.2272 },
  '黄山': { lat: 29.7147, lng: 118.3375 },
  '芜湖': { lat: 31.3525, lng: 118.433 },
  '福州': { lat: 26.0745, lng: 119.2965 },
  '厦门': { lat: 24.4798, lng: 118.0894 },
  '泉州': { lat: 24.8739, lng: 118.6759 },
  '南昌': { lat: 28.6829, lng: 115.8582 },
  '赣州': { lat: 25.8311, lng: 114.9348 },
  '景德镇': { lat: 29.2687, lng: 117.1784 },
  '济南': { lat: 36.6512, lng: 117.1201 },
  '青岛': { lat: 36.0671, lng: 120.3826 },
  '烟台': { lat: 37.4638, lng: 121.4479 },
  '郑州': { lat: 34.7579, lng: 113.6655 },
  '洛阳': { lat: 34.6197, lng: 112.454 },
  '开封': { lat: 34.7973, lng: 114.3076 },
  '武汉': { lat: 30.5928, lng: 114.3055 },
  '宜昌': { lat: 30.6919, lng: 111.2865 },
  '襄阳': { lat: 32.0089, lng: 112.1224 },
  '长沙': { lat: 28.2278, lng: 112.9389 },
  '张家界': { lat: 29.1171, lng: 110.4792 },
  '岳阳': { lat: 29.3565, lng: 113.1287 },
  '广州': { lat: 23.1291, lng: 113.2644 },
  '深圳': { lat: 22.5431, lng: 114.0579 },
  '珠海': { lat: 22.2707, lng: 113.5767 },
  '南宁': { lat: 22.817, lng: 108.3669 },
  '桂林': { lat: 25.2742, lng: 110.295 },
  '北海': { lat: 21.475, lng: 109.119 },
  '海口': { lat: 20.044, lng: 110.1999 },
  '三亚': { lat: 18.2528, lng: 109.5119 },
  '琼海': { lat: 19.2424, lng: 110.464 },
  '成都': { lat: 30.5728, lng: 104.0668 },
  '乐山': { lat: 29.5521, lng: 103.7656 },
  '九寨沟': { lat: 33.2621, lng: 104.2383 },
  '贵阳': { lat: 26.647, lng: 106.6302 },
  '遵义': { lat: 27.6997, lng: 106.941 },
  '兴义': { lat: 25.0918, lng: 104.8867 },
  '昆明': { lat: 25.0389, lng: 102.7183 },
  '大理': { lat: 25.6065, lng: 100.2676 },
  '西双版纳': { lat: 22, lng: 100.771 },
  '西安': { lat: 34.3416, lng: 108.9398 },
  '榆林': { lat: 38.2906, lng: 109.7412 },
  '汉中': { lat: 33.0777, lng: 107.0294 },
  '兰州': { lat: 36.0611, lng: 103.8343 },
  '张掖': { lat: 38.9259, lng: 100.4498 },
  '敦煌': { lat: 40.1421, lng: 94.661 },
  '永登县': { lat: 36.7374, lng: 103.2624 },
  '西宁': { lat: 36.6171, lng: 101.7782 },
  '德令哈': { lat: 37.3746, lng: 97.3615 },
  '玉树': { lat: 33.001, lng: 97.0133 },
  '呼和浩特': { lat: 40.842, lng: 111.749 },
  '呼伦贝尔': { lat: 49.2185, lng: 119.7657 },
  '鄂尔多斯': { lat: 39.6089, lng: 109.7809 },
  '乌鲁木齐': { lat: 43.8256, lng: 87.6168 },
  '喀什': { lat: 39.4704, lng: 75.9898 },
  '伊犁': { lat: 43.9168, lng: 81.324 },
  '银川': { lat: 38.4872, lng: 106.2309 },
  '固原': { lat: 36.008, lng: 106.2786 },
  '中卫': { lat: 37.5006, lng: 105.1968 },
  '拉萨': { lat: 29.652, lng: 91.1721 },
  '林芝': { lat: 29.6469, lng: 94.3623 },
  '日喀则': { lat: 29.2675, lng: 88.8806 },
  '台北': { lat: 25.033, lng: 121.5654 },
  '台中': { lat: 24.1477, lng: 120.6736 },
  '高雄': { lat: 22.6273, lng: 120.3014 },
  '中西区': { lat: 22.281, lng: 114.1588 },
  '尖沙咀': { lat: 22.2973, lng: 114.1722 },
  '赤柱': { lat: 22.2184, lng: 114.211 },
  香港: { lat: 22.3205, lng: 114.1732 },
  '花地玛堂区': { lat: 22.199, lng: 113.5457 },
  '望德堂区': { lat: 22.1946, lng: 113.5529 },
  '氹仔': { lat: 22.154, lng: 113.559 },
  澳门: { lat: 22.1987, lng: 113.5439 },
};

const normalizeText = (text = '') => text.toLowerCase();
const MUNICIPALITY_PROVINCES = new Set(['beijing', 'tianjin', 'shanghai', 'chongqing', 'hongkong', 'macao']);

const explorePins = [
  { name: '北京', coords: [39.9042, 116.4074] },
  { name: '上海', coords: [31.2304, 121.4737] },
  { name: '东京', coords: [35.6762, 139.6503] },
  { name: '京都', coords: [35.0116, 135.7681] },
  { name: '曼谷', coords: [13.7563, 100.5018] },
  { name: '迪拜', coords: [25.2048, 55.2708] },
  { name: '伦敦', coords: [51.5072, -0.1276] },
  { name: '雷克雅未克', coords: [64.1466, -21.9426] },
  { name: '纽约', coords: [40.7128, -74.006] },
  { name: '里约热内卢', coords: [-22.9068, -43.1729] },
  { name: '开普敦', coords: [-33.9249, 18.4241] },
];

const tabs = [
  { id: 'latest', label: '最新' },
  { id: 'featured', label: '精选' },
  { id: 'random', label: '随览' },
  { id: 'nearby', label: '附近' },
  { id: 'far', label: '远方' },
];

// 根据拍摄日期计算“几年前”和格式化日期
const getShotTimeInfo = (shotDateValue) => {
  if (!shotDateValue) {
    return { yearsAgoText: '未知', dateText: '拍摄日期未设置' };
  }

  const date = new Date(shotDateValue);
  if (Number.isNaN(date.getTime())) {
    return { yearsAgoText: '未知', dateText: '拍摄日期格式不正确' };
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffYears = Math.floor(diffMs / (365 * 24 * 60 * 60 * 1000));

  let yearsAgoText;
  if (diffYears <= 0) {
    yearsAgoText = '今年';
  } else if (diffYears === 1) {
    yearsAgoText = '1 年前';
  } else {
    yearsAgoText = `${diffYears} 年前`;
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dateText = `${year}年${month}月${day}日`;

  return { yearsAgoText, dateText };
};

// 将十进制度数转换为度分秒格式
const decimalToDMS = (decimal, isLatitude) => {
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60);

  const direction = isLatitude ? (decimal >= 0 ? 'N' : 'S') : decimal >= 0 ? 'E' : 'W';

  return `${degrees}°${minutes.toString().padStart(2, '0')}′${direction}`;
};

// 计算两点之间的距离（公里）
const calculateDistance = (lat1, lon1, lat2, lon2) => {
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

export function GalleryPage() {
  const supabase = getSupabaseClient();
  const isSupabaseReady = Boolean(supabase);
  const [activeFilter, setActiveFilter] = useState('latest');
  // 记住上次使用的视图：刷新后仍然停留在“发现”或“图库”
  const [activeView, setActiveView] = useState(() => {
    const stored = StorageString.get(STORAGE_KEYS.ACTIVE_VIEW, 'gallery-view');
    return stored === 'explore-view' ? 'explore-view' : 'gallery-view';
  });
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [metaPopover, setMetaPopover] = useState(null); // { tab: 'basic' | 'geo', x, y }
  const [exifData, setExifData] = useState(null);
  const [showMobileMeta, setShowMobileMeta] = useState(false); // 手机端参数区域显示状态
  const [approvedPhotos, setApprovedPhotos] = useState(() => (isSupabaseReady ? [] : loadApprovedPhotos()));
  const [supabaseError, setSupabaseError] = useState('');
  const [displayedCount, setDisplayedCount] = useState(12); // 初始显示的照片数量
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapInstance = useRef(null); // 发现页主地图：高德 Map 实例
  const tabStripRef = useRef(null); // 标签页容器引用
  const exploreMarkersRef = useRef([]); // 发现页自定义圆点
  const currentLocationMarkerRef = useRef(null); // 当前浏览器位置标记
  const geoMapContainerRef = useRef(null);
  const geoMapInstance = useRef(null);
  const [browserLocation, setBrowserLocation] = useState(null); // { lat, lon }
  const [isMapReady, setIsMapReady] = useState(false); // 高德地图是否已初始化完成
  const [locationPanel, setLocationPanel] = useState(null); // { title, subtitle, photos: [], emptyMessage? }
  const [expandedCategories, setExpandedCategories] = useState({});
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [activeCitySelection, setActiveCitySelection] = useState(null); // { provinceId, cityId }
  const [brandLogo, setBrandLogo] = useState(() => getStoredBrandLogo());
  const [brandText, setBrandText] = useState(() => getStoredBrandText());

  // 点赞记录（保存在本地，防止同一浏览器无限刷赞）
  const [likedPhotoIds, setLikedPhotoIds] = useState(() => {
    return Storage.get(STORAGE_KEYS.LIKED_PHOTOS, []);
  });

  useEffect(() => {
    Storage.set(STORAGE_KEYS.LIKED_PHOTOS, likedPhotoIds);
  }, [likedPhotoIds]);

  const handleToggleLike = useCallback(
    async (photo) => {
      if (!photo?.id || !supabase) return;

      const alreadyLiked = likedPhotoIds.includes(photo.id);
      const delta = alreadyLiked ? -1 : 1;

      // 本地乐观更新
      setApprovedPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id ? { ...p, likes: Math.max(0, (p.likes || 0) + delta) } : p,
        ),
      );

      setLikedPhotoIds((prev) =>
        alreadyLiked ? prev.filter((id) => id !== photo.id) : [...prev, photo.id],
      );

      await safeAsync(async () => {
        const newLikes = Math.max(0, (photo.likes || 0) + delta);
        const { error } = await supabase
          .from('photos')
          .update({ likes: newLikes })
          .eq('id', photo.id);

        if (error) {
          throw handleError(error, {
            context: 'handleToggleLike.updateLikes',
            type: ErrorType.NETWORK,
          });
        }
      }, {
        context: 'handleToggleLike',
        silent: true, // 点赞失败不显示错误，静默处理
        throwError: false,
      });
    },
    [likedPhotoIds, supabase, setApprovedPhotos],
  );

  // 根据经纬度判断省份（简化版，使用主要城市的经纬度范围）
  const getProvinceFromCoords = useCallback((lat, lng) => {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;
    
    // 使用省份主要城市的经纬度范围进行粗略判断
    // 这是一个简化方案，更精确的方案需要使用省份边界数据
    // 注意：顺序很重要！较小的、边界明确的省份应该排在前面，避免被大省份误判
    const provinceRanges = [
      // 直辖市和特别行政区（范围小，优先匹配）
      { id: 'beijing', title: '北京', latRange: [39.4, 40.2], lngRange: [116.0, 116.8], priority: 1 },
      { id: 'tianjin', title: '天津', latRange: [38.5, 40.0], lngRange: [116.7, 118.0], priority: 1 },
      { id: 'shanghai', title: '上海', latRange: [30.7, 31.9], lngRange: [120.8, 122.0], priority: 1 },
      { id: 'chongqing', title: '重庆', latRange: [28.1, 32.2], lngRange: [105.2, 110.2], priority: 1 },
      { id: 'hongkong', title: '香港', latRange: [22.1, 22.6], lngRange: [113.8, 114.5], priority: 1 },
      { id: 'macao', title: '澳门', latRange: [22.1, 22.2], lngRange: [113.5, 113.6], priority: 1 },
      { id: 'taiwan', title: '台湾', latRange: [21.9, 25.3], lngRange: [119.3, 122.0], priority: 1 },
      { id: 'hainan', title: '海南', latRange: [18.1, 20.1], lngRange: [108.6, 111.0], priority: 1 },
      { id: 'ningxia', title: '宁夏', latRange: [35.2, 39.4], lngRange: [104.2, 107.6], priority: 1 },
      
      // 较小的省份（优先匹配，避免被大省份覆盖）
      { id: 'jiangxi', title: '江西', latRange: [24.3, 30.0], lngRange: [113.5, 118.5], priority: 2 },
      { id: 'zhejiang', title: '浙江', latRange: [27.0, 31.5], lngRange: [118.0, 123.0], priority: 2 },
      { id: 'fujian', title: '福建', latRange: [23.5, 28.3], lngRange: [115.8, 120.7], priority: 2 },
      { id: 'anhui', title: '安徽', latRange: [29.4, 34.7], lngRange: [114.9, 119.8], priority: 2 },
      { id: 'jiangsu', title: '江苏', latRange: [30.7, 35.1], lngRange: [116.2, 121.9], priority: 2 },
      { id: 'shandong', title: '山东', latRange: [34.4, 38.4], lngRange: [114.3, 122.7], priority: 2 },
      { id: 'henan', title: '河南', latRange: [31.2, 36.4], lngRange: [110.3, 116.6], priority: 2 },
      { id: 'hubei', title: '湖北', latRange: [29.0, 33.3], lngRange: [108.2, 116.1], priority: 2 },
      { id: 'hunan', title: '湖南', latRange: [24.6, 30.1], lngRange: [108.8, 114.3], priority: 2 },
      { id: 'guangdong', title: '广东', latRange: [20.1, 25.5], lngRange: [109.6, 117.3], priority: 2 },
      { id: 'guangxi', title: '广西', latRange: [20.9, 26.4], lngRange: [104.3, 112.0], priority: 2 },
      { id: 'guizhou', title: '贵州', latRange: [24.6, 29.2], lngRange: [103.6, 109.3], priority: 2 },
      { id: 'shanxi', title: '山西', latRange: [34.5, 40.7], lngRange: [110.2, 114.6], priority: 2 },
      { id: 'shaanxi', title: '陕西', latRange: [31.4, 39.6], lngRange: [105.5, 111.3], priority: 2 },
      { id: 'jilin', title: '吉林', latRange: [40.8, 46.3], lngRange: [121.3, 131.2], priority: 2 },
      
      // 中等省份（河北优先于辽宁，避免秦皇岛、北戴河被误判为辽宁）
      // 秦皇岛坐标：39.9354°N, 119.5996°E
      // 北戴河坐标：约 39.8°N, 119.5°E
      { id: 'hebei', title: '河北', latRange: [36.0, 42.6], lngRange: [113.4, 120.0], priority: 2 }, // 扩展经度上限到120.0，确保包含秦皇岛
      { id: 'liaoning', title: '辽宁', latRange: [38.7, 43.4], lngRange: [119.0, 125.5], priority: 3 }, // 调整经度下限到119.0，避免与河北重叠
      { id: 'heilongjiang', title: '黑龙江', latRange: [43.4, 53.6], lngRange: [121.1, 135.1], priority: 3 },
      { id: 'sichuan', title: '四川', latRange: [26.0, 34.3], lngRange: [100.8, 108.5], priority: 3 },
      { id: 'yunnan', title: '云南', latRange: [21.1, 29.2], lngRange: [97.5, 106.2], priority: 3 },
      
      // 大省份和边界重叠的省份（放在后面，避免误判）
      // 青海优先于甘肃，避免西宁（青海省会，36.6°N, 101.8°E）被误判为甘肃
      { id: 'qinghai', title: '青海', latRange: [31.6, 39.2], lngRange: [89.4, 103.0], priority: 4 },
      { id: 'gansu', title: '甘肃', latRange: [32.1, 42.8], lngRange: [92.3, 108.7], priority: 4 },
      { id: 'xizang', title: '西藏', latRange: [26.9, 36.5], lngRange: [78.4, 99.1], priority: 4 },
      { id: 'xinjiang', title: '新疆', latRange: [34.3, 49.2], lngRange: [73.5, 96.4], priority: 4 },
      { id: 'neimenggu', title: '内蒙古', latRange: [37.4, 53.3], lngRange: [97.2, 126.0], priority: 5 }, // 最大，最后匹配
    ];
    
    // 按优先级排序：priority 越小越优先
    const sortedProvinces = [...provinceRanges].sort((a, b) => a.priority - b.priority);
    
    // 匹配时优先返回优先级高的省份
    for (const province of sortedProvinces) {
      if (
        lat >= province.latRange[0] && lat <= province.latRange[1] &&
        lng >= province.lngRange[0] && lng <= province.lngRange[1]
      ) {
        return { id: province.id, title: province.title };
      }
    }
    return null;
  }, []);

  // 从文本中提取省、市、县名
  const extractLocationParts = useCallback((location, country) => {
    if (!location && !country) return { province: null, city: null, county: null };
    
    const text = `${country || ''}${location || ''}`;
    const provinces = provinceCityData.map(p => p.title);
    
    let province = null;
    let city = null;
    let county = null;
    
    // 优先从 country 字段查找省份（因为 country 字段通常存储省份信息）
    if (country) {
      for (const p of provinces) {
        // 精确匹配省份名（避免部分匹配导致错误）
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
    
    // 提取县名（包含"县"、"区"、"市"的地名）
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
  }, []);

  const cityPhotoMap = useMemo(() => {
    /**
     * 完全由照片数据动态生成的「省份-城市」映射：
     * Map<key, { provinceId, provinceTitle, cityName, photos: Photo[] }>
     * key 形如 `${provinceId}-${cityName}`，仅用于区分城市，不再依赖固定的省份列表顺序。
     */
    const map = new Map();
    if (!approvedPhotos || approvedPhotos.length === 0) return map;

    approvedPhotos.forEach((photo) => {
      let province = null; // { id, title }
      let cityName = null;
      
      // 1）优先使用文本解析：你在后台填写的省市县 > 经纬度
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

      // 2）如果文字里完全看不出省份，再尝试用经纬度推断
      if (!province && photo.latitude != null && photo.longitude != null) {
        const lat = Number(photo.latitude);
        const lng = Number(photo.longitude);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          province = getProvinceFromCoords(lat, lng);
          // 如果之前 cityName 为空，再兜底
          if (!cityName) {
          cityName = photo.location || photo.country || '未知地点';
        }
      }
      }
      
      // 3）如果还是找不到，尝试匹配预定义的城市列表（向后兼容）
      // 注意：需要按照特定顺序匹配，避免城市名冲突
      // 优先级：小省份 > 中等省份 > 大省份，避免边界城市被误判
      if (!province) {
      const location = normalizeText(photo.location);
      const country = normalizeText(photo.country);

        // 定义省份优先级：小省份优先，避免被大省份误判
        const provincePriority = {
          // 直辖市和特别行政区（最高优先级）
          'beijing': 1, 'tianjin': 1, 'shanghai': 1, 'chongqing': 1,
          'hongkong': 1, 'macao': 1, 'taiwan': 1, 'hainan': 1, 'ningxia': 1,
          // 小省份
          'jiangxi': 2, 'zhejiang': 2, 'fujian': 2, 'anhui': 2, 'jiangsu': 2,
          'shandong': 2, 'henan': 2, 'hubei': 2, 'hunan': 2, 'guangdong': 2,
          'guangxi': 2, 'guizhou': 2, 'shanxi': 2, 'shaanxi': 2,
          'jilin': 2, 'hebei': 2, 'heilongjiang': 2, 'sichuan': 2, 'yunnan': 2,
          // 边界重叠的省份（需要特别注意）
          'qinghai': 3, // 青海优先于甘肃，避免西宁被误判
          'liaoning': 3, // 辽宁优先级低于河北，避免秦皇岛、北戴河被误判
          'gansu': 4,
          'xizang': 4, 'xinjiang': 4,
          'neimenggu': 5, // 最大，最后匹配
        };

        // 按优先级排序省份
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
          // 使用精确匹配或包含匹配，避免部分匹配导致错误
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
      
      // 4）如果最终能确定某个省份，则把照片归入对应的「省份-城市」桶里
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
      group.photos.sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bt - at;
      });
    });

    return map;
  }, [approvedPhotos, getProvinceFromCoords, extractLocationParts]);

  const curationGroups = useMemo(() => {
    // 使用 cityPhotoMap 动态构建省份-城市分组，不再依赖固定的 provinceCityData 顺序
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
        // 获取城市坐标：优先使用照片的经纬度，其次使用预定义的坐标
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
        // 如果城市已存在，累加照片数量（理论上不会出现不同 group 拆分同一城市，但这里做个保护）
        const cityEntry = provinceData.cities.get(cityName);
        cityEntry.photoCount += photos.length;
      }
    });

    // 转换为数组格式
    const groups = Array.from(provinceMap.values()).map((provinceData) => {
      const items = Array.from(provinceData.cities.values()).sort(
        (a, b) => b.photoCount - a.photoCount,
      ); // 省内城市按照片数量排序

      const totalCount = items.reduce((sum, item) => sum + item.photoCount, 0);
        
        return {
        id: provinceData.id,
        title: provinceData.title,
          items,
        totalCount,
        };
    });

    // 省份整体按总照片数量排序（多的在上），数量相同时按名称排序
    groups.sort((a, b) => {
      if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
      return a.title.localeCompare(b.title, 'zh-Hans-CN');
    });

    return groups;
  }, [cityPhotoMap]);

  useEffect(() => {
    setExpandedCategories((prev) => {
      const next = {};
      curationGroups.forEach((group) => {
        next[group.id] = typeof prev[group.id] === 'boolean' ? prev[group.id] : false;
      });
      return next;
    });
  }, [curationGroups]);

  const focusMapOnCity = useCallback(
    (lng, lat) => {
      if (!isMapReady || !mapInstance.current || !window.AMap) return;
      if (lng == null || lat == null) return;
      const map = mapInstance.current;
      const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : 5.5;
      const targetZoom = Math.min(Math.max(currentZoom, 10.2), 15.2);
      if (typeof map.setZoomAndCenter === 'function') {
        map.setZoomAndCenter(targetZoom, [lng, lat]);
      } else {
        map.setCenter([lng, lat]);
        if (typeof map.setZoom === 'function') {
          map.setZoom(targetZoom);
        }
      }
    },
    [isMapReady],
  );

  // 精选卡片：根据鼠标位置实现稍微夸张一点的 3D 倾斜
  const handleCurationCardMouseMove = useCallback((event) => {
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width - 0.5; // -0.5 ~ 0.5
    const relativeY = (event.clientY - rect.top) / rect.height - 0.5; // -0.5 ~ 0.5

    // 更新用于高光位置的 CSS 变量（0% ~ 100%）
    const percentX = ((event.clientX - rect.left) / rect.width) * 100;
    const percentY = ((event.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--cursor-x', `${percentX}%`);
    card.style.setProperty('--cursor-y', `${percentY}%`);

    const maxTilt = 9; // 最大旋转角度（度）

    const rotateY = relativeX * maxTilt * 2; // 左右倾斜
    const rotateX = -relativeY * maxTilt * 2; // 上下倾斜（向上移动时朝用户倾斜）

    card.style.transform = `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(
      2,
    )}deg) translateZ(18px)`;
  }, []);

  const handleCurationCardMouseLeave = useCallback((event) => {
    const card = event.currentTarget;
    card.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0)';
    // 恢复高光中心为中间，避免突然跳动
    card.style.setProperty('--cursor-x', '50%');
    card.style.setProperty('--cursor-y', '50%');
  }, []);

  const handleViewChange = useCallback((view) => {
    setActiveView(view);
    StorageString.set(STORAGE_KEYS.ACTIVE_VIEW, view);
  }, []);

  const showLocationPanel = useCallback(
    (panelData, options = {}) => {
      const { ensureExplore = false } = options;
      const reveal = () => setLocationPanel(panelData);

      if (ensureExplore && activeView !== 'explore-view') {
        handleViewChange('explore-view');
        const scheduler =
          typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame
            : (cb) => setTimeout(cb, 0);
        scheduler(reveal);
      } else {
        reveal();
      }
    },
    [activeView, handleViewChange],
  );

  // 监听localStorage变化，实时更新审核通过的作品
  useEffect(() => {
    if (supabase) return;

    const handleStorageChange = () => {
      const loaded = loadApprovedPhotos();
      console.log('加载审核通过的照片:', loaded);
      setApprovedPhotos(loaded);
    };

    // 初始加载
    handleStorageChange();

    // 监听storage事件（跨标签页）
    window.addEventListener('storage', handleStorageChange);
    
    // 定期检查localStorage（同标签页）
    const interval = setInterval(handleStorageChange, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;

    const fetchApprovedFromSupabase = async () => {
      try {
        const { data, error } = await supabase
          .from('photos')
          .select('*')
          .eq('status', 'approved')
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        if (isMounted) {
          const mapped = (data || []).map(mapSupabaseRowToGalleryPhoto);
          console.log(`从 Supabase 加载了 ${mapped.length} 张已审核通过的照片`);
          // 调试：检查是否有永登县的照片
          const yongdengPhotos = mapped.filter(p => 
            (p.location && p.location.includes('永登')) || 
            (p.country && p.country.includes('永登'))
          );
          if (yongdengPhotos.length > 0) {
            console.log('找到永登县相关照片:', yongdengPhotos);
          }
          setApprovedPhotos(mapped);
          setSupabaseError('');
        }
      } catch (error) {
        const appError = handleError(error, {
          context: 'fetchApprovedFromSupabase',
          type: ErrorType.NETWORK,
        });
        if (isMounted) {
          setSupabaseError(formatErrorMessage(appError, '加载云端作品失败'));
        }
      }
    };

    fetchApprovedFromSupabase();
    const intervalId = setInterval(fetchApprovedFromSupabase, 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [supabase]);

  // 获取浏览器位置
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

  // 获取地理位置信息
  const getGeoInfo = useMemo(() => {
    if (!lightboxPhoto) return null;

    // 优先使用EXIF数据，如果没有则使用照片数据中的经纬度
    const lat = exifData?.latitude ?? lightboxPhoto.latitude;
    const lon = exifData?.longitude ?? lightboxPhoto.longitude;
    const altitude = exifData?.GPSAltitude ?? lightboxPhoto.altitude;

    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return null;

    // 计算距离：优先使用浏览器位置，否则使用北京作为参考点
    let distance = null;
    if (browserLocation) {
      distance = calculateDistance(
        browserLocation.lat,
        browserLocation.lon,
        Number(lat),
        Number(lon)
      );
    } else {
      // 默认使用北京作为参考点
    const beijingLat = 39.9042;
    const beijingLon = 116.4074;
      distance = calculateDistance(beijingLat, beijingLon, Number(lat), Number(lon));
    }

    return {
      place: `${lightboxPhoto.country || ''}${lightboxPhoto.location ? ' · ' + lightboxPhoto.location : ''}`,
      latDms: decimalToDMS(Number(lat), true),
      lonDms: decimalToDMS(Number(lon), false),
      lat: Number(lat).toFixed(6),
      lon: Number(lon).toFixed(6),
      latitude: Number(lat),
      longitude: Number(lon),
      altitude: altitude != null ? `${altitude} m  ${altitude} 米` : '未知',
      distance: distance != null ? `${distance.toLocaleString()} km` : '未知',
      browserLocation: browserLocation,
    };
  }, [lightboxPhoto, exifData, browserLocation]);

  // 打开照片时，手机端默认隐藏参数
  useEffect(() => {
    if (lightboxPhoto) {
      setShowMobileMeta(false);
    }
  }, [lightboxPhoto]);

  // 从图片读取EXIF数据
  useEffect(() => {
    if (!lightboxPhoto?.image) {
      setExifData(null);
      return;
    }

    const loadExif = async () => {
      try {
        const exif = await exifr.parse(lightboxPhoto.image, {
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
  }, [lightboxPhoto]);

  // 只使用后台审核通过且未隐藏的照片，不再展示内置示例数据
  const allPhotos = useMemo(() => {
    return approvedPhotos.filter((p) => !p.hidden);
  }, [approvedPhotos]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleLogoBroadcast = (event) => {
      setBrandLogo(typeof event.detail === 'string' ? event.detail : getStoredBrandLogo());
    };

    const handleStorage = (event) => {
      if (event.key === BRAND_LOGO_STORAGE_KEY) {
        setBrandLogo(event.newValue || '');
      }
    };

    window.addEventListener(BRAND_LOGO_EVENT, handleLogoBroadcast);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(BRAND_LOGO_EVENT, handleLogoBroadcast);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;

    const fetchRemoteBranding = async () => {
      try {
        const { data, error } = await supabase
          .from(BRAND_LOGO_SUPABASE_TABLE)
          .select('logo_data, logo_url, site_title, site_subtitle, admin_title, admin_subtitle')
          .eq('id', BRAND_LOGO_SUPABASE_ID)
          .limit(1);
        if (error) {
          handleError(error, {
            context: 'fetchRemoteBranding.load',
            type: ErrorType.NETWORK,
            silent: true, // 品牌配置加载失败不影响主要功能
          });
          return;
        }
        const record = Array.isArray(data) ? data[0] : null;
        if (!isMounted || !record) return;

        const remoteLogo = record.logo_data || record.logo_url || '';
        if (remoteLogo) {
          saveBrandLogo(remoteLogo);
          setBrandLogo(remoteLogo);
        }

        // 只在初始化时从远端合并文案，并同时写回 localStorage，保证下次一打开就能立刻用你自己的标题
        setBrandText((prev) => {
          const merged = {
            siteTitle: record.site_title || prev.siteTitle,
            siteSubtitle: record.site_subtitle || prev.siteSubtitle,
            adminTitle: record.admin_title || prev.adminTitle,
            adminSubtitle: record.admin_subtitle || prev.adminSubtitle,
          };
          safeSync(() => {
            saveBrandText(merged);
          }, {
            context: 'fetchRemoteBranding.saveText',
            type: ErrorType.STORAGE,
            silent: true,
            throwError: false,
          });
          return merged;
        });
      } catch (error) {
        handleError(error, {
          context: 'fetchRemoteBranding',
          type: ErrorType.NETWORK,
          silent: true,
        });
      }
    };

    fetchRemoteBranding();
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const handleCityCardClick = useCallback(
    (province, city) => {
      setActiveCitySelection({ provinceId: province.id, cityId: city.id });
      setLocationPanel(null);

      const focus = () => {
        if (city.lng != null && city.lat != null) {
          focusMapOnCity(city.lng, city.lat);
        }
      };

      if (activeView !== 'explore-view') {
        handleViewChange('explore-view');
        const scheduler =
          typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame
            : (cb) => setTimeout(cb, 0);
        scheduler(focus);
      } else {
        focus();
      }
    },
    [activeView, focusMapOnCity, handleViewChange],
  );

  // 将具有经纬度的作品按地点聚合，用于在发现地图上打点
  const photosByLocation = useMemo(() => {
    if (!approvedPhotos || approvedPhotos.length === 0) return [];

    const groups = new Map();

    approvedPhotos.forEach((p) => {
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
      groups.get(key).photos.push(p);
    });

    const result = Array.from(groups.values());
    // 每个地点内按时间排序，最新的在前
    result.forEach((g) => {
      g.photos.sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bt - at;
      });
    });

    return result;
  }, [approvedPhotos]);

  const filteredPhotos = useMemo(() => {
    if (!allPhotos || allPhotos.length === 0) return [];

    // 帮助函数：按时间从新到旧排序（优先拍摄日期，其次创建时间，最后按 id 兜底）
    const getTimeValue = (p) => {
      if (p.shotDate) {
        const t = new Date(p.shotDate).getTime();
        if (!Number.isNaN(t)) return t;
      }
      if (p.createdAt) {
        const t = new Date(p.createdAt).getTime();
        if (!Number.isNaN(t)) return t;
      }
      // 如果没有时间，就尝试用数字 id 作为大致顺序
      if (typeof p.id === 'number') return p.id;
      if (typeof p.id === 'string') {
        const n = Number(p.id);
        if (!Number.isNaN(n)) return n;
      }
      return 0;
    };

    const sortByLatest = (list) =>
      [...list].sort((a, b) => getTimeValue(b) - getTimeValue(a));

    // 帮助函数：精选排序——按星级从高到低，相同星级再按时间从新到旧
    const sortByFeatured = (list) =>
      [...list].sort((a, b) => {
        const aRating = typeof a.rating === 'number' ? a.rating : 0;
        const bRating = typeof b.rating === 'number' ? b.rating : 0;
        if (bRating !== aRating) return bRating - aRating;
        return getTimeValue(b) - getTimeValue(a);
      });

    // 帮助函数：带距离信息的列表
    const withDistance = (list) => {
      if (!browserLocation) return [];
      return list
        .filter((p) => p.latitude != null && p.longitude != null)
        .map((p) => ({
          ...p,
          _distance: calculateDistance(
            browserLocation.lat,
            browserLocation.lon,
            p.latitude,
            p.longitude
          ),
        }));
    };

    switch (activeFilter) {
      case 'featured': {
        // 精选：先按星级从高到低，再按时间从新到旧
        return sortByFeatured(allPhotos);
      }
      case 'latest': {
        // 最新：同样按日期从新到旧
        return sortByLatest(allPhotos);
      }
      case 'random': {
        // 随览：每次打乱顺序
        const shuffled = [...allPhotos];
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
      }
      case 'nearby': {
        // 附近：按当前位置距离从近到远排序
        const list = withDistance(allPhotos);
        if (list.length === 0) return sortByLatest(allPhotos);
        return list.sort((a, b) => a._distance - b._distance);
      }
      case 'far': {
        // 远方：按当前位置距离从远到近排序
        const list = withDistance(allPhotos);
        if (list.length === 0) return sortByLatest(allPhotos);
        return list.sort((a, b) => b._distance - a._distance);
      }
      default:
        return sortByLatest(allPhotos);
    }
  }, [activeFilter, allPhotos, browserLocation]);

  // 当筛选器改变时，重置显示数量
  useEffect(() => {
    setDisplayedCount(12);
  }, [activeFilter]);

  // 更新标签页滑动背景位置
  useEffect(() => {
    const updateTabIndicator = () => {
      if (!tabStripRef.current) return;
      
      const activeTab = tabStripRef.current.querySelector('.tab.active');
      if (!activeTab) return;

      const stripRect = tabStripRef.current.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      
      const left = tabRect.left - stripRect.left;
      const width = tabRect.width;
      
      tabStripRef.current.style.setProperty('--tab-indicator-left', `${left}px`);
      tabStripRef.current.style.setProperty('--tab-indicator-width', `${width}px`);
    };

    // 初始计算
    updateTabIndicator();

    // 监听窗口大小变化
    window.addEventListener('resize', updateTabIndicator);
    
    // 延迟一下确保 DOM 已更新
    const timeout = setTimeout(updateTabIndicator, 100);

    return () => {
      window.removeEventListener('resize', updateTabIndicator);
      clearTimeout(timeout);
    };
  }, [activeFilter]);

  // 获取当前要显示的照片
  const displayedPhotos = useMemo(() => {
    return filteredPhotos.slice(0, displayedCount);
  }, [filteredPhotos, displayedCount]);

  // 是否还有更多照片可以加载
  const hasMore = displayedCount < filteredPhotos.length;

  // 加载更多照片
  const loadMore = useCallback(() => {
    if (isLoadingMore || displayedCount >= filteredPhotos.length) return;
    setIsLoadingMore(true);
    // 模拟加载延迟，提供更好的用户体验
    setTimeout(() => {
      setDisplayedCount((prev) => Math.min(prev + 12, filteredPhotos.length));
      setIsLoadingMore(false);
    }, 300);
  }, [isLoadingMore, displayedCount, filteredPhotos.length]);

  // 使用 Intersection Observer 实现无限滚动
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && hasMore) {
          loadMore();
        }
      },
      {
        rootMargin: '200px', // 提前200px开始加载
        threshold: 0.1,
      }
    );

    observer.observe(loadMoreRef.current);

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [hasMore, isLoadingMore, loadMore]);

  // 发现视图主地图：使用高德 JS API，而不是 MapLibre（仅在发现视图时初始化）
  useEffect(() => {
    // 只在发现视图时初始化地图
    if (activeView !== 'explore-view') {
      // 如果切换到图库视图，清理地图
      if (mapInstance.current) {
        setIsMapReady(false);
        if (typeof mapInstance.current.destroy === 'function') {
          mapInstance.current.destroy();
        }
        mapInstance.current = null;
      }
      return;
    }

    if (!mapContainerRef.current || mapInstance.current) return;

    const initGaodeMap = async () => {
      const amapKey = getEnvValue('VITE_AMAP_KEY', '');
      if (!amapKey) {
        // 配置缺失，静默处理
        return;
      }

      // 确保容器已准备好
      if (!mapContainerRef.current) {
        setTimeout(initGaodeMap, 100);
        return;
      }

      const ensureAMapLoaded = () =>
        new Promise((resolve, reject) => {
          if (window.AMap && window.AMap.Map) {
            resolve();
            return;
          }
          const existing = document.querySelector('script[data-amap-sdk]');
          if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', (e) => reject(e));
            return;
          }
          const script = document.createElement('script');
          script.src = `https://webapi.amap.com/maps?v=2.0&key=${amapKey}`;
          script.async = true;
          script.setAttribute('data-amap-sdk', 'true');
          script.onload = () => resolve();
          script.onerror = (e) => reject(e);
          document.head.appendChild(script);
        });

      try {
        await ensureAMapLoaded();
        const AMap = window.AMap;

        // 再次检查容器是否存在
        if (!mapContainerRef.current) {
          throw handleError(new Error('地图容器在初始化时不存在'), {
            context: 'initGaodeMap.container',
            type: ErrorType.VALIDATION,
          });
        }

        const map = new AMap.Map(mapContainerRef.current, {
          viewMode: '2D',
          zoom: 3.2,
          center: [105, 35], // 以中国为视觉中心
          resizeEnable: true,
          mapStyle: 'amap://styles/whitesmoke', // 干净的浅色主题
        });

        mapInstance.current = map;
        setIsMapReady(true);
        
        // 确保地图正确显示
        setTimeout(() => {
          if (mapInstance.current) {
            mapInstance.current.resize();
          }
        }, 100);
      } catch (error) {
        handleError(error, {
          context: 'initGaodeMap',
          type: ErrorType.NETWORK,
          silent: false,
        });
          }
    };

    // 延迟初始化，确保 DOM 已渲染
    const timer = setTimeout(() => {
    initGaodeMap();
    }, 50);

    return () => {
      clearTimeout(timer);
      setIsMapReady(false);
      if (mapInstance.current && typeof mapInstance.current.destroy === 'function') {
        mapInstance.current.destroy();
        mapInstance.current = null;
          }
    };
  }, [activeView]);

  // 在高德地图上绘制主题色小圆点，点击弹出该地点的图片面板（仅在发现视图）
  useEffect(() => {
    if (activeView !== 'explore-view') return;
    if (!isMapReady || !mapInstance.current || !window.AMap) return;

    const AMap = window.AMap;
    const map = mapInstance.current;

    // 清除旧的自定义标记
    exploreMarkersRef.current.forEach((marker) => marker.setMap(null));
    exploreMarkersRef.current = [];

    if (!photosByLocation || photosByLocation.length === 0) return;

    const palette = ['#cfa56a', '#111218', '#9b9dad', '#d48a48'];
    const markerElements = []; // 保存元素引用用于动画

    // 批量创建标记，提高性能
    photosByLocation.forEach((group, index) => {
      const el = document.createElement('div');
      el.className = 'explore-marker';
      const color = palette[index % palette.length];
      el.style.cssText = `
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: ${color};
        border: 2px solid #ffffff;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.35), 0 6px 12px rgba(0,0,0,0.25);
        cursor: pointer;
        transition: transform 0.2s ease, opacity 0.2s ease;
        opacity: 0;
        transform: scale(0);
      `;

      const marker = new AMap.Marker({
        position: [group.lng, group.lat],
        content: el,
        offset: new AMap.Pixel(-6, -6),
        map,
      });

      el.addEventListener('click', () => {
        showLocationPanel({
          title: group.location || group.country || '未命名地点',
          subtitle: group.country
            ? group.location
              ? `${group.country} · ${group.location}`
              : group.country
            : '',
          photos: group.photos,
          emptyMessage: group.photos.length === 0 ? '当前地点暂时没有图库照片' : '',
        });
      });

      exploreMarkersRef.current.push(marker);
      markerElements.push(el);
    });

    // 批量添加出现动画，第一个立即显示，其余快速依次出现
    markerElements.forEach((el, index) => {
      if (index === 0) {
        // 第一个标记立即显示
        requestAnimationFrame(() => {
          el.style.opacity = '1';
          el.style.transform = 'scale(1)';
        });
      } else {
        // 其余标记快速依次出现
        setTimeout(() => {
          el.style.opacity = '1';
          el.style.transform = 'scale(1)';
        }, index * 10); // 每个标记延迟10ms，更快地依次出现
      }
    });
  }, [photosByLocation, activeView, isMapReady, showLocationPanel]);

  // 当前浏览器位置：在地图上显示一个浅蓝色小圆点（仅在发现视图）
  useEffect(() => {
    if (activeView !== 'explore-view') {
      // 如果不在发现视图，清除标记
      if (currentLocationMarkerRef.current) {
        currentLocationMarkerRef.current.setMap(null);
        currentLocationMarkerRef.current = null;
      }
      return;
    }
    
    if (!isMapReady || !mapInstance.current || !window.AMap) return;
    if (!browserLocation) {
      console.log('等待浏览器位置...');
      return;
    }

    const AMap = window.AMap;

    // 清除旧标记
    if (currentLocationMarkerRef.current) {
      currentLocationMarkerRef.current.setMap(null);
      currentLocationMarkerRef.current = null;
    }

    const el = document.createElement('div');
    el.className = 'current-location-marker';
    el.style.cssText = `
      width: 12px;
      height: 12px;
      border-radius: 999px;
      background: rgba(80, 155, 255, 0.9);
      border: 2px solid #ffffff;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.3), 0 4px 10px rgba(0,0,0,0.25);
      position: relative;
      z-index: 1000;
      display: block;
    `;

    const marker = new AMap.Marker({
      position: [browserLocation.lon, browserLocation.lat],
      content: el,
      offset: new AMap.Pixel(-6, -6),
      map: mapInstance.current,
      zIndex: 1000, // 确保标记在最上层
    });

    currentLocationMarkerRef.current = marker;
    console.log('当前位置标记已创建:', browserLocation);

    return () => {
      if (currentLocationMarkerRef.current) {
        currentLocationMarkerRef.current.setMap(null);
        currentLocationMarkerRef.current = null;
      }
    };
  }, [browserLocation, isMapReady, activeView]);

  // 发现视图下：确保地图铺满整个视口（header浮在上方）
  useEffect(() => {
    if (activeView !== 'explore-view') return;

    const adjustMapSize = () => {
      const mapWrapper = document.querySelector('.explore-fullscreen .map-wrapper');
      const mapCanvas = document.querySelector('.explore-fullscreen #mapCanvas');
      const exploreView = document.querySelector('.explore-fullscreen #explore-view');

      if (mapWrapper) {
        mapWrapper.style.top = '0';
        mapWrapper.style.height = '100vh';
      }
      if (mapCanvas) {
        mapCanvas.style.top = '0';
        mapCanvas.style.height = '100vh';
      }
      if (exploreView) {
        exploreView.style.top = '0';
        exploreView.style.height = '100vh';
      }

      // 延迟resize地图，确保样式已应用
      setTimeout(() => {
        if (mapInstance.current) {
          mapInstance.current.resize();
        }
      }, 100);
    };

    // 初始调整
    const timeout = setTimeout(adjustMapSize, 100);

    // 监听窗口大小变化
    window.addEventListener('resize', adjustMapSize);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', adjustMapSize);
    };
  }, [activeView, mapInstance.current]);

  useEffect(() => {
    if (!mapInstance.current) return;
    const timeout = setTimeout(() => {
      mapInstance.current.resize();
    }, 300);
    return () => clearTimeout(timeout);
  }, [activeView]);

  // 初始化地理位置弹窗中的地图
  useEffect(() => {
    if (!geoMapContainerRef.current || !getGeoInfo || metaPopover?.tab !== 'geo') {
      // 如果弹窗关闭或没有地理信息，清理地图
      if (geoMapInstance.current) {
        geoMapInstance.current.remove();
        geoMapInstance.current = null;
      }
      return;
    }

    const lat = getGeoInfo.latitude;
    const lon = getGeoInfo.longitude;

    // 如果地图已存在，只更新标记和位置
    if (geoMapInstance.current) {
      // 移除所有标记
      const markers = geoMapInstance.current._markers || [];
      markers.forEach(marker => marker.remove());
      geoMapInstance.current._markers = [];

      // 移除连接线
      if (geoMapInstance.current.getLayer('connection-line')) {
        geoMapInstance.current.removeLayer('connection-line');
      }
      if (geoMapInstance.current.getSource('connection-line')) {
        geoMapInstance.current.removeSource('connection-line');
      }

      // 更新地图中心
      geoMapInstance.current.setCenter([lon, lat]);
    } else {
      // 使用高德地图瓦片服务（中文标注，做一层浅色调和）
      geoMapInstance.current = new maplibregl.Map({
        container: geoMapContainerRef.current,
        style: {
          version: 8,
          sources: {
            'gaode-tiles': {
              type: 'raster',
              tiles: [
                // 与主地图保持一致，使用浅色 whitesmoke 底图
                'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
                'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
                'https://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
                'https://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}'
              ],
              tileSize: 256,
              attribution: '© 高德地图'
            }
          },
          layers: [{
            id: 'gaode-tiles-layer',
            type: 'raster',
            source: 'gaode-tiles',
            minzoom: 3,
            maxzoom: 18
          }]
        },
        center: [lon, lat],
        zoom: 10,
        attributionControl: true,
      });

      geoMapInstance.current._markers = [];
    }

    // 添加标记的函数
    const addMarkers = () => {
      // 添加照片位置标记（红色）
      const photoMarkerEl = document.createElement('div');
      photoMarkerEl.className = 'custom-marker';
      photoMarkerEl.style.cssText = `
        width: 30px;
        height: 30px;
        background: #e74c3c;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
      `;

      const photoPopup = new maplibregl.Popup({ offset: 25 })
        .setHTML(`<strong>${lightboxPhoto?.title || '照片位置'}</strong><br>${getGeoInfo.place}`);

      const photoMarker = new maplibregl.Marker(photoMarkerEl)
        .setLngLat([lon, lat])
        .setPopup(photoPopup)
        .addTo(geoMapInstance.current);

      photoMarker.togglePopup();
      geoMapInstance.current._markers.push(photoMarker);

      // 如果浏览器位置可用，添加浏览器位置标记（蓝色）和连接线
      if (getGeoInfo.browserLocation) {
        const browserMarkerEl = document.createElement('div');
        browserMarkerEl.className = 'custom-marker';
        browserMarkerEl.style.cssText = `
          width: 30px;
          height: 30px;
          background: #3498db;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          cursor: pointer;
        `;

        const browserPopup = new maplibregl.Popup({ offset: 25 })
          .setHTML('<strong>当前位置</strong>');

        const browserMarker = new maplibregl.Marker(browserMarkerEl)
          .setLngLat([getGeoInfo.browserLocation.lon, getGeoInfo.browserLocation.lat])
          .setPopup(browserPopup)
          .addTo(geoMapInstance.current);

        browserMarker.togglePopup();
        geoMapInstance.current._markers.push(browserMarker);

        // 添加连接线
        geoMapInstance.current.addSource('connection-line', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [lon, lat],
                [getGeoInfo.browserLocation.lon, getGeoInfo.browserLocation.lat],
              ],
            },
          },
        });

        geoMapInstance.current.addLayer({
          id: 'connection-line',
          type: 'line',
          source: 'connection-line',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#e7b17c',
            'line-width': 2,
            'line-opacity': 0.6,
            'line-dasharray': [5, 10],
          },
        });
      }
    };

    // 如果地图已经加载，直接添加标记；否则等待加载完成
    if (geoMapInstance.current.loaded()) {
      addMarkers();
    } else {
      geoMapInstance.current.once('load', addMarkers);
    }

    return () => {
      if (geoMapInstance.current) {
        geoMapInstance.current.remove();
        geoMapInstance.current = null;
      }
    };
  }, [getGeoInfo, metaPopover?.tab, lightboxPhoto]);

  // 当弹窗打开时，调整地图大小
  useEffect(() => {
    if (metaPopover?.tab === 'geo' && geoMapInstance.current) {
      setTimeout(() => {
        geoMapInstance.current.resize();
      }, 100);
    }
  }, [metaPopover?.tab]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        if (metaPopover) {
          setMetaPopover(null);
        } else {
          setLightboxPhoto(null);
        }
      }
    };

    if (lightboxPhoto || metaPopover) {
      window.addEventListener('keydown', handleKey);
    }

    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [lightboxPhoto, metaPopover]);

  const openMetaPopover = (tab, event) => {
    const { clientX, clientY } = event;
    const offset = 18;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 根据标签类型调整估算尺寸
    const estimatedWidth = tab === 'geo' ? 520 : 260;
    const estimatedHeight = tab === 'geo' ? Math.min(600, viewportHeight * 0.9) : 220; // 地理位置弹窗需要更多高度，但不超过90vh

    let x, y;

    // 对于地理位置标签，使用智能定位（优先显示在点击位置附近，但确保完整可见）
    if (tab === 'geo') {
      // 尝试在点击位置右侧显示
      x = clientX + offset;
      
      // 如果右侧空间不够，放到左侧
      if (x + estimatedWidth > viewportWidth - 24) {
        x = clientX - estimatedWidth - offset;
      }
      
      // 如果左侧也不够，居中显示
      if (x < 12) {
        x = Math.max(12, (viewportWidth - estimatedWidth) / 2);
      }
      
      // 确保不超出右边界
      if (x + estimatedWidth > viewportWidth - 12) {
        x = viewportWidth - estimatedWidth - 12;
      }

      // 垂直方向：尝试在点击位置下方显示
      y = clientY + offset;
      
      // 如果下方空间不够，放到上方
      if (y + estimatedHeight > viewportHeight - 24) {
        y = clientY - estimatedHeight - offset;
      }
      
      // 如果上方也不够，居中显示
      if (y < 12) {
        y = Math.max(12, (viewportHeight - estimatedHeight) / 2);
      }
      
      // 确保不超出下边界
      if (y + estimatedHeight > viewportHeight - 12) {
        y = viewportHeight - estimatedHeight - 12;
      }
    } else {
      // 基本参数标签，使用原来的跟随鼠标逻辑
      x = clientX + offset;
      y = clientY + offset;

    // 如果靠右边，弹窗放到鼠标左侧
    if (x + estimatedWidth > viewportWidth - 24) {
      x = clientX - estimatedWidth - offset;
    }

      // 确保弹窗不超出左边界
      if (x < 12) {
        x = 12;
      }

    // 如果靠下边，弹窗放到鼠标上方
    if (y + estimatedHeight > viewportHeight - 24) {
      y = clientY - estimatedHeight - offset;
    }

      // 确保弹窗不超出上边界
      if (y < 12) {
        y = 12;
      }

      // 如果弹窗仍然超出下边界，调整到屏幕底部
      if (y + estimatedHeight > viewportHeight - 12) {
        y = viewportHeight - estimatedHeight - 12;
      }

    // 轻微上移，避免挡在参数行上
    y -= 12;
    }

    setMetaPopover({
      tab,
      x,
      y,
    });
  };

  return (
    <div className={`app-shell ${activeView === 'explore-view' ? 'explore-mode' : ''}`}>
      <header className="app-header">
        <div className="brand">
          {brandLogo ? (
            <img src={brandLogo} alt={`${brandText.siteTitle} logo`} className="brand-logo-img" />
          ) : (
            <div className="logo-mark" aria-hidden="true" />
          )}
          <div className="brand-copy">
            <div className="brand-name">{brandText.siteTitle}</div>
            <div className="brand-subtitle">{brandText.siteSubtitle}</div>
          </div>
        </div>
        {/* 顶部导航暂时不需要额外菜单项，仅保留占位容器 */}
        <nav className="primary-menu" />
        <div className={`view-toggle ${activeView === 'explore-view' ? 'explore-active' : ''}`}>
          <button
            className={`toggle-btn ${activeView === 'gallery-view' ? 'active' : ''}`}
            onClick={() => handleViewChange('gallery-view')}
          >
            <span className="toggle-icon">
              <svg className="icon-camera" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="18" height="18" aria-hidden="true">
                <path d="M533.333333 85.333333a42.666667 42.666667 0 1 1 0 85.333334h-174.933333c-48.490667 0-82.304 0.042667-108.629333 2.197333-25.813333 2.090667-40.64 6.037333-51.882667 11.754667a128 128 0 0 0-55.936 55.936c-5.717333 11.242667-9.664 26.069333-11.754667 51.882666C128.042667 318.762667 128 352.576 128 401.066667v221.866666c0 48.490667 0.042667 82.304 2.197333 108.629334 2.090667 25.813333 6.037333 40.64 11.754667 51.882666a128 128 0 0 0 55.936 55.936c11.242667 5.717333 26.069333 9.664 51.882667 11.776 26.325333 2.133333 60.138667 2.176 108.629333 2.176h307.2c48.490667 0 82.304-0.042667 108.629333-2.176 25.813333-2.133333 40.64-6.058667 51.882667-11.776a128 128 0 0 0 55.936-55.936c5.717333-11.242667 9.664-26.069333 11.776-51.882666 2.133333-26.325333 2.176-60.138667 2.176-108.629334V490.666667a42.666667 42.666667 0 1 1 85.333333 0v132.266666c0 47.082667 0.042667 84.970667-2.453333 115.562667-2.56 31.104-7.914667 58.432-20.8 83.690667a213.354667 213.354667 0 0 1-93.226667 93.226666c-25.258667 12.885333-52.586667 18.261333-83.690666 20.8-30.592 2.496-68.48 2.453333-115.562667 2.453334H358.4c-47.082667 0-84.970667 0.042667-115.562667-2.453334-31.104-2.56-58.410667-7.914667-83.690666-20.8a213.333333 213.333333 0 0 1-93.226667-93.226666c-12.885333-25.258667-18.261333-52.586667-20.8-83.690667C42.624 707.904 42.666667 670.016 42.666667 622.933333V401.066667c0-47.082667-0.042667-84.970667 2.453333-115.562667 2.56-31.104 7.914667-58.410667 20.8-83.690667a213.333333 213.333333 0 0 1 93.226667-93.226666c25.28-12.885333 52.586667-18.261333 83.690666-20.8C273.429333 85.290667 311.317333 85.333333 358.4 85.333333H533.333333z" fill="currentColor" fillOpacity="0.88" />
                <path d="M512 298.666667c117.824 0 213.333333 95.509333 213.333333 213.333333s-95.509333 213.333333-213.333333 213.333333-213.333333-95.509333-213.333333-213.333333 95.509333-213.333333 213.333333-213.333333z m0 85.333333a128 128 0 1 0 0 256 128 128 0 0 0 0-256z" fill="currentColor" fillOpacity="0.88" />
                <path d="M790.314667 64.810667c6.250667-19.925333 34.453333-19.925333 40.704 0l27.306666 86.912a21.333333 21.333333 0 0 0 13.952 13.952l86.912 27.306666c19.904 6.250667 19.904 34.453333 0 40.704l-86.933333 27.306667a21.376 21.376 0 0 0-13.952 13.973333l-27.306667 86.912c-6.250667 19.904-34.432 19.904-40.682666 0l-27.306667-86.933333a21.354667 21.354667 0 0 0-13.952-13.973333l-86.912-27.306667c-19.925333-6.229333-19.925333-34.432 0-40.682667l86.912-27.306666a21.333333 21.333333 0 0 0 13.952-13.952l27.306667-86.912z" fill="currentColor" fillOpacity="0.88" />
              </svg>
            </span>
            <span className="toggle-label">图库</span>
          </button>
          <button
            className={`toggle-btn ${activeView === 'explore-view' ? 'active' : ''}`}
            onClick={() => handleViewChange('explore-view')}
          >
            <span className="toggle-icon">
              <svg className="icon-compass" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="18" height="18" aria-hidden="true">
                <path d="M361.152 421.482667a42.666667 42.666667 0 0 1 0 60.352l-150.848 150.826666a128 128 0 0 0 181.013333 181.034667l1.493334-1.493333a42.666667 42.666667 0 0 1 60.352 60.330666l-1.493334 1.493334c-83.328 83.328-218.389333 83.328-301.717333 0-83.306667-83.306667-83.306667-218.368 0-301.696l150.869333-150.826667a42.666667 42.666667 0 0 1 60.330667 0z" fill="currentColor" fillOpacity="0.88" />
                <path d="M602.517333 300.8a42.666667 42.666667 0 0 1-60.352 60.352l-150.826666-150.848a128 128 0 0 0-181.034667 181.013333l1.493333 1.493334A42.666667 42.666667 0 1 1 151.466667 453.184l-1.493334-1.493333c-83.328-83.328-83.328-218.389333 0-301.717334 83.306667-83.306667 218.368-83.306667 301.696 0l150.826667 150.869334zM874.026667 572.330667c83.328 83.328 83.328 218.389333 0 301.717333-83.306667 83.306667-218.368 83.306667-301.696 0l-150.826667-150.848a42.666667 42.666667 0 0 1 60.330667-60.352l150.826666 150.848a128 128 0 1 0 181.034667-181.013333l-1.493333-1.493334a42.666667 42.666667 0 1 1 60.330666-60.352l1.493334 1.493334zM572.330667 451.669333a85.333333 85.333333 0 1 1-120.661334 120.661334 85.333333 85.333333 0 0 1 120.661334-120.661334z" fill="currentColor" fillOpacity="0.88" />
                <path d="M874.026667 149.973333c83.328 83.306667 83.328 218.368 0 301.696l-150.826667 150.826667a42.666667 42.666667 0 1 1-60.352-60.330667l150.848-150.826666a128 128 0 0 0-181.013333-181.034667l-1.493334 1.493333a42.666667 42.666667 0 0 1-60.373333-60.330666l1.514667-1.493334c83.328-83.328 218.389333-83.328 301.717333 0z" fill="currentColor" fillOpacity="0.88" />
              </svg>
            </span>
            <span className="toggle-label">发现</span>
          </button>
        </div>
      </header>

      <main className={activeView === 'explore-view' ? 'explore-fullscreen' : ''}>
        {supabase && supabaseError && (
          <div
            style={{
              margin: '0 0 16px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--warning)',
              fontSize: '0.9rem',
            }}
          >
            {supabaseError}
          </div>
        )}
        <section id="gallery-view" className={`screen ${activeView === 'gallery-view' ? 'active' : ''}`}>
          {filteredPhotos.length > 0 && (
          <>
          <div className="tab-strip" ref={tabStripRef}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab ${activeFilter === tab.id ? 'active' : ''}`}
                onClick={() => setActiveFilter(tab.id)}
              >
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="gallery-grid">
                {displayedPhotos.map((item) => {
                  const liked = likedPhotoIds.includes(item.id);
                  const likeCount = typeof item.likes === 'number' ? item.likes : 0;
                  return (
                  <article
                    key={item.id}
                    className="photo-card"
                    onClick={() => setLightboxPhoto(item)}
                  >
                    {item.image ? (
                      <img 
                        src={item.thumbnail || item.image} 
                        alt={item.title} 
                        loading="lazy"
                        onError={(e) => {
                          handleError(new Error(`图片加载失败: ${item.title}`), {
                            context: 'GalleryPage.imageLoad',
                            type: ErrorType.NETWORK,
                            silent: true,
                          });
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div style={{ 
                        width: '100%', 
                        height: '200px', 
                        background: 'var(--panel)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        color: 'var(--muted)'
                      }}>
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
                          handleToggleLike(item);
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
                      minHeight: '100px'
                    }}
                  >
                    {isLoadingMore ? (
                      <div style={{ 
                        color: 'var(--muted)', 
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <span style={{
                          display: 'inline-block',
                          width: '16px',
                          height: '16px',
                          border: '2px solid var(--muted)',
                          borderTopColor: 'transparent',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite'
                        }}></span>
                        加载更多照片...
                      </div>
                    ) : (
                      <button
                        onClick={loadMore}
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
                          boxShadow: 'var(--shadow-soft)'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.transform = 'translateY(-2px)';
                          e.target.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.transform = 'translateY(0)';
                          e.target.style.boxShadow = 'var(--shadow-soft)';
                        }}
                      >
                        加载更多 ({filteredPhotos.length - displayedCount} 张)
                      </button>
                    )}
                  </div>
                )}
                {/* 显示已加载所有照片的提示 */}
                {!hasMore && displayedPhotos.length > 0 && (
                  <div style={{ 
                    gridColumn: '1 / -1', 
                    textAlign: 'center', 
                    color: 'var(--muted)', 
                    padding: '40px 20px',
                    fontSize: '0.9rem'
                  }}>
                    已显示全部 {filteredPhotos.length} 张照片
                  </div>
                )}
              </div>
              </>
            )}
        </section>

        {activeView === 'explore-view' && (
          <section id="explore-view" className="screen active">
            <aside className={`curation-panel ${isPanelCollapsed ? 'collapsed' : ''}`}>
              <button
                className="curation-panel-toggle"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('Toggle clicked, current state:', isPanelCollapsed);
                  setIsPanelCollapsed(prev => {
                    const newState = !prev;
                    console.log('Setting collapsed to:', newState);
                    return newState;
                  });
                }}
                aria-label={isPanelCollapsed ? '展开面板' : '收起面板'}
                type="button"
              >
                <span className={`curation-panel-toggle-icon ${isPanelCollapsed ? 'collapsed' : ''}`}></span>
              </button>
              {curationGroups.map((group, index) => (
                <div key={group.id} className="curation-category">
                  <button
                    className="curation-category-header"
                    onClick={() => {
                      if (!isPanelCollapsed) {
                        setExpandedCategories((prev) => ({
                          ...prev,
                          [group.id]: !prev[group.id],
                        }));
                      }
                    }}
                  >
                    <h3 className="curation-category-title">{group.title}</h3>
                    <span
                      className={`curation-category-arrow ${
                        expandedCategories[group.id] ? 'expanded' : ''
                      }`}
                    />
                  </button>
                  {!isPanelCollapsed && expandedCategories[group.id] && (
                    <div className="curation-category-content">
                      {group.items.map((item) => {
                        const isActiveCity =
                          activeCitySelection?.provinceId === group.id &&
                          activeCitySelection?.cityId === item.id;
                        const cityCount = item.photoCount ?? 0;
                        return (
                          <article
                            key={item.id}
                            className={`curation-card ${isActiveCity ? 'active' : ''}`}
                            onMouseMove={handleCurationCardMouseMove}
                            onMouseLeave={handleCurationCardMouseLeave}
                            onClick={() => handleCityCardClick(group, item)}
                            role="button"
                            tabIndex={0}
                            aria-pressed={isActiveCity}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleCityCardClick(group, item);
                              }
                            }}
                          >
                <figure>
                              <img src={item.image} alt={item.label} loading="lazy" />
                              <div className="curation-card-label">
                                {cityCount > 0 ? `${item.label} · ${cityCount} 张` : item.label}
                </div>
                            </figure>
              </article>
                        );
                      })}
                    </div>
                  )}
                </div>
            ))}
          </aside>
          <div className="map-wrapper">
            <div id="mapCanvas" ref={mapContainerRef}></div>
          </div>
        </section>
        )}
      </main>

      {locationPanel && (
        <div
          className="location-panel-backdrop"
          onClick={() => setLocationPanel(null)}
        >
          <div
            className="location-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="location-panel-header">
              <div>
                <h3 className="location-panel-title">{locationPanel.title}</h3>
                {locationPanel.subtitle && (
                  <p className="location-panel-subtitle">{locationPanel.subtitle}</p>
                )}
              </div>
              <button
                className="location-panel-close"
                aria-label="关闭"
                onClick={() => setLocationPanel(null)}
              >
                ×
              </button>
            </div>
            <div className="location-panel-body">
              {locationPanel.photos.length === 0 ? (
                <div className="location-panel-empty">
                  {locationPanel.emptyMessage || '当前没有可用的图库照片'}
                </div>
              ) : (
                <div className="location-panel-grid">
                  {locationPanel.photos.map((p) => (
                    <img
                      key={p.id}
                      src={p.thumbnail || p.image}
                      alt={p.title}
                      loading="lazy"
                      onClick={() => {
                        setLightboxPhoto(p);
                        setLocationPanel(null);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className={`lightbox ${lightboxPhoto ? 'active' : ''}`}
        aria-hidden={lightboxPhoto ? 'false' : 'true'}
        onClick={(e) => {
          // 如果点击的是lightbox本身（不是子元素），才关闭
          if (e.target === e.currentTarget) {
            setLightboxPhoto(null);
            setShowMobileMeta(false);
          }
        }}
      >
        <button 
          className="lightbox-close" 
          aria-label="关闭" 
          onClick={(e) => {
            e.stopPropagation();
            setLightboxPhoto(null);
            setShowMobileMeta(false);
          }}
        >
          &times;
        </button>
        <div
          className="lightbox-panel"
          style={{
            backgroundImage: lightboxPhoto ? `url(${lightboxPhoto.image})` : 'none',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`lightbox-content-wrapper ${showMobileMeta ? 'meta-visible' : ''}`}>
          <div 
            className="lightbox-media"
            onClick={() => {
              // 手机端点击照片时切换参数显示
              if (window.innerWidth <= 768) {
                setShowMobileMeta(prev => !prev);
              }
            }}
          >
            {lightboxPhoto && <img src={lightboxPhoto.image} alt={lightboxPhoto.title} />}
          </div>
          {lightboxPhoto && (
            <div className={`lightbox-meta ${showMobileMeta ? 'mobile-visible' : ''}`}>
                <div className="lightbox-title-section">
                <h3>{lightboxPhoto.title}</h3>
                <p className="subtitle">
                  {lightboxPhoto.country} · {lightboxPhoto.location}
                </p>
              </div>
                <div 
                  className="lightbox-params-grid"
                  onClick={(e) => {
                    // 手机端点击参数区域时也切换显示（避免误触关闭）
                    if (window.innerWidth <= 768) {
                      e.stopPropagation();
                    }
                  }}
                >
                <div
                    className="lightbox-param-card"
                  onClick={(event) => {
                    openMetaPopover('basic', event);
                  }}
                >
                    <span className="param-label">焦距</span>
                    <span className="param-value">{lightboxPhoto.focal}</span>
                </div>
                <div
                    className="lightbox-param-card"
                  onClick={(event) => {
                    openMetaPopover('basic', event);
                  }}
                >
                    <span className="param-label">光圈</span>
                    <span className="param-value">{lightboxPhoto.aperture}</span>
                </div>
                <div
                    className="lightbox-param-card"
                  onClick={(event) => {
                    openMetaPopover('basic', event);
                  }}
                >
                    <span className="param-label">快门</span>
                    <span className="param-value">{lightboxPhoto.shutter}</span>
                </div>
                <div
                    className="lightbox-param-card"
                  onClick={(event) => {
                    openMetaPopover('basic', event);
                  }}
                >
                    <span className="param-label">ISO</span>
                    <span className="param-value">{lightboxPhoto.iso}</span>
                </div>
                <div
                    className="lightbox-param-card"
                  onClick={(event) => {
                    openMetaPopover('basic', event);
                  }}
                >
                    <span className="param-label">相机</span>
                    <span className="param-value">{lightboxPhoto.camera}</span>
                </div>
                <div
                    className="lightbox-param-card"
                  onClick={(event) => {
                    openMetaPopover('basic', event);
                  }}
                >
                    <span className="param-label">镜头</span>
                    <span className="param-value">{lightboxPhoto.lens}</span>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        {lightboxPhoto && metaPopover && (
          <div
            className="meta-popover-backdrop"
            onClick={(e) => {
              e.stopPropagation(); // 阻止事件冒泡到lightbox
              setMetaPopover(null);
            }}
          >
            <aside
              className="meta-popover"
              style={{
                left: `${metaPopover.x}px`,
                top: `${metaPopover.y}px`,
                backgroundImage: lightboxPhoto ? `url(${lightboxPhoto.image})` : 'none',
                maxWidth: metaPopover.tab === 'geo' ? '520px' : '320px',
                width: metaPopover.tab === 'geo' ? '520px' : 'auto',
                maxHeight: metaPopover.tab === 'geo' ? '85vh' : 'auto',
                overflowY: metaPopover.tab === 'geo' ? 'auto' : 'hidden',
                overflowX: 'hidden',
                transform: 'none',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="meta-sidepanel-header">
                <div className="meta-tabs">
                  <button
                    className={`meta-tab ${metaPopover.tab === 'basic' ? 'active' : ''}`}
                    onClick={() => setMetaPopover((prev) => ({ ...prev, tab: 'basic' }))}
                  >
                    基本参数
                  </button>
                  <button
                    className={`meta-tab ${metaPopover.tab === 'geo' ? 'active' : ''}`}
                    onClick={() => setMetaPopover((prev) => ({ ...prev, tab: 'geo' }))}
                  >
                    地理位置
                  </button>
                </div>
                <button className="meta-close" onClick={() => setMetaPopover(null)} aria-label="关闭参数弹层">
                  ×
                </button>
              </header>

            {metaPopover.tab === 'basic' && (
              <div key="basic" className="meta-panel-body">
                <div className="meta-card-grid">
                  <article className="meta-card">
                    <p className="meta-card-label">评级</p>
                    {(() => {
                      const rating = lightboxPhoto?.rating ?? 7;
                      const clamped = Math.max(1, Math.min(10, rating));
                      return (
                    <div className="meta-rating-circle">
                          <div className="meta-rating-number">{clamped}</div>
                      <div className="meta-rating-stars-circle">
                            {Array.from({ length: clamped }, (_, i) => {
                          const angle = (360 / clamped) * i;
                          const radius = 28;
                          const x = Math.cos((angle - 90) * Math.PI / 180) * radius;
                          const y = Math.sin((angle - 90) * Math.PI / 180) * radius;
                          return (
                            <span
                              key={i}
                              className="meta-star-circle"
                              style={{
                                position: 'absolute',
                                left: `calc(50% + ${x}px)`,
                                top: `calc(50% + ${y}px)`,
                                transform: 'translate(-50%, -50%)',
                              }}
                            >
                              ★
                            </span>
                          );
                        })}
                      </div>
                    </div>
                      );
                    })()}
                  </article>
                  <article className="meta-card">
                    <p className="meta-card-label">拍摄于</p>
                    {(() => {
                      const { yearsAgoText, dateText } = getShotTimeInfo(lightboxPhoto.shotDate || lightboxPhoto.shot_date);
                      return (
                        <>
                          <p className="meta-card-main">{yearsAgoText}</p>
                          <p className="meta-card-sub">{dateText}</p>
                        </>
                      );
                    })()}
                  </article>
                  <article className="meta-card">
                    <p className="meta-card-label">光圈</p>
                    <p className="meta-card-main">{lightboxPhoto.aperture}</p>
                  </article>
                  <article className="meta-card">
                    <p className="meta-card-label">快门</p>
                    <p className="meta-card-main">{lightboxPhoto.shutter}</p>
                  </article>
                  <article className="meta-card">
                    <p className="meta-card-label">焦距</p>
                    <p className="meta-card-main">{lightboxPhoto.focal}</p>
                  </article>
                  <article className="meta-card">
                    <p className="meta-card-label">感光度</p>
                    <p className="meta-card-main">{lightboxPhoto.iso}</p>
                  </article>
                </div>
              </div>
            )}

            {metaPopover.tab === 'geo' && (
              <div key="geo" className="meta-panel-body" style={{ maxHeight: 'calc(90vh - 80px)', overflowY: 'auto' }}>
                {getGeoInfo ? (
                  <>
                    {/* 地图显示在顶部 */}
                    <div 
                      ref={geoMapContainerRef} 
                      className="geo-map-container"
                      style={{ 
                        width: '100%', 
                        height: '240px', 
                        minHeight: '240px',
                        marginBottom: '16px',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: '1px solid var(--border)',
                        flexShrink: 0
                      }}
                    />
                    {/* 地点信息 */}
                    <div style={{ 
                      marginBottom: '16px',
                      padding: '12px',
                      background: 'rgba(255, 255, 255, 0.7)',
                      backdropFilter: 'blur(10px)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.3)'
                    }}>
                      <p style={{ 
                        margin: 0, 
                        fontSize: '0.95rem', 
                        color: 'var(--text)',
                        fontWeight: '500'
                      }}>
                        {getGeoInfo.place}
                      </p>
                    </div>
                    {/* 地理数据卡片 */}
                  <div className="meta-card-grid">
                    <article className="meta-card">
                      <p className="meta-card-label">纬度</p>
                      <p className="meta-card-main">{getGeoInfo.latDms}</p>
                      <p className="meta-card-sub">{getGeoInfo.lat}</p>
                    </article>
                    <article className="meta-card">
                      <p className="meta-card-label">经度</p>
                      <p className="meta-card-main">{getGeoInfo.lonDms}</p>
                      <p className="meta-card-sub">{getGeoInfo.lon}</p>
                    </article>
                    <article className="meta-card">
                      <p className="meta-card-label">海拔高度</p>
                      <p className="meta-card-main">{getGeoInfo.altitude}</p>
                    </article>
                    <article className="meta-card">
                      <p className="meta-card-label">距离</p>
                      <p className="meta-card-main">{getGeoInfo.distance}</p>
                        {getGeoInfo.browserLocation && (
                          <p className="meta-card-sub">距当前位置</p>
                        )}
                    </article>
                  </div>
                  </>
                ) : (
                  <div className="meta-card-grid">
                    <article className="meta-card meta-card-wide">
                      <p className="meta-card-label">地点</p>
                      <p className="meta-card-main">暂无地理位置信息</p>
                    </article>
                  </div>
                )}
              </div>
            )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}


