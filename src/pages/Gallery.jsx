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
} from '../utils/branding';

// 从localStorage加载审核通过的作品
const loadApprovedPhotos = () => {
  try {
    const stored = localStorage.getItem('camarts_approved_photos');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load approved photos:', error);
  }
  return [];
};

const mapSupabaseRowToGalleryPhoto = (row) => ({
  id: row.id,
  title: row.title || '',
  country: row.country || '',
  location: row.location || '',
  category: row.category || 'featured',
  image: row.image_url || '',
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
  thumbnail: row.thumbnail_url || row.thumbnail || '',
  hidden: row.hidden ?? false,
  shotDate: row.shot_date || null,
  rating: typeof row.rating === 'number' ? row.rating : null,
});

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
  { id: 'hebei', title: '河北', cities: ['石家庄', '唐山', '秦皇岛'] },
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
  { id: 'gansu', title: '甘肃', cities: ['兰州', '张掖', '敦煌'] },
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
  { id: 'featured', label: '精选' },
  { id: 'latest', label: '最新' },
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
  const [activeFilter, setActiveFilter] = useState('featured');
  // 记住上次使用的视图：刷新后仍然停留在“发现”或“图库”
  const [activeView, setActiveView] = useState(() => {
    if (typeof window === 'undefined') return 'gallery-view';
    const stored = window.localStorage.getItem('camarts_active_view');
    return stored === 'explore-view' ? 'explore-view' : 'gallery-view';
  });
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [metaPopover, setMetaPopover] = useState(null); // { tab: 'basic' | 'geo', x, y }
  const [exifData, setExifData] = useState(null);
  const [approvedPhotos, setApprovedPhotos] = useState(() => (isSupabaseReady ? [] : loadApprovedPhotos()));
  const [supabaseError, setSupabaseError] = useState('');
  const [displayedCount, setDisplayedCount] = useState(12); // 初始显示的照片数量
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapInstance = useRef(null); // 发现页主地图：高德 Map 实例
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

  const cityPhotoMap = useMemo(() => {
    const map = new Map();
    if (!approvedPhotos || approvedPhotos.length === 0) return map;

    approvedPhotos.forEach((photo) => {
      const location = normalizeText(photo.location);
      const country = normalizeText(photo.country);

      provinceCityData.forEach((province) => {
        const targets = [...province.cities];
        if (MUNICIPALITY_PROVINCES.has(province.id)) {
          targets.push(province.title);
        }

        targets.forEach((cityName) => {
          const cityLower = normalizeText(cityName);
          if (!cityLower) return;
          if (location.includes(cityLower) || country.includes(cityLower)) {
            const key = `${province.id}-${cityName}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(photo);
          }
        });
      });
    });

    map.forEach((photos) =>
      photos.sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bt - at;
      }),
    );

    return map;
  }, [approvedPhotos]);

  const curationGroups = useMemo(() => {
    return provinceCityData
      .map((province) => {
        const targets = [...province.cities];
        if (MUNICIPALITY_PROVINCES.has(province.id)) targets.push(province.title);

        const items = targets
          .map((cityName) => {
            const key = `${province.id}-${cityName}`;
            const cityPhotos = cityPhotoMap.get(key);
            if (!cityPhotos || cityPhotos.length === 0) return null;
            const coords = cityMeta[cityName] || {};
            return {
              id: key,
              label: cityName,
              image: cityPhotos[0].thumbnail || cityPhotos[0].image,
              photoCount: cityPhotos.length,
              lat: coords.lat ?? null,
              lng: coords.lng ?? null,
              provinceId: province.id,
            };
          })
          .filter(Boolean);

        if (items.length === 0) return null;
        return {
          id: province.id,
          title: province.title,
          items,
        };
      })
      .filter(Boolean);
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
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('camarts_active_view', view);
    }
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
          setApprovedPhotos((data || []).map(mapSupabaseRowToGalleryPhoto));
          setSupabaseError('');
        }
      } catch (error) {
        console.error('从 Supabase 加载作品失败:', error);
        if (isMounted) {
          setSupabaseError(error.message || '加载云端作品失败');
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
          console.error('加载云端品牌配置失败:', error);
          return;
        }
        const record = Array.isArray(data) ? data[0] : null;
        if (!isMounted || !record) return;

        const remoteLogo = record.logo_data || record.logo_url || '';
        if (remoteLogo) {
          saveBrandLogo(remoteLogo);
          setBrandLogo(remoteLogo);
        }

        // 只在初始化时从远端合并文案，不会影响后台正在编辑的状态
        setBrandText((prev) => ({
          siteTitle: record.site_title || prev.siteTitle,
          siteSubtitle: record.site_subtitle || prev.siteSubtitle,
          adminTitle: record.admin_title || prev.adminTitle,
          adminSubtitle: record.admin_subtitle || prev.adminSubtitle,
        }));
      } catch (error) {
        console.error('加载云端品牌配置失败:', error);
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

    // 帮助函数：按创建时间从新到旧排序
    const sortByLatest = (list) =>
      [...list].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
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
        // 精选：所有作品，按最新排序
        return sortByLatest(allPhotos);
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
        console.warn('VITE_AMAP_KEY 未配置，跳过高德地图初始化');
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

        const map = new AMap.Map(mapContainerRef.current, {
          viewMode: '2D',
          zoom: 3.2,
          center: [105, 35], // 以中国为视觉中心
          resizeEnable: true,
          mapStyle: 'amap://styles/whitesmoke', // 干净的浅色主题
        });

        mapInstance.current = map;
        setIsMapReady(true);
      } catch (error) {
        console.error('初始化高德地图失败:', error);
          }
    };

    initGaodeMap();

    return () => {
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
              <span className="icon-camera" aria-hidden="true" />
            </span>
            <span className="toggle-label">图库</span>
          </button>
          <button
            className={`toggle-btn ${activeView === 'explore-view' ? 'active' : ''}`}
            onClick={() => handleViewChange('explore-view')}
          >
            <span className="toggle-icon">
              <span className="icon-compass" aria-hidden="true" />
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
          <div className="tab-strip">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab ${activeFilter === tab.id ? 'active' : ''}`}
                onClick={() => setActiveFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="gallery-grid">
                {displayedPhotos.map((item) => (
                  <article key={item.id} className="photo-card" onClick={() => setLightboxPhoto(item)}>
                    {item.image ? (
                      <img 
                        src={item.thumbnail || item.image} 
                        alt={item.title} 
                        loading="lazy"
                        onError={(e) => {
                          console.error('图片加载失败:', item.title, item.image);
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
                    </div>
                  </article>
                ))}
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
          }
        }}
      >
        <button 
          className="lightbox-close" 
          aria-label="关闭" 
          onClick={(e) => {
            e.stopPropagation();
            setLightboxPhoto(null);
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
          <div className="lightbox-content-wrapper">
          <div className="lightbox-media">
            {lightboxPhoto && <img src={lightboxPhoto.image} alt={lightboxPhoto.title} />}
          </div>
          {lightboxPhoto && (
            <div className="lightbox-meta">
                <div className="lightbox-title-section">
                <h3>{lightboxPhoto.title}</h3>
                <p className="subtitle">
                  {lightboxPhoto.country} · {lightboxPhoto.location}
                </p>
              </div>
                <div className="lightbox-params-grid">
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


