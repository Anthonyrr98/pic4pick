import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import exifr from 'exifr';
import '../App.css';
import { uploadImage, getUploadType, setUploadType, UPLOAD_TYPES } from '../utils/upload';
import { getSupabaseClient } from '../utils/supabaseClient';
import { UploadProgress } from '../components/UploadProgress';
import { getEnvValue, updateEnvOverrides, resetEnvOverrides, ENV_OVERRIDE_KEYS } from '../utils/envConfig';
import {
  BRAND_LOGO_EVENT,
  BRAND_LOGO_STORAGE_KEY,
  BRAND_LOGO_SUPABASE_ID,
  BRAND_LOGO_SUPABASE_TABLE,
  BRAND_LOGO_MAX_SIZE,
  getStoredBrandLogo,
  saveBrandLogo,
  removeBrandLogo,
  getStoredBrandText,
  saveBrandText,
  resetBrandText,
} from '../utils/branding';
import { Storage, StorageString, STORAGE_KEYS } from '../utils/storage';
import { handleError, formatErrorMessage, safeAsync, safeSync, ErrorType } from '../utils/errorHandler';
import { mapSupabaseRowToPhoto, buildSupabasePayloadFromPhoto, getUploadTypeName, extractOSSFileInfo, deleteOSSFile, getAmapApiUrl } from '../utils/adminUtils';
import { ensureHttps } from '../utils/urlUtils';
import { usePhotoManagement } from '../hooks/usePhotoManagement';
import { useLocationPicker } from '../hooks/useLocationPicker';
import { useGearOptions } from '../hooks/useGearOptions';
import { useBrandConfig } from '../hooks/useBrandConfig';
import { useFileUpload } from '../hooks/useFileUpload';
import { ToolsPanel } from '../components/admin/ToolsPanel';
import { ConfigPanel } from '../components/admin/ConfigPanel';

const tabs = [
  { id: 'featured', label: '精选' },
  { id: 'latest', label: '最新' },
  { id: 'random', label: '随览' },
  { id: 'nearby', label: '附近' },
  { id: 'far', label: '远方' },
];

// 使用统一的存储键常量
const STORAGE_KEY = STORAGE_KEYS.ADMIN_UPLOADS;
const APPROVED_STORAGE_KEY = STORAGE_KEYS.APPROVED_PHOTOS;
const REJECTED_STORAGE_KEY = STORAGE_KEYS.REJECTED_PHOTOS;

// getUploadTypeName 已移至 adminUtils.js

export function AdminPage() {
  const adminPassword = getEnvValue('VITE_ADMIN_PASSWORD', 'pic4pick-admin');

  // === 原有状态 ===
  // 从 localStorage 加载数据
  const loadFromStorage = () => {
    return Storage.get(STORAGE_KEY, []);
  };

  // mapSupabaseRowToPhoto 和 buildSupabasePayloadFromPhoto 已移至 adminUtils.js

  const supabase = getSupabaseClient();
  const [envConfigForm, setEnvConfigForm] = useState(() => ({
    supabaseUrl: getEnvValue('VITE_SUPABASE_URL', ''),
    supabaseAnonKey: getEnvValue('VITE_SUPABASE_ANON_KEY', ''),
    amapKey: getEnvValue('VITE_AMAP_KEY', ''),
  }));
  const [envConfigMessage, setEnvConfigMessage] = useState({ type: '', text: '' });
  const importFileInputRef = useRef(null);
  const logoFileInputRef = useRef(null);
  // 照片管理 hook 将在后面初始化（需要 refreshSupabaseData）
  const [uploadForm, setUploadForm] = useState({
    title: '',
    location: '',
    country: '',
    category: 'featured',
    tags: '',
    preview: '',
    file: null,
    uploadMode: 'file', // 'file' | 'url'
    imageUrl: '', // 原图直链 URL
    thumbnailUrl: '', // 缩略图直链 URL
    latitude: null,
    longitude: null,
    altitude: null,
    shotDate: '',
    rating: 7,
    focal: '',
    aperture: '',
    shutter: '',
    iso: '',
    camera: '',
    lens: '',
  });
  // 使用相机/镜头选项管理 hook
  const {
    cameraOptions,
    setCameraOptions,
    lensOptions,
    setLensOptions,
    showCameraDropdown,
    setShowCameraDropdown,
    showLensDropdown,
    setShowLensDropdown,
    addCameraOption,
    addLensOption,
  } = useGearOptions(supabase);

  const [isAdminAuthed, setIsAdminAuthed] = useState(() => {
    return StorageString.get(STORAGE_KEYS.ADMIN_AUTHED) === 'true';
  });
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const locationMapContainerRef = useRef(null);
  const locationMapInstance = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState(null); // { lat, lon }
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [submitMessage, setSubmitMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'pending' | 'approved' | 'rejected' | 'tools' | 'config'
  // 使用文件上传管理 hook
  const {
    isUploading,
    uploadProgress,
    uploadingFileName,
    uploadBytes,
    uploadFile,
    resetUploadState,
    setIsUploading,
    setUploadProgress,
    setUploadingFileName,
    setUploadBytes,
  } = useFileUpload();
  // 默认使用阿里云 OSS
  const [uploadType, setUploadTypeState] = useState(() => {
    const currentType = getUploadType();
    // 如果不是阿里云 OSS，自动设置为阿里云 OSS
    if (currentType !== UPLOAD_TYPES.ALIYUN_OSS) {
      setUploadType(UPLOAD_TYPES.ALIYUN_OSS);
      return UPLOAD_TYPES.ALIYUN_OSS;
    }
    return currentType;
  });
  const [isSupabaseLoading, setIsSupabaseLoading] = useState(Boolean(supabase));
  const [supabaseError, setSupabaseError] = useState('');
  // 使用品牌配置管理 hook
  const {
    brandLogo,
    setBrandLogo,
    logoMessage,
    setLogoMessage,
    brandText,
    setBrandText,
    brandTextMessage,
    setBrandTextMessage,
  } = useBrandConfig(supabase);

  // 工具：图片压缩模块状态（已移至 ToolsPanel 组件）

  // 照片管理 hook（先调用，获取 setter 函数）
  // 注意：refreshSupabaseData 稍后定义，使用 useRef 传递
  const refreshSupabaseDataRef = useRef(null);
  
  const {
    adminUploads,
    setAdminUploads,
    approvedPhotos,
    setApprovedPhotos,
    rejectedPhotos,
    setRejectedPhotos,
    handleApprove,
    handleReject,
    handleDelete,
    handleResubmit,
  } = usePhotoManagement(
    supabase, 
    async () => {
      if (refreshSupabaseDataRef.current) {
        await refreshSupabaseDataRef.current();
      }
    }, 
    setSubmitMessage
  );

  const pendingReviewCount = useMemo(() => adminUploads.length, [adminUploads]);

  // 切换上传目标存储（本地 / 阿里云 OSS 等）
  const handleUploadTypeChange = (type) => {
    setUploadType(type);           // 写入 localStorage
    setUploadTypeState(type);      // 更新当前页面状态
    setSubmitMessage({
      type: 'success',
      text: `已切换上传目标为：${getUploadTypeName(type)}`,
    });
    setTimeout(() => {
      setSubmitMessage({ type: '', text: '' });
    }, 2000);
  };

  // 调试：在开发环境打印高德 KEY 是否存在
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('VITE_AMAP_KEY in AdminPage:', getEnvValue('VITE_AMAP_KEY', '(undefined)'));
    }
  }, []);

  // loadGearPresets, loadRemoteBrandLogo, loadRemoteBrandText 等已移至对应的 hooks

  // 加载已审核通过的作品（已移至 usePhotoManagement hook）
  const loadApprovedPhotos = () => {
    const photos = Storage.get(APPROVED_STORAGE_KEY, []);
    // 确保所有 URL 都使用 HTTPS
    return photos.map(photo => ({
      ...photo,
      image: ensureHttps(photo.image || ''),
      thumbnail: ensureHttps(photo.thumbnail || photo.preview || ''),
      preview: ensureHttps(photo.preview || photo.thumbnail || ''),
    }));
  };

  const approvedCount = useMemo(() => approvedPhotos.length, [approvedPhotos]);
  
  // 加载已拒绝的作品（已移至 usePhotoManagement hook）
  const loadRejectedPhotos = () => {
    return Storage.get(REJECTED_STORAGE_KEY, []);
  };

  const rejectedCount = useMemo(() => rejectedPhotos.length, [rejectedPhotos]);
  
  // 编辑状态
  const [editingPhotoId, setEditingPhotoId] = useState(null);
  const [editForm, setEditForm] = useState({
    title: '',
    location: '',
    country: '',
    category: 'featured',
    latitude: null,
    longitude: null,
    altitude: null,
    focal: '',
    aperture: '',
    shutter: '',
    iso: '',
    camera: '',
    lens: '',
    shotDate: '',
    rating: 7,
    hidden: false,
  });
  
  // 编辑表单的地图选择器
  const [showEditLocationPicker, setShowEditLocationPicker] = useState(false);
  const editLocationMapContainerRef = useRef(null);
  const editLocationMapInstance = useRef(null);
  const [editSelectedLocation, setEditSelectedLocation] = useState(null);
  const [editLocationSearchQuery, setEditLocationSearchQuery] = useState('');
  const [isEditSearching, setIsEditSearching] = useState(false);
  const [editSearchResults, setEditSearchResults] = useState([]);

  // 分页和搜索状态
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const itemsPerPage = 20; // 每页显示20条

  // 筛选和搜索后的照片列表
  const filteredPhotos = useMemo(() => {
    let filtered = [...approvedPhotos];

    // 搜索筛选
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((item) => 
        item.title?.toLowerCase().includes(query) ||
        item.location?.toLowerCase().includes(query) ||
        item.country?.toLowerCase().includes(query) ||
        item.camera?.toLowerCase().includes(query) ||
        item.lens?.toLowerCase().includes(query)
      );
    }

    // 分类筛选
    if (filterCategory) {
      filtered = filtered.filter((item) => item.category === filterCategory);
    }

    return filtered;
  }, [approvedPhotos, searchQuery, filterCategory]);

  // 分页计算
  const totalPages = Math.ceil(filteredPhotos.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPhotos = filteredPhotos.slice(startIndex, endIndex);

  // .env.local 运行时配置
  const handleEnvConfigChange = (event) => {
    const { name, value } = event.target;
    setEnvConfigForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSaveEnvConfig = () => {
    updateEnvOverrides({
      VITE_SUPABASE_URL: envConfigForm.supabaseUrl,
      VITE_SUPABASE_ANON_KEY: envConfigForm.supabaseAnonKey,
      VITE_AMAP_KEY: envConfigForm.amapKey,
    });
    setEnvConfigMessage({ type: 'success', text: '配置已保存，已覆盖当前会话的 .env.local' });
    setTimeout(() => setEnvConfigMessage({ type: '', text: '' }), 3000);
  };

  const handleResetEnvConfig = () => {
    resetEnvOverrides(ENV_OVERRIDE_KEYS);
    setEnvConfigForm({
      supabaseUrl: getEnvValue('VITE_SUPABASE_URL', ''),
      supabaseAnonKey: getEnvValue('VITE_SUPABASE_ANON_KEY', ''),
      amapKey: getEnvValue('VITE_AMAP_KEY', ''),
    });
    setEnvConfigMessage({ type: 'info', text: '已恢复为 .env.local 默认值' });
    setTimeout(() => setEnvConfigMessage({ type: '', text: '' }), 3000);
  };

  const handleLogoUploadClick = () => {
    if (logoFileInputRef.current) {
      logoFileInputRef.current.value = '';
      logoFileInputRef.current.click();
    }
  };

  const handleLogoFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setLogoMessage({ type: 'error', text: '请上传图片文件（PNG / JPG / SVG）' });
      event.target.value = '';
      return;
    }

    if (file.size > BRAND_LOGO_MAX_SIZE) {
      setLogoMessage({ type: 'error', text: '图片过大，请控制在 1MB 以内' });
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        setLogoMessage({ type: 'error', text: '读取文件失败，请重试' });
        return;
      }
      try {
        if (supabase) {
          const payload = {
            id: BRAND_LOGO_SUPABASE_ID,
            logo_data: dataUrl,
            logo_mime: file.type || null,
            updated_by: 'admin-panel',
            updated_at: new Date().toISOString(),
          };
          const { error } = await supabase.from(BRAND_LOGO_SUPABASE_TABLE).upsert(payload);
          if (error) throw error;
        }
        saveBrandLogo(dataUrl);
        setBrandLogo(dataUrl);
        setLogoMessage({ type: 'success', text: supabase ? 'Logo 已上传并同步到云端' : 'Logo 已更新' });
      } catch (error) {
        const appError = handleError(error, {
          context: 'handleLogoUpload',
          type: ErrorType.STORAGE,
        });
        setLogoMessage({ type: 'error', text: `保存失败：${formatErrorMessage(appError)}` });
      }
    };
    reader.onerror = () => {
      setLogoMessage({ type: 'error', text: '读取文件失败，请重试' });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleResetLogo = async () => {
    try {
      if (supabase) {
        const { error } = await supabase
          .from(BRAND_LOGO_SUPABASE_TABLE)
          .delete()
          .eq('id', BRAND_LOGO_SUPABASE_ID);
        if (error) throw error;
      }
      removeBrandLogo();
      setBrandLogo('');
      setLogoMessage({ type: 'info', text: '已恢复默认圆环 Logo' });
    } catch (error) {
      const appError = handleError(error, {
        context: 'handleResetLogo',
        type: ErrorType.NETWORK,
      });
      setLogoMessage({ type: 'error', text: `重置失败：${formatErrorMessage(appError)}` });
    }
  };

  // 数据导出 / 导入
  const handleExportPhotos = async () => {
    try {
      let rows = [];

      if (supabase) {
        const { data, error } = await supabase.from('photos').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        rows = data || [];
      } else {
        const pending = adminUploads || [];
        const approved = loadApprovedPhotos() || [];
        rows = [...pending.map((p) => buildSupabasePayloadFromPhoto(p, p.status || 'pending'))];
        approved.forEach((p) => {
          rows.push({
            id: p.id,
            title: p.title,
            location: p.location,
            country: p.country,
            category: p.category,
            tags: p.mood || '',
            image_url: p.image,
            latitude: p.latitude,
            longitude: p.longitude,
            altitude: p.altitude,
            focal: p.focal,
            aperture: p.aperture,
            shutter: p.shutter,
            iso: p.iso,
            camera: p.camera,
            lens: p.lens,
            status: 'approved',
          });
        });
      }

      const payload = {
        exportedAt: new Date().toISOString(),
        version: 1,
        rows,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pic4pick_photos_backup_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSubmitMessage({ type: 'success', text: '数据已导出为 JSON 文件' });
      setTimeout(() => setSubmitMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      const appError = handleError(error, {
        context: 'handleExportData',
        type: ErrorType.UNKNOWN,
      });
      setSubmitMessage({ type: 'error', text: `导出失败：${formatErrorMessage(appError)}` });
    }
  };

  const handleImportClick = () => {
    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
      importFileInputRef.current.click();
    }
  };

  const handleImportPhotos = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const rows = Array.isArray(json) ? json : Array.isArray(json.rows) ? json.rows : [];
      if (!rows.length) {
        setSubmitMessage({ type: 'error', text: '导入文件中没有可用数据' });
        return;
      }

      if (supabase) {
        const { error } = await supabase.from('photos').upsert(rows, { onConflict: 'id' });
        if (error) throw error;
        await refreshSupabaseData();
      } else {
        const pending = rows.filter((r) => (r.status || 'pending') !== 'approved');
        const approved = rows.filter((r) => (r.status || 'pending') === 'approved');
        try {
          Storage.set(STORAGE_KEY, pending);
          Storage.set(APPROVED_STORAGE_KEY, approved);
        } catch (storageError) {
          handleError(storageError, {
            context: 'handleImportPhotos.storage',
            type: ErrorType.STORAGE,
            silent: true,
          });
        }
        setAdminUploads(pending.map((r) => mapSupabaseRowToPhoto(r)));
        setApprovedPhotos(approved.map((r) => mapSupabaseRowToPhoto(r)));
      }

      setSubmitMessage({ type: 'success', text: '数据导入成功' });
      setTimeout(() => setSubmitMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      const appError = handleError(error, {
        context: 'handleImportPhotos',
        type: ErrorType.PARSE,
      });
      setSubmitMessage({ type: 'error', text: `导入失败：${formatErrorMessage(appError)}` });
    }
  };

  // 当筛选条件改变时，重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterCategory]);

  // （登录功能已移除）

  // 初始化地图选择器
  useEffect(() => {
    if (!showLocationPicker || !locationMapContainerRef.current || locationMapInstance.current) return;

    // 默认中心点（如果已有选择的位置，使用该位置，否则使用浏览器位置或北京）
    let centerLat = 39.9042;
    let centerLon = 116.4074;
    let zoom = 5;

    if (selectedLocation) {
      centerLat = selectedLocation.lat;
      centerLon = selectedLocation.lon;
      zoom = 10;
    } else if (uploadForm.latitude && uploadForm.longitude) {
      centerLat = uploadForm.latitude;
      centerLon = uploadForm.longitude;
      zoom = 10;
    }

    // 使用高德地图瓦片服务（中文标注，稳定可靠）
    locationMapInstance.current = new maplibregl.Map({
      container: locationMapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'gaode-tiles': {
            type: 'raster',
            tiles: [
              'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
              'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
              'https://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
              'https://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
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
      center: [centerLon, centerLat],
      zoom: zoom,
      attributionControl: true,
    });

    locationMapInstance.current._marker = null;

    // 获取浏览器位置
    if ('geolocation' in navigator && !selectedLocation && !uploadForm.latitude) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          if (locationMapInstance.current) {
            locationMapInstance.current.setCenter([lon, lat]);
            locationMapInstance.current.setZoom(10);
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    // 等待地图加载完成
    locationMapInstance.current.once('load', () => {
      // 添加标记
      if (selectedLocation || (uploadForm.latitude && uploadForm.longitude)) {
        const lat = selectedLocation?.lat || uploadForm.latitude;
        const lon = selectedLocation?.lon || uploadForm.longitude;
        
        const markerEl = document.createElement('div');
        markerEl.className = 'custom-marker';
        markerEl.style.cssText = `
          width: 30px;
          height: 30px;
          background: #e74c3c;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          cursor: pointer;
        `;

        const popup = new maplibregl.Popup({ offset: 25 })
          .setHTML(`纬度: ${lat.toFixed(6)}<br>经度: ${lon.toFixed(6)}`);

        const marker = new maplibregl.Marker(markerEl)
          .setLngLat([lon, lat])
          .setPopup(popup)
          .addTo(locationMapInstance.current);

        marker.togglePopup();
        locationMapInstance.current._marker = marker;
      }

      // 地图点击事件
      locationMapInstance.current.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        setSelectedLocation({ lat, lon: lng });

        // 移除旧标记
        if (locationMapInstance.current._marker) {
          locationMapInstance.current._marker.remove();
        }

        // 添加新标记
        const markerEl = document.createElement('div');
        markerEl.className = 'custom-marker';
        markerEl.style.cssText = `
          width: 30px;
          height: 30px;
          background: #e74c3c;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          cursor: pointer;
        `;

        const popup = new maplibregl.Popup({ offset: 25 })
          .setHTML(`纬度: ${lat.toFixed(6)}<br>经度: ${lng.toFixed(6)}`);

        const marker = new maplibregl.Marker(markerEl)
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(locationMapInstance.current);

        marker.togglePopup();
        locationMapInstance.current._marker = marker;
      });
    });

    // 如果地图已经加载，直接触发 load 事件
    if (locationMapInstance.current.loaded()) {
      locationMapInstance.current.fire('load');
    }

    return () => {
      if (locationMapInstance.current) {
        locationMapInstance.current.remove();
        locationMapInstance.current = null;
      }
    };
  }, [showLocationPicker, selectedLocation, uploadForm.latitude, uploadForm.longitude]);

  // 当地图容器显示时，调整地图大小
  useEffect(() => {
    if (showLocationPicker && locationMapInstance.current) {
      setTimeout(() => {
        locationMapInstance.current.resize();
      }, 100);
    }
  }, [showLocationPicker]);

  // 生成高德地图 API URL（生产环境直接调用，开发环境使用代理）
  // getAmapApiUrl 已移至 adminUtils.js

  // 地理位置搜索函数（优先使用高德地图搜索 API，需要配置 VITE_AMAP_KEY）
  const searchLocation = useCallback(async (query, isEdit = false) => {
    if (!query.trim()) {
      if (isEdit) {
        setEditSearchResults([]);
      } else {
        setSearchResults([]);
      }
      return;
    }

    if (isEdit) {
      setIsEditSearching(true);
    } else {
      setIsSearching(true);
    }

    try {
      const amapKey = getEnvValue('VITE_AMAP_KEY', '');
      
      // 如果没有配置高德 key，直接清空结果并提示，不再访问国外服务
      if (!amapKey) {
        // 未配置 VITE_AMAP_KEY，高德地点搜索不可用（静默处理）
        if (isEdit) {
          setEditSearchResults([]);
        } else {
          setSearchResults([]);
        }
        return;
      }

        let allResults = [];
        
      // 1. 输入提示 API（Autocomplete）获取快速结果
        try {
        const autocompleteUrl = getAmapApiUrl(`/v3/assistant/inputtips?key=${amapKey}&keywords=${encodeURIComponent(
          query
        )}&city=&datatype=all`);
          const autocompleteResponse = await fetch(autocompleteUrl);
          
          if (autocompleteResponse.ok) {
            const autocompleteData = await autocompleteResponse.json();
            
          if (
            autocompleteData.status === '1' &&
            autocompleteData.tips &&
            autocompleteData.tips.length > 0
          ) {
              const autocompleteResults = autocompleteData.tips
              .filter((tip) => tip.location)
              .map((tip) => ({
                name:
                  tip.name +
                  (tip.address ? ` · ${tip.address}` : '') +
                  (tip.district ? ` · ${tip.district}` : ''),
                  lat: parseFloat(tip.location.split(',')[1]),
                  lon: parseFloat(tip.location.split(',')[0]),
                  address: tip.address || '',
                  district: tip.district || '',
                  type: tip.type || '',
                }));
              
              allResults = [...allResults, ...autocompleteResults];
            }
          }
        } catch (e) {
        console.log('输入提示 API 调用失败，继续使用地点搜索 API');
        }
        
      // 2. 地点搜索 API（Place Search）获取更多结果
        try {
        const searchUrl = getAmapApiUrl(`/v3/place/text?key=${amapKey}&keywords=${encodeURIComponent(
          query
        )}&city=&offset=20&page=1&extensions=all&types=`);
          const response = await fetch(searchUrl);
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.status === '1' && data.pois && data.pois.length > 0) {
            const placeResults = data.pois.map((item) => ({
              name:
                item.name +
                (item.address ? ` · ${item.address}` : '') +
                (item.district ? ` · ${item.district}` : ''),
                lat: parseFloat(item.location.split(',')[1]),
                lon: parseFloat(item.location.split(',')[0]),
                address: item.address || '',
                district: item.district || '',
                type: item.type || '',
                tel: item.tel || '',
              }));
              
              allResults = [...allResults, ...placeResults];
            }
          }
        } catch (e) {
        console.log('地点搜索 API 调用失败');
        }
        
      // 3. 去重并限制数量
        if (allResults.length > 0) {
        const uniqueResults = allResults.filter(
          (item, index, self) =>
            index ===
            self.findIndex(
              (t) =>
                Math.abs(t.lat - item.lat) < 0.0001 &&
                Math.abs(t.lon - item.lon) < 0.0001
            )
          );

        const finalResults = uniqueResults.slice(0, 20);
          
          if (isEdit) {
          setEditSearchResults(finalResults);
          } else {
          setSearchResults(finalResults);
          }
          return;
        }
      
      // 没有结果时清空
          if (isEdit) {
            setEditSearchResults([]);
          } else {
            setSearchResults([]);
      }
    } catch (error) {
      handleError(error, {
        context: 'searchLocation',
        type: ErrorType.NETWORK,
        silent: true,
      });
            if (isEdit) {
              setEditSearchResults([]);
            } else {
              setSearchResults([]);
      }
    } finally {
      if (isEdit) {
        setIsEditSearching(false);
      } else {
        setIsSearching(false);
      }
    }
  }, [getAmapApiUrl]);

  // 选择搜索结果并在地图上定位
  const selectSearchResult = (result, isEdit = false) => {
    const mapInstance = isEdit ? editLocationMapInstance.current : locationMapInstance.current;
    const setLocation = isEdit ? setEditSelectedLocation : setSelectedLocation;

    if (mapInstance) {
      mapInstance.setCenter([result.lon, result.lat]);
      mapInstance.setZoom(15);
      
      // 移除旧标记
      if (mapInstance._marker) {
        mapInstance._marker.remove();
      }

      // 添加新标记
      const markerEl = document.createElement('div');
      markerEl.className = 'custom-marker';
      markerEl.style.cssText = `
        width: 30px;
        height: 30px;
        background: #e74c3c;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
      `;

      const popup = new maplibregl.Popup({ offset: 25 })
        .setHTML(`${result.name}<br>纬度: ${result.lat.toFixed(6)}<br>经度: ${result.lon.toFixed(6)}`);

      const marker = new maplibregl.Marker(markerEl)
        .setLngLat([result.lon, result.lat])
        .setPopup(popup)
        .addTo(mapInstance);

      marker.togglePopup();
      mapInstance._marker = marker;
    }

    setLocation({ lat: result.lat, lon: result.lon });
    
    if (isEdit) {
      setEditLocationSearchQuery('');
      setEditSearchResults([]);
    } else {
      setLocationSearchQuery('');
      setSearchResults([]);
    }
  };

  // 搜索防抖处理
  useEffect(() => {
    if (!locationSearchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timeoutId = setTimeout(() => {
      searchLocation(locationSearchQuery, false);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [locationSearchQuery]);

  // 编辑表单搜索防抖处理
  useEffect(() => {
    if (!editLocationSearchQuery.trim()) {
      setEditSearchResults([]);
      return;
    }
    const timeoutId = setTimeout(() => {
      searchLocation(editLocationSearchQuery, true);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [editLocationSearchQuery]);

  // 初始化编辑表单的地图选择器
  useEffect(() => {
    if (!showEditLocationPicker || !editLocationMapContainerRef.current || editLocationMapInstance.current) return;

    // 默认中心点
    let centerLat = 39.9042;
    let centerLon = 116.4074;
    let zoom = 5;

    if (editSelectedLocation) {
      centerLat = editSelectedLocation.lat;
      centerLon = editSelectedLocation.lon;
      zoom = 10;
    } else if (editForm.latitude && editForm.longitude) {
      centerLat = editForm.latitude;
      centerLon = editForm.longitude;
      zoom = 10;
    }

    // 使用高德地图瓦片服务
    editLocationMapInstance.current = new maplibregl.Map({
      container: editLocationMapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'gaode-tiles': {
            type: 'raster',
            tiles: [
              'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
              'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
              'https://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
              'https://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
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
      center: [centerLon, centerLat],
      zoom: zoom,
      attributionControl: true,
    });

    editLocationMapInstance.current._marker = null;

    // 等待地图加载完成
    editLocationMapInstance.current.once('load', () => {
      // 添加标记
      if (editSelectedLocation || (editForm.latitude && editForm.longitude)) {
        const lat = editSelectedLocation?.lat || editForm.latitude;
        const lon = editSelectedLocation?.lon || editForm.longitude;
        
        const markerEl = document.createElement('div');
        markerEl.className = 'custom-marker';
        markerEl.style.cssText = `
          width: 30px;
          height: 30px;
          background: #e74c3c;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          cursor: pointer;
        `;

        const popup = new maplibregl.Popup({ offset: 25 })
          .setHTML(`纬度: ${lat.toFixed(6)}<br>经度: ${lon.toFixed(6)}`);

        const marker = new maplibregl.Marker(markerEl)
          .setLngLat([lon, lat])
          .setPopup(popup)
          .addTo(editLocationMapInstance.current);

        marker.togglePopup();
        editLocationMapInstance.current._marker = marker;
      }

      // 地图点击事件
      editLocationMapInstance.current.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        setEditSelectedLocation({ lat, lon: lng });

        // 移除旧标记
        if (editLocationMapInstance.current._marker) {
          editLocationMapInstance.current._marker.remove();
        }

        // 添加新标记
        const markerEl = document.createElement('div');
        markerEl.className = 'custom-marker';
        markerEl.style.cssText = `
          width: 30px;
          height: 30px;
          background: #e74c3c;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          cursor: pointer;
        `;

        const popup = new maplibregl.Popup({ offset: 25 })
          .setHTML(`纬度: ${lat.toFixed(6)}<br>经度: ${lng.toFixed(6)}`);

        const marker = new maplibregl.Marker(markerEl)
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(editLocationMapInstance.current);

        marker.togglePopup();
        editLocationMapInstance.current._marker = marker;
      });
    });

    // 如果地图已经加载，直接触发 load 事件
    if (editLocationMapInstance.current.loaded()) {
      editLocationMapInstance.current.fire('load');
    }

    return () => {
      if (editLocationMapInstance.current) {
        editLocationMapInstance.current.remove();
        editLocationMapInstance.current = null;
      }
    };
  }, [showEditLocationPicker, editSelectedLocation, editForm.latitude, editForm.longitude]);

  // 当地图容器显示时，调整地图大小
  useEffect(() => {
    if (showEditLocationPicker && editLocationMapInstance.current) {
      setTimeout(() => {
        editLocationMapInstance.current.resize();
      }, 100);
    }
  }, [showEditLocationPicker]);

  // 保存到 localStorage
  const saveToStorage = (uploads) => {
    try {
      Storage.set(STORAGE_KEY, uploads);
    } catch (error) {
      handleError(error, {
        context: 'handleSubmit.storage',
        type: ErrorType.STORAGE,
        silent: true,
      });
    }
  };

  const refreshSupabaseData = useCallback(async () => {
    if (!supabase) return;
    setIsSupabaseLoading(true);
    setSupabaseError('');
    try {
      const [pendingResult, approvedResult, rejectedResult] = await Promise.all([
        supabase
          .from('photos')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('photos')
          .select('*')
          .eq('status', 'approved')
          .order('created_at', { ascending: false }),
        supabase
          .from('photos')
          .select('*')
          .eq('status', 'rejected')
          .order('created_at', { ascending: false }),
      ]);

      if (pendingResult.error || approvedResult.error || rejectedResult.error) {
        throw pendingResult.error || approvedResult.error || rejectedResult.error;
      }

      const pendingMapped = (pendingResult.data || []).map(mapSupabaseRowToPhoto);
      const approvedMapped = (approvedResult.data || []).map(mapSupabaseRowToPhoto);
      const rejectedMapped = (rejectedResult.data || []).map(mapSupabaseRowToPhoto);

      setAdminUploads(pendingMapped);
      setApprovedPhotos(approvedMapped);
      setRejectedPhotos(rejectedMapped);
      saveToStorage(pendingMapped);
      try {
        Storage.set(APPROVED_STORAGE_KEY, approvedMapped);
      } catch (storageError) {
        handleError(storageError, {
          context: 'refreshSupabaseData.sync',
          type: ErrorType.STORAGE,
          silent: true,
        });
      }
    } catch (error) {
      handleError(error, {
        context: 'refreshSupabaseData',
        type: ErrorType.NETWORK,
      });
      setSupabaseError(error.message || '无法从 Supabase 加载数据');
    } finally {
      setIsSupabaseLoading(false);
    }
  }, [supabase, setAdminUploads, setApprovedPhotos, setRejectedPhotos]);

  // 更新 ref，使 hook 可以调用 refreshSupabaseData
  useEffect(() => {
    refreshSupabaseDataRef.current = refreshSupabaseData;
  }, [refreshSupabaseData]);

  // 当 adminUploads 变化时保存到 localStorage
  useEffect(() => {
    if (supabase) return;
    saveToStorage(adminUploads);
  }, [adminUploads, supabase]);

  // 更新已审核通过和已拒绝的作品列表
  useEffect(() => {
    if (supabase) return;
    setApprovedPhotos(loadApprovedPhotos());
    setRejectedPhotos(loadRejectedPhotos());
  }, [supabase, setApprovedPhotos, setRejectedPhotos]);

  useEffect(() => {
    if (!supabase) return;
    refreshSupabaseData();
  }, [supabase, refreshSupabaseData]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setUploadForm((prev) => ({ ...prev, [name]: value }));
    // 清除之前的错误提示
    if (submitMessage.type === 'error') {
      setSubmitMessage({ type: '', text: '' });
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setUploadForm((prev) => ({ ...prev, file: null, preview: '', latitude: null, longitude: null, altitude: null }));
      return;
    }

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      setSubmitMessage({ type: 'error', text: '请上传图片文件（JPG/PNG）' });
      return;
    }

    // 不限制文件大小（仅依靠后端和 OSS 的限制）

    const reader = new FileReader();
    reader.onload = async () => {
      const preview = reader.result?.toString() || '';
      setUploadForm((prev) => ({ ...prev, file, preview, imageUrl: '' }));
      
      // 读取EXIF数据获取地理位置和相机参数
      try {
        // 先尝试使用 gps: true 和 translateKeys: false 来获取GPS数据
        // 因为GPS字段在不同配置下可能有不同的命名
        const exifWithGPS = await exifr.parse(file, {
          gps: true,
          translateKeys: false, // 不使用翻译，使用原始字段名
        });
        
        // 再读取其他EXIF数据
        const exif = await exifr.parse(file, {
          gps: true,
          translateKeys: true, // 使用翻译后的键名（更统一）
          pick: [
            'FocalLength', 'FocalLengthIn35mmFormat',
            'FNumber', 'ApertureValue',
            'ExposureTime', 'ShutterSpeedValue',
            'ISO', 'ISOSpeedRatings',
            'Make', 'Model',
            'LensModel', 'LensMake', 'Lens',
            'DateTimeOriginal', 'DateTime',
            'GPSLatitude', 'GPSLongitude', 'GPSAltitude'
          ],
        });
        
        // 调试：在控制台输出读取到的EXIF数据
        console.log('读取到的EXIF数据 (translateKeys=true):', exif);
        console.log('读取到的EXIF数据 (translateKeys=false):', exifWithGPS);
        
        // 准备更新的表单数据
        const updates = {};
        let hasUpdates = false;
        let successMessages = [];
        
        // 读取地理位置信息 - 尝试多种可能的字段名
        let latitude = null;
        let longitude = null;
        let altitude = null;
        
        // 尝试从 translateKeys=false 的结果中获取（原始字段名）
        if (exifWithGPS) {
          latitude = exifWithGPS.latitude || exifWithGPS.Latitude || exifWithGPS.GPSLatitude || exifWithGPS.gpsLatitude;
          longitude = exifWithGPS.longitude || exifWithGPS.Longitude || exifWithGPS.GPSLongitude || exifWithGPS.gpsLongitude;
          altitude = exifWithGPS.altitude || exifWithGPS.Altitude || exifWithGPS.GPSAltitude || exifWithGPS.gpsAltitude;
        }
        
        // 如果上面没找到，尝试从 translateKeys=true 的结果中获取
        if (!latitude || !longitude) {
          latitude = exif?.latitude || exif?.Latitude || exif?.GPSLatitude || exif?.gpsLatitude;
          longitude = exif?.longitude || exif?.Longitude || exif?.GPSLongitude || exif?.gpsLongitude;
          altitude = altitude || exif?.altitude || exif?.Altitude || exif?.GPSAltitude || exif?.gpsAltitude;
        }
        
        // 如果还是没找到，尝试从 exifWithGPS 的其他可能字段获取
        if (!latitude || !longitude) {
          // exifr 可能返回的字段名
          const gpsData = exifWithGPS?.gps || exifWithGPS?.GPS || {};
          latitude = latitude || gpsData.latitude || gpsData.Latitude || gpsData.GPSLatitude;
          longitude = longitude || gpsData.longitude || gpsData.Longitude || gpsData.GPSLongitude;
          altitude = altitude || gpsData.altitude || gpsData.Altitude || gpsData.GPSAltitude;
        }
        
        console.log('提取的GPS数据:', { latitude, longitude, altitude });
        
        if (latitude != null && longitude != null && !isNaN(latitude) && !isNaN(longitude)) {
          updates.latitude = Number(latitude);
          updates.longitude = Number(longitude);
          updates.altitude = altitude != null && !isNaN(altitude) ? Number(altitude) : null;
          setSelectedLocation({
            lat: Number(latitude),
            lon: Number(longitude),
          });
          successMessages.push('地理位置信息');
          hasUpdates = true;

          // 尝试通过反向地理编码获取地址信息
          try {
            const amapKey = getEnvValue('VITE_AMAP_KEY', '');
            if (amapKey) {
              const reverseGeocodeUrl = getAmapApiUrl(`/v3/geocode/regeo?key=${amapKey}&location=${updates.longitude},${updates.latitude}&radius=1000&extensions=all`);
              
              const response = await fetch(reverseGeocodeUrl);
              if (response.ok) {
                const data = await response.json();
                if (data.status === '1' && data.regeocode) {
                  const addressComponent = data.regeocode.addressComponent;
                  const formattedAddress = data.regeocode.formatted_address;
                  
                  // 提取省份信息（优先使用，最准确）
                  if (addressComponent.province) {
                    // 高德地图返回的省份可能包含"省"、"市"、"自治区"等后缀，需要清理
                    let provinceName = addressComponent.province.replace(/省|市|自治区|特别行政区/g, '').trim();
                    // 如果country字段为空或只包含"中国"，则使用省份作为country
                    if (!updates.country || updates.country === '中国') {
                      updates.country = provinceName;
                      hasUpdates = true;
                    }
                  }
                  
                  // 提取国家/地区信息（如果省份未设置）
                  if (!updates.country && addressComponent.country) {
                    updates.country = addressComponent.country;
                    hasUpdates = true;
                  }
                  
                  // 提取详细地址信息（优先使用区县+街道，如果没有则使用格式化地址）
                  let locationText = '';
                  // 优先使用城市信息（如果城市名存在且不是省份名）
                  if (addressComponent.city && addressComponent.city !== addressComponent.province) {
                    locationText = addressComponent.city;
                    // 如果有区县信息，添加到城市后面
                    if (addressComponent.district && addressComponent.district !== addressComponent.city) {
                      locationText = `${addressComponent.city} · ${addressComponent.district}`;
                    }
                  } else if (addressComponent.district && addressComponent.street) {
                    locationText = `${addressComponent.district}${addressComponent.street}`;
                  } else if (addressComponent.district) {
                    locationText = addressComponent.district;
                  } else if (formattedAddress) {
                    // 使用格式化地址，但去掉国家信息和省份信息
                    locationText = formattedAddress
                      .replace(/^中国\s*/, '')
                      .replace(new RegExp(`^${addressComponent.province || ''}\\s*`, 'g'), '')
                      .trim();
                  }
                  
                  if (locationText) {
                    updates.location = locationText;
                    hasUpdates = true;
                  }
                  
                  console.log('反向地理编码成功:', { 
                    province: addressComponent.province,
                    city: addressComponent.city,
                    district: addressComponent.district,
                    country: updates.country, 
                    location: updates.location 
                  });
                }
              }
            } else {
              console.log('未配置高德地图API Key，无法进行反向地理编码');
            }
          } catch (error) {
            console.log('反向地理编码失败，将仅使用经纬度:', error);
            // 反向地理编码失败不影响其他功能，继续执行
          }
        } else {
          updates.latitude = null;
          updates.longitude = null;
          updates.altitude = null;
          setSelectedLocation(null);
        }
        
        // 读取相机参数（同时支持原始键名和翻译后的键名）
        // 焦距 (FocalLength 或 focalLength，单位通常是 mm)
        const focalLength = exif?.FocalLength || exif?.focalLength || exif?.FocalLengthIn35mmFormat || exif?.focalLengthIn35mmFormat;
        if (focalLength) {
          const focal = typeof focalLength === 'number' 
            ? `${Math.round(focalLength)}mm` 
            : String(focalLength);
          updates.focal = focal;
          hasUpdates = true;
        }
        
        // 光圈 (FNumber 或 fNumber)
        const fNumber = exif?.FNumber || exif?.fNumber || exif?.ApertureValue || exif?.apertureValue;
        if (fNumber) {
          let aperture = '';
          if (typeof fNumber === 'number') {
            aperture = `f/${fNumber.toFixed(1)}`;
          } else if (typeof fNumber === 'string' && fNumber.startsWith('f/')) {
            aperture = fNumber;
          } else {
            aperture = `f/${fNumber}`;
          }
          updates.aperture = aperture;
          hasUpdates = true;
        }
        
        // 快门速度 (ExposureTime 或 exposureTime，单位是秒)
        const exposureTime = exif?.ExposureTime || exif?.exposureTime;
        if (exposureTime) {
          let shutter = '';
          if (typeof exposureTime === 'number') {
            if (exposureTime >= 1) {
              shutter = `${exposureTime.toFixed(1)}s`;
            } else {
              shutter = `1/${Math.round(1 / exposureTime)}s`;
            }
          } else {
            shutter = String(exposureTime);
          }
          updates.shutter = shutter;
          hasUpdates = true;
        }
        
        // ISO (ISO 或 iso 或 ISOSpeedRatings)
        const iso = exif?.ISO || exif?.iso || exif?.ISOSpeedRatings || exif?.isoSpeedRatings;
        if (iso) {
          updates.iso = String(iso);
          hasUpdates = true;
        }
        
        // 相机型号 (Make + Model)
        const make = exif?.Make || exif?.make || '';
        const model = exif?.Model || exif?.model || '';
        if (make || model) {
          const camera = [make, model].filter(Boolean).join(' ').trim();
          if (camera) {
            updates.camera = camera;
            hasUpdates = true;
          }
        }
        
        // 镜头型号 (LensModel 或 lensModel 或 Lens)
        const lensModel = exif?.LensModel || exif?.lensModel || exif?.Lens || exif?.lens;
        if (lensModel) {
          updates.lens = String(lensModel);
          hasUpdates = true;
        }
        
        // 拍摄日期 (DateTimeOriginal 或 dateTimeOriginal 或 DateTime)
        const dateTimeOriginal = exif?.DateTimeOriginal || exif?.dateTimeOriginal || exif?.DateTime || exif?.dateTime;
        if (dateTimeOriginal) {
          try {
            const date = new Date(dateTimeOriginal);
            if (!isNaN(date.getTime())) {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              updates.shotDate = `${year}-${month}-${day}`;
              hasUpdates = true;
            }
          } catch (e) {
            console.log('无法解析拍摄日期:', e);
          }
        }
        
        // 更新表单
        if (hasUpdates) {
          setUploadForm((prev) => ({ ...prev, ...updates }));
          const messages = [];
          if (successMessages.length > 0) {
            messages.push(...successMessages);
          }
          if (updates.focal || updates.aperture || updates.shutter || updates.iso || updates.camera || updates.lens) {
            messages.push('相机参数');
          }
          setSubmitMessage({ 
            type: 'success', 
            text: `已从照片EXIF数据中读取：${messages.join('、')}` 
          });
        } else {
          setSubmitMessage({ type: 'info', text: '照片中未找到EXIF数据，请手动填写参数' });
        }
      } catch (error) {
        console.log('无法读取EXIF数据:', error);
        setUploadForm((prev) => ({
          ...prev,
          latitude: null,
          longitude: null,
          altitude: null,
        }));
        setSelectedLocation(null);
        setSubmitMessage({ type: 'info', text: '无法读取照片EXIF数据，请手动填写参数' });
      }
      
      if (submitMessage.type === 'error') {
        setSubmitMessage({ type: '', text: '' });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUrlChange = (event) => {
    const url = event.target.value.trim();
    setUploadForm((prev) => ({ ...prev, imageUrl: url }));
  };

  const handleThumbnailUrlChange = (event) => {
    const url = event.target.value.trim();
    setUploadForm((prev) => ({ ...prev, thumbnailUrl: url }));
    
    // 如果缩略图 URL 有效，设置预览
    if (url) {
      try {
        new URL(url);
        setUploadForm((prev) => ({ ...prev, preview: url, file: null }));
        if (submitMessage.type === 'error') {
          setSubmitMessage({ type: '', text: '' });
        }
      } catch {
        // URL格式无效，不设置预览
        setUploadForm((prev) => ({ ...prev, preview: '' }));
      }
    } else {
      setUploadForm((prev) => ({ ...prev, preview: '' }));
    }
  };

  const handleUploadModeChange = (mode) => {
    setUploadForm((prev) => ({
      ...prev,
      uploadMode: mode,
      file: null,
      preview: '',
      imageUrl: '',
      thumbnailUrl: '',
    }));
    const fileInput = document.getElementById('file-upload');
    if (fileInput) fileInput.value = '';
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    
    // 验证必填字段
    if (!uploadForm.title?.trim()) {
      setSubmitMessage({ type: 'error', text: '请填写标题' });
      return;
    }
    if (!uploadForm.location?.trim()) {
      setSubmitMessage({ type: 'error', text: '请填写拍摄地点' });
      return;
    }
    if (!uploadForm.country?.trim()) {
      setSubmitMessage({ type: 'error', text: '请填写国家/地区' });
      return;
    }
    if (!uploadForm.shotDate) {
      setSubmitMessage({ type: 'error', text: '请填写拍摄日期' });
      return;
    }
    // 验证文件或URL
    if (uploadForm.uploadMode === 'file') {
      if (!uploadForm.file) {
        setSubmitMessage({ type: 'error', text: '请上传照片' });
        return;
      }
    } else {
      if (!uploadForm.thumbnailUrl?.trim()) {
        setSubmitMessage({ type: 'error', text: '请输入缩略图直链地址' });
        return;
      }
      if (!uploadForm.imageUrl?.trim()) {
        setSubmitMessage({ type: 'error', text: '请输入原图直链地址' });
        return;
      }
      // 验证URL格式
      try {
        new URL(uploadForm.thumbnailUrl.trim());
        new URL(uploadForm.imageUrl.trim());
      } catch {
        setSubmitMessage({ type: 'error', text: '请输入有效的缩略图和原图 URL 地址' });
      return;
    }
    }

    setIsUploading(true);
    setSubmitMessage({ type: '', text: '' });
    setUploadProgress(0);
    setUploadingFileName(uploadForm.uploadMode === 'file' ? uploadForm.file?.name || null : null);

    try {
      let imageURL = '';
      let thumbnailURL = '';
      
      if (uploadForm.uploadMode === 'file') {
        // 文件上传模式
        const fileExtension = uploadForm.file.name.split('.').pop();
        const filename = `${crypto.randomUUID()}.${fileExtension}`;
        
        // 使用通用上传函数
        imageURL = uploadForm.preview; // 默认使用预览（base64）
        thumbnailURL = uploadForm.preview;
        
        try {
          console.log('开始上传，上传类型:', uploadType, '文件名:', filename);
          const { url, thumbnailUrl: returnedThumb } = await uploadImage(
            uploadForm.file, 
            filename,
            (progress, uploaded, total) => {
              setUploadProgress(progress);
              if (uploaded !== undefined && total !== undefined) {
                setUploadBytes({ uploaded, total });
              }
            }
          );
          imageURL = url || imageURL;
          // 如果后端返回了缩略图（例如 OSS 的 ore 目录），优先使用
          if (returnedThumb) {
            thumbnailURL = returnedThumb;
          } else {
            thumbnailURL = imageURL;
          }
          console.log('上传成功，返回 URL:', imageURL, '缩略图:', thumbnailURL);
          if (uploadType !== UPLOAD_TYPES.BASE64) {
            setSubmitMessage({ type: 'success', text: `照片已上传到 ${getUploadTypeName(uploadType)}` });
          }
        } catch (error) {
          const appError = handleError(error, {
            context: 'handleSubmit.upload',
            type: ErrorType.NETWORK,
          });
          if (uploadType !== UPLOAD_TYPES.BASE64) {
            setSubmitMessage({ type: 'error', text: `上传失败: ${formatErrorMessage(appError)}，使用本地预览` });
          }
          // 继续使用 base64 预览
        }
      } else {
        // 直链上传模式
        thumbnailURL = uploadForm.thumbnailUrl.trim();
        imageURL = uploadForm.imageUrl.trim();
        setSubmitMessage({ type: 'success', text: '使用直链地址' });
    }

    const newUpload = {
      id: crypto.randomUUID(),
        title: uploadForm.title.trim(),
        location: uploadForm.location.trim(),
        country: uploadForm.country.trim(),
      category: uploadForm.category,
        tags: uploadForm.tags.trim(),
        preview: thumbnailURL || imageURL, // 后台列表统一用缩略图
      image: imageURL,
      thumbnail: thumbnailURL || null,
        latitude: uploadForm.latitude,
        longitude: uploadForm.longitude,
        altitude: uploadForm.altitude,
      shotDate: uploadForm.shotDate || '',
      rating: typeof uploadForm.rating === 'number' ? uploadForm.rating : Number(uploadForm.rating) || 7,
      focal: uploadForm.focal || '',
      aperture: uploadForm.aperture || '',
      shutter: uploadForm.shutter || '',
      iso: uploadForm.iso || '',
      camera: uploadForm.camera || '',
      lens: uploadForm.lens || '',
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    setAdminUploads((prev) => [newUpload, ...prev]);

    // 记录常用相机/镜头到本地存储和 gear_presets 表
    console.log('[handleSubmit] 准备更新 gear_presets:', {
      camera: newUpload.camera,
      cameraTrimmed: newUpload.camera?.trim(),
      lens: newUpload.lens,
      lensTrimmed: newUpload.lens?.trim(),
    });
    
    if (newUpload.camera && newUpload.camera.trim()) {
      const cameraValue = newUpload.camera.trim();
      console.log('[handleSubmit] 调用 addCameraOption:', cameraValue);
      // 使用 addCameraOption 函数，它会同时更新本地存储和 Supabase gear_presets 表
      addCameraOption(cameraValue);
    } else {
      console.warn('[handleSubmit] 相机型号为空或无效:', newUpload.camera);
    }
    
    if (newUpload.lens && newUpload.lens.trim()) {
      const lensValue = newUpload.lens.trim();
      console.log('[handleSubmit] 调用 addLensOption:', lensValue);
      // 使用 addLensOption 函数，它会同时更新本地存储和 Supabase gear_presets 表
      addLensOption(lensValue);
    } else {
      console.warn('[handleSubmit] 镜头型号为空或无效:', newUpload.lens);
    }

    if (supabase) {
      try {
        // 调试：检查 newUpload 对象中的相机和镜头信息
        console.log('newUpload 对象:', newUpload);
        console.log('相机信息:', newUpload.camera);
        console.log('镜头信息:', newUpload.lens);
        
        const payload = buildSupabasePayloadFromPhoto(newUpload, 'pending');
        console.log('准备上传到 Supabase，payload:', payload);
        console.log('payload 中的相机信息:', payload.camera);
        console.log('payload 中的镜头信息:', payload.lens);
        
        const { data, error } = await supabase.from('photos').upsert(payload);
        if (error) {
          throw handleError(error, {
            context: 'handleSubmit.supabase',
            type: ErrorType.NETWORK,
          });
        }
        await refreshSupabaseData();
      } catch (error) {
        const appError = handleError(error, {
          context: 'handleSubmit.supabase',
          type: ErrorType.NETWORK,
        });
        setSubmitMessage({ type: 'error', text: `上传到云端失败：${formatErrorMessage(appError)}` });
      }
    }
      setSubmitMessage({ type: 'success', text: '提交成功！作品已添加到待审核列表' });
      setActiveTab('pending'); // 切换到待审核标签
      
      // 重置表单
    setUploadForm({
      title: '',
      location: '',
      country: '',
      category: 'featured',
      tags: '',
      preview: '',
      file: null,
      uploadMode: 'file',
      imageUrl: '',
      thumbnailUrl: '',
      latitude: null,
      longitude: null,
      altitude: null,
      shotDate: '',
      rating: 7,
      focal: '',
      aperture: '',
      shutter: '',
      iso: '',
      camera: '',
      lens: '',
    });
    setSelectedLocation(null);
      
      // 重置文件输入
      const fileInput = event.target.querySelector('input[type="file"]');
      if (fileInput) {
        fileInput.value = '';
      }

      // 3秒后清除成功提示
      setTimeout(() => {
        setSubmitMessage({ type: '', text: '' });
      }, 3000);
    } catch (error) {
      setSubmitMessage({ type: 'error', text: `上传失败: ${error.message}` });
    } finally {
      setIsUploading(false);
      // 延迟隐藏进度条，让用户看到100%完成
      setTimeout(() => {
        setUploadProgress(null);
        setUploadingFileName(null);
        setUploadBytes({ uploaded: 0, total: 0 });
      }, 500);
    }
  };

  // 保存审核通过的作品到共享存储
  const saveApprovedPhoto = (item) => {
    if (supabase) return;
    try {
      const approved = loadApprovedPhotos();
      // 转换为前端图库需要的格式
      const approvedPhoto = {
        id: item.id,
        title: item.title,
        country: item.country,
        location: item.location,
        category: item.category,
        image: item.preview, // 使用预览图作为图片
        focal: '50mm', // 默认值，可以后续扩展
        aperture: 'f/2.8',
        shutter: '1/125s',
        iso: '200',
        camera: 'Unknown',
        lens: 'Unknown',
        mood: item.tags && item.tags.trim() ? item.tags.split(',')[0].trim() : '未分类',
        latitude: item.latitude || null,
        longitude: item.longitude || null,
        altitude: item.altitude || null,
      };
      
      // 检查是否已存在，避免重复
      if (!approved.find((p) => p.id === item.id)) {
        approved.push(approvedPhoto);
        Storage.set(APPROVED_STORAGE_KEY, approved);
        setApprovedPhotos([...approved]);
      }
    } catch (error) {
      handleError(error, {
        context: 'handleApprove.storage',
        type: ErrorType.STORAGE,
        silent: true,
      });
    }
  };

  // 包装函数：添加切换标签页的功能
  const handleApproveWithTabSwitch = async (id) => {
    await handleApprove(id);
      setActiveTab('approved'); // 切换到已审核标签
  };

  const handleRejectWithTabSwitch = async (id) => {
    await handleReject(id);
    setActiveTab('rejected'); // 切换到已拒绝标签
  };

  // 打开编辑表单
  const handleEdit = (photo) => {
    setEditingPhotoId(photo.id);
    setEditForm({
      title: photo.title || '',
      location: photo.location || '',
      country: photo.country || '',
      category: photo.category || 'featured',
      latitude: photo.latitude || null,
      longitude: photo.longitude || null,
      altitude: photo.altitude || null,
      focal: photo.focal || '50mm',
      aperture: photo.aperture || 'f/2.8',
      shutter: photo.shutter || '1/125s',
      iso: photo.iso || '200',
      camera: photo.camera || 'Unknown',
      lens: photo.lens || 'Unknown',
      shotDate: photo.shotDate || '',
      rating: typeof photo.rating === 'number' ? photo.rating : (photo.rating ? Number(photo.rating) : 7),
      hidden: !!photo.hidden,
    });
    setEditSelectedLocation(null);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingPhotoId) return;

    if (supabase) {
      try {
        const updatePayload = {
          title: editForm.title.trim(),
          location: editForm.location.trim(),
          country: editForm.country.trim(),
          category: editForm.category,
          latitude: editForm.latitude,
          longitude: editForm.longitude,
          altitude: editForm.altitude,
          focal: editForm.focal.trim(),
          aperture: editForm.aperture.trim(),
          shutter: editForm.shutter.trim(),
          iso: editForm.iso.trim(),
          camera: editForm.camera.trim(),
          lens: editForm.lens.trim(),
          rating: typeof editForm.rating === 'number' ? editForm.rating : Number(editForm.rating) || 7,
          shot_date: editForm.shotDate || null,
          hidden: !!editForm.hidden,
        };

        await supabase.from('photos').update(updatePayload).eq('id', editingPhotoId);
        await refreshSupabaseData();
        setEditingPhotoId(null);
        setSubmitMessage({ type: 'success', text: '编辑成功！' });
        setTimeout(() => {
          setSubmitMessage({ type: '', text: '' });
        }, 2000);
        return;
      } catch (error) {
        handleError(error, {
          context: 'handleResubmit',
          type: ErrorType.NETWORK,
        });
        setSubmitMessage({ type: 'error', text: `保存失败：${error.message}` });
        return;
      }
    }

    try {
      // 检查是否在已审核列表中
      const approved = loadApprovedPhotos();
      const approvedIndex = approved.findIndex((p) => p.id === editingPhotoId);
      
      if (approvedIndex !== -1) {
        approved[approvedIndex] = {
          ...approved[approvedIndex],
          title: editForm.title.trim(),
          location: editForm.location.trim(),
          country: editForm.country.trim(),
          category: editForm.category,
          latitude: editForm.latitude,
          longitude: editForm.longitude,
          altitude: editForm.altitude,
          focal: editForm.focal.trim(),
          aperture: editForm.aperture.trim(),
          shutter: editForm.shutter.trim(),
          iso: editForm.iso.trim(),
          camera: editForm.camera.trim(),
          lens: editForm.lens.trim(),
          rating: typeof editForm.rating === 'number' ? editForm.rating : Number(editForm.rating) || 7,
          shotDate: editForm.shotDate || null,
          hidden: !!editForm.hidden,
        };
        
        Storage.set(APPROVED_STORAGE_KEY, approved);
        setApprovedPhotos([...approved]);
        setEditingPhotoId(null);
        setSubmitMessage({ type: 'success', text: '编辑成功！' });
        setTimeout(() => {
          setSubmitMessage({ type: '', text: '' });
        }, 2000);
        return;
      }

      // 检查是否在已拒绝列表中
      const rejected = loadRejectedPhotos();
      const rejectedIndex = rejected.findIndex((p) => p.id === editingPhotoId);
      
      if (rejectedIndex !== -1) {
        rejected[rejectedIndex] = {
          ...rejected[rejectedIndex],
          title: editForm.title.trim(),
          location: editForm.location.trim(),
          country: editForm.country.trim(),
          category: editForm.category,
          latitude: editForm.latitude,
          longitude: editForm.longitude,
          altitude: editForm.altitude,
          focal: editForm.focal.trim(),
          aperture: editForm.aperture.trim(),
          shutter: editForm.shutter.trim(),
          iso: editForm.iso.trim(),
          camera: editForm.camera.trim(),
          lens: editForm.lens.trim(),
          rating: typeof editForm.rating === 'number' ? editForm.rating : Number(editForm.rating) || 7,
          shotDate: editForm.shotDate || null,
          hidden: !!editForm.hidden,
        };
        
        Storage.set(REJECTED_STORAGE_KEY, rejected);
        setRejectedPhotos([...rejected]);
        setEditingPhotoId(null);
        setSubmitMessage({ type: 'success', text: '编辑成功！' });
        setTimeout(() => {
          setSubmitMessage({ type: '', text: '' });
        }, 2000);
        return;
      }
    } catch (error) {
      handleError(error, {
        context: 'handleSaveEdit',
        type: ErrorType.STORAGE,
        silent: true,
      });
      setSubmitMessage({ type: 'error', text: '保存失败，请重试' });
    }
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingPhotoId(null);
    setEditForm({
      title: '',
      location: '',
      country: '',
      category: 'featured',
      latitude: null,
      longitude: null,
      altitude: null,
      focal: '',
      aperture: '',
      shutter: '',
      iso: '',
      camera: '',
      lens: '',
      hidden: false,
    });
    setShowEditLocationPicker(false);
    setEditSelectedLocation(null);
  };

  // extractOSSFileInfo 和 deleteOSSFile 已移至 adminUtils.js

  // 删除作品（从编辑表单）
  const handleDeleteFromEdit = async () => {
    if (!editingPhotoId) return;
    
    if (window.confirm('确定要删除这个作品吗？此操作不可恢复。')) {
      // 先获取照片信息，以便删除OSS文件
      let photoToDelete = null;
      
      if (supabase) {
        try {
          // 从Supabase获取照片信息
          const { data, error: fetchError } = await supabase
            .from('photos')
            .select('image_url, thumbnail_url')
            .eq('id', editingPhotoId)
            .single();
          
          if (!fetchError && data) {
            photoToDelete = data;
          }
        } catch (error) {
          handleError(error, {
            context: 'handleDelete.fetchPhoto',
            type: ErrorType.NETWORK,
            silent: true,
          });
        }
      } else {
        // 从本地存储中查找照片
        const allPhotos = [
          ...adminUploads,
          ...approvedPhotos,
          ...rejectedPhotos,
        ];
        photoToDelete = allPhotos.find((p) => p.id === editingPhotoId);
      }
      
      // 删除OSS中的文件
      if (photoToDelete) {
        const imageUrl = photoToDelete.image_url || photoToDelete.image || photoToDelete.preview;
        const thumbnailUrl = photoToDelete.thumbnail_url || photoToDelete.thumbnail;
        
        console.log('准备删除OSS文件:', { imageUrl, thumbnailUrl, photoToDelete });
        
        // 删除原图
        if (imageUrl) {
          await deleteOSSFile(imageUrl);
        }
        
        // 删除缩略图（如果存在且与原图不同）
        if (thumbnailUrl && thumbnailUrl !== imageUrl) {
          await deleteOSSFile(thumbnailUrl);
        }
      } else {
        // 未找到要删除的照片信息（静默处理）
      }
      
      // 删除数据库记录
      if (supabase) {
        try {
          await supabase.from('photos').delete().eq('id', editingPhotoId);
          await refreshSupabaseData();
          setEditingPhotoId(null);
          setSubmitMessage({ type: 'success', text: '删除成功！' });
          setTimeout(() => {
            setSubmitMessage({ type: '', text: '' });
          }, 2000);
          return;
        } catch (error) {
          handleError(error, {
            context: 'handleDelete.supabase',
            type: ErrorType.NETWORK,
          });
          setSubmitMessage({ type: 'error', text: `删除失败：${error.message}` });
          return;
        }
      }
      
      // 从本地存储删除
      try {
        // 从已审核列表删除
        const approved = loadApprovedPhotos();
        const approvedFiltered = approved.filter((p) => p.id !== editingPhotoId);
        
        if (approvedFiltered.length !== approved.length) {
          Storage.set(APPROVED_STORAGE_KEY, approvedFiltered);
          setApprovedPhotos([...approvedFiltered]);
        }

        // 从已拒绝列表删除
        const rejected = loadRejectedPhotos();
        const rejectedFiltered = rejected.filter((p) => p.id !== editingPhotoId);
        
        if (rejectedFiltered.length !== rejected.length) {
          Storage.set(REJECTED_STORAGE_KEY, rejectedFiltered);
          setRejectedPhotos([...rejectedFiltered]);
        }

        setEditingPhotoId(null);
        setSubmitMessage({ type: 'success', text: '删除成功！' });
        setTimeout(() => {
          setSubmitMessage({ type: '', text: '' });
        }, 2000);
      } catch (error) {
        handleError(error, {
          context: 'handleDelete.localStorage',
          type: ErrorType.STORAGE,
          silent: true,
        });
        setSubmitMessage({ type: 'error', text: '删除失败，请重试' });
      }
    }
  };

  // 总作品数 = 已审核通过的作品 + 待审核的作品（不包括内置示例）
  const totalPhotos = approvedCount + pendingReviewCount;

  if (!isAdminAuthed) {
    return (
      <div className="app-root">
        <main className="admin-page">
          <div
            style={{
              minHeight: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              background:
                'radial-gradient(circle at top, #f5f7fb 0, #e8edf6 32%, #dde3f0 60%, #d7dee9 100%)',
            }}
          >
            <div
              style={{
                maxWidth: 420,
                width: '100%',
                background: 'rgba(255, 255, 255, 0.98)',
                borderRadius: 24,
                padding: '28px 24px 24px',
                boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)',
                border: '1px solid rgba(15, 23, 42, 0.04)',
              }}
            >
              <h1
                style={{
                  fontSize: '1.4rem',
                  marginBottom: 8,
                  color: '#111827',
                }}
              >
                管理后台访问
              </h1>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: '#6b7280',
                  marginBottom: 18,
                }}
              >
                请输入管理员密码进入后台。
              </p>
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <input
                    type={showAdminPassword ? 'text' : 'password'}
                    value={adminPasswordInput}
                    onChange={(e) => {
                      setAdminPasswordInput(e.target.value);
                      setAdminAuthError('');
                    }}
                    placeholder="管理员密码"
                    style={{
                      width: '100%',
                      padding: '12px 40px 12px 14px',
                      borderRadius: 10,
                      border: '1px solid rgba(148, 163, 184, 0.5)',
                      background: 'rgba(255,255,255,0.9)',
                      color: '#111827',
                      fontSize: '0.95rem',
                      outline: 'none',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (!adminPasswordInput) return;
                        if (adminPasswordInput === adminPassword) {
                          setIsAdminAuthed(true);
                          try {
                            StorageString.set(STORAGE_KEYS.ADMIN_AUTHED, 'true');
                          } catch {}
                        } else {
                          setAdminAuthError('密码不正确');
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword((v) => !v)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      padding: '4px 6px',
                      borderRadius: 999,
                      border: 'none',
                      background: 'transparent',
                      color: '#9ca3af',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    {showAdminPassword ? '隐藏' : '查看'}
                  </button>
                </div>
              </div>
              {adminAuthError && (
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: '#ff6b6b',
                    marginBottom: 12,
                  }}
                >
                  {adminAuthError}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!adminPasswordInput) return;
                  if (adminPasswordInput === adminPassword) {
                    setIsAdminAuthed(true);
                    StorageString.set(STORAGE_KEYS.ADMIN_AUTHED, 'true');
                  } else {
                    setAdminAuthError('密码不正确');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--bg)',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                进入后台
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell admin-shell">
      <UploadProgress 
        progress={uploadProgress} 
        fileName={uploadingFileName}
        isVisible={uploadProgress !== null}
        uploadedBytes={uploadBytes.uploaded}
        totalBytes={uploadBytes.total}
      />
      <header className="app-header admin-header">
        <div className="brand">
          {brandLogo ? (
            <img src={brandLogo} alt={`${brandText.adminTitle} logo`} className="brand-logo-img" />
          ) : (
            <div className="logo-mark" aria-hidden="true" />
          )}
          <div className="brand-copy">
            <div className="brand-name">{brandText.adminTitle}</div>
            <div className="brand-subtitle">{brandText.adminSubtitle}</div>
          </div>
        </div>
        <nav className="primary-menu">
          <a href={`${import.meta.env.BASE_URL}#/`}>返回前台</a>
        </nav>
      </header>

      <main className="admin-main">
        {/* 统计卡片 */}
        <div className="admin-stats">
          <a href={`${import.meta.env.BASE_URL}#/`} className="stat-card stat-primary stat-clickable">
            <div className="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 9V7C3 6.46957 3.21071 5.96086 3.58579 5.58579C3.96086 5.21071 4.46957 5 5 5H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 9V7C21 6.46957 20.7893 5.96086 20.4142 5.58579C20.0391 5.21071 19.5304 5 19 5H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 15V17C3 17.5304 3.21071 18.0391 3.58579 18.4142C3.96086 18.7893 4.46957 19 5 19H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 15V17C21 17.5304 20.7893 18.0391 20.4142 18.4142C20.0391 18.7893 19.5304 19 19 19H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="stat-content">
              <p className="stat-label">作品总数</p>
              <h3>{totalPhotos}</h3>
              <span className="stat-hint">含待审核 {pendingReviewCount}</span>
            </div>
          </a>
          <div
            className="stat-card stat-warning stat-clickable"
            onClick={() => setActiveTab('tools')}
          >
            <div className="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 7H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 10H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 13H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10 16H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="stat-content">
              <p className="stat-label">工具</p>
              <h3>图片压缩</h3>
              <span className="stat-hint">生成缩略图</span>
            </div>
          </div>
          <div className="stat-card stat-info">
            <div className="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 11L12 14L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="stat-content">
              <p className="stat-label">待审核</p>
              <h3>{pendingReviewCount}</h3>
              <span className="stat-hint">等待审核的作品</span>
            </div>
          </div>
          <div className="stat-card stat-success">
            <div className="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="stat-content">
              <p className="stat-label">已发布</p>
              <h3>{approvedCount}</h3>
              <span className="stat-hint">审核通过的作品</span>
            </div>
          </div>
          </div>

        {/* 云端同步提示 */}
        {supabase && isSupabaseLoading && !supabaseError && (
          <div className="admin-message info">正在同步云端数据...</div>
        )}
        {supabase && supabaseError && (
          <div className="admin-message error">
            {supabaseError}
          </div>
        )}

        {/* 消息提示 */}
        {submitMessage.text && (
          <div className={`admin-message ${submitMessage.type}`}>
            {submitMessage.text}
                </div>
        )}

        {/* 标签页导航 */}
        <div className="admin-tabs">
          <button
            className={`admin-tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
              {/* 底部粗托盘，左右竖线 + 圆角长条 */}
              <path
                d="M6 19H5C3.895 19 3 18.105 3 17V15"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M18 19H19C20.105 19 21 18.105 21 17V15"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6 19H18"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* 中间粗箭头，贴近你发的样式 */}
              <path
                d="M8.5 9.5L12 6L15.5 9.5"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 6V15"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>上传作品</span>
          </button>
          <button
            className={`admin-tab ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>待审核 ({pendingReviewCount})</span>
          </button>
          <button
            className={`admin-tab ${activeTab === 'approved' ? 'active' : ''}`}
            onClick={() => setActiveTab('approved')}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
              <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>已审核 ({approvedCount})</span>
          </button>
              <button
            className={`admin-tab ${activeTab === 'rejected' ? 'active' : ''}`}
            onClick={() => setActiveTab('rejected')}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M15 9L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M9 9L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>已拒绝 ({rejectedCount})</span>
              </button>
              <button
            className={`admin-tab ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
              <path
                d="M12 15.5C13.933 15.5 15.5 13.933 15.5 12C15.5 10.067 13.933 8.5 12 8.5C10.067 8.5 8.5 10.067 8.5 12C8.5 13.933 10.067 15.5 12 15.5Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M19.4 15A1.65 1.65 0 0 0 20 13.5C19.9999 13.0032 19.868 12.5157 19.62 12.09L20.62 10.26C20.7094 10.0993 20.7548 9.91692 20.7512 9.73233C20.7475 9.54773 20.6948 9.36746 20.5987 9.21008C20.5026 9.0527 20.3667 8.92328 20.2047 8.83564C20.0427 8.748 19.8604 8.70512 19.677 8.711L17.677 8.781C17.3092 8.35334 16.8678 7.99718 16.377 7.735L16.247 5.72C16.2347 5.53518 16.1717 5.3571 16.0654 5.20537C15.9592 5.05365 15.8142 4.93439 15.647 4.861C15.4799 4.78761 15.2969 4.76272 15.1185 4.78884C14.94 4.81495 14.7728 4.89091 14.637 5.008L13.077 6.34C12.5543 6.22852 12.0204 6.22852 11.4977 6.34L9.937 5.008C9.80118 4.89091 9.63402 4.81495 9.45554 4.78884C9.27706 4.76272 9.09406 4.78761 8.92694 4.861C8.75983 4.93439 8.61485 5.05365 8.5086 5.20537C8.40235 5.3571 8.33942 5.53518 8.32704 5.72L8.19704 7.735C7.70628 7.99719 7.26477 8.35337 6.89704 8.781L4.89704 8.711C4.71362 8.70512 4.53132 8.748 4.36932 8.83564C4.20731 8.92328 4.07143 9.0527 3.97532 9.21008C3.87921 9.36746 3.82655 9.54773 3.82289 9.73233C3.81923 9.91692 3.86467 10.0993 3.95404 10.26L4.95404 12.09C4.70601 12.5157 4.57411 13.0032 4.57404 13.5C4.57416 13.9969 4.70614 14.4843 4.95404 14.91L3.95404 16.74C3.86467 16.9007 3.81923 17.0831 3.82289 17.2677C3.82655 17.4523 3.87921 17.6325 3.97532 17.7899C4.07143 17.9473 4.20731 18.0767 4.36932 18.1644C4.53132 18.252 4.71362 18.2949 4.89704 18.289L6.89704 18.219C7.26479 18.6466 7.70627 19.0028 8.19704 19.265L8.32704 21.28C8.33942 21.4648 8.40235 21.6429 8.5086 21.7946C8.61485 21.9463 8.75983 22.0656 8.92694 22.139C9.09406 22.2124 9.27706 22.2373 9.45554 22.2112C9.63402 22.1851 9.80118 22.1091 9.937 21.992L11.4977 20.66C12.0204 20.7715 12.5543 20.7715 13.077 20.66L14.637 21.992C14.7728 22.1091 14.94 22.1851 15.1185 22.2112C15.2969 22.2373 15.4799 22.2124 15.647 22.139C15.8142 22.0656 15.9592 21.9463 16.0654 21.7946C16.1717 21.6429 16.2347 21.4648 16.247 21.28L16.377 19.265C16.8677 19.0028 17.3092 18.6467 17.677 18.219L19.677 18.289C19.8604 18.2949 20.0427 18.252 20.2047 18.1644C20.3667 18.0767 20.5026 17.9473 20.5987 17.7899C20.6948 17.6325 20.7475 17.4523 20.7512 17.2677C20.7548 17.0831 20.7094 16.9007 20.62 16.74L19.62 14.91C19.7959 14.6114 19.9131 14.2844 19.9659 13.9448C20.0188 13.6051 20.0063 13.2602 19.929 12.9251"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>配置</span>
            </button>
            <button
            className={`admin-tab ${activeTab === 'tools' ? 'active' : ''}`}
            onClick={() => setActiveTab('tools')}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
              {/* 扳手 + 螺母图标，更符合"工具"含义 */}
              <path
                d="M21 7.5L18.5 10L15 6.5L17.5 4C16.9 3.7 16.24 3.5 15.5 3.5C13.57 3.5 12 5.07 12 7C12 7.42 12.07 7.82 12.2 8.2L6.41 14C5.77 14.64 5.77 15.68 6.41 16.32L7.68 17.59C8.32 18.23 9.36 18.23 10 17.59L15.8 11.8C16.18 11.93 16.58 12 17 12C18.93 12 20.5 10.43 20.5 8.5C20.5 7.76 20.3 7.1 21 7.5Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="6"
                cy="6"
                r="2.25"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
            <span>工具</span>
                    </button>
              </div>

        {/* 内容区域 / 配置区域 */}
        {activeTab === 'config' ? (
          <div className="admin-settings-grid">
            <ConfigPanel
              supabase={supabase}
              envConfigForm={envConfigForm}
              setEnvConfigForm={setEnvConfigForm}
              envConfigMessage={envConfigMessage}
              setEnvConfigMessage={setEnvConfigMessage}
              brandLogo={brandLogo}
              setBrandLogo={setBrandLogo}
              logoMessage={logoMessage}
              setLogoMessage={setLogoMessage}
              brandText={brandText}
              setBrandText={setBrandText}
              brandTextMessage={brandTextMessage}
              setBrandTextMessage={setBrandTextMessage}
              onExportPhotos={handleExportPhotos}
              onImportPhotos={handleImportPhotos}
              importFileInputRef={importFileInputRef}
            />
                </div>
        ) : (
        <div className="admin-content-wrapper">
            {activeTab === 'tools' && <ToolsPanel />}
          {activeTab === 'upload' && (
            <form className="admin-upload-form" onSubmit={handleUpload}>
              <div className="form-section">
                <h2 className="form-section-title">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--accent)' }}>
                    <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M17 8L12 3L7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  上传照片
                </h2>
                
                {/* 上传目标存储（仅阿里云 OSS） */}
              <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginBottom: '12px',
                    padding: '8px 12px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '8px',
                      border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
                    当前上传目标：<strong>阿里云 OSS</strong>
                  </div>
              </div>

                {/* 上传方式切换（文件 / 直链） */}
                <div style={{ 
                  display: 'flex', 
                  gap: '12px', 
                  marginBottom: '20px',
                  padding: '8px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px'
                }}>
          <button
                  type="button"
                    onClick={() => handleUploadModeChange('file')}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: uploadForm.uploadMode === 'file' ? 'var(--accent)' : 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      color: uploadForm.uploadMode === 'file' ? 'var(--bg)' : 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      fontWeight: uploadForm.uploadMode === 'file' ? '600' : '400',
                      transition: 'all 0.2s'
                    }}
                  >
                    文件上传
          </button>
          <button
                  type="button"
                    onClick={() => handleUploadModeChange('url')}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: uploadForm.uploadMode === 'url' ? 'var(--accent)' : 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      color: uploadForm.uploadMode === 'url' ? 'var(--bg)' : 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      fontWeight: uploadForm.uploadMode === 'url' ? '600' : '400',
                      transition: 'all 0.2s'
                    }}
                  >
                    直链上传
                </button>
        </div>

                {uploadForm.uploadMode === 'file' ? (
                  <div className="upload-dropzone-new">
                    <input type="file" accept="image/*" onChange={handleFileChange} id="file-upload" />
                    <label htmlFor="file-upload" className="dropzone-label">
                      {uploadForm.preview ? (
                        <div className="preview-container">
                          <img src={uploadForm.preview} alt="预览" />
                          <button
                            type="button"
                            className="remove-preview"
                            onClick={(e) => {
                              e.preventDefault();
                              setUploadForm((prev) => ({ ...prev, file: null, preview: '' }));
                              const fileInput = document.getElementById('file-upload');
                              if (fileInput) fileInput.value = '';
                            }}
                          >
                            ✕
                          </button>
                          </div>
                      ) : (
                        <div className="dropzone-placeholder">
                          <div className="dropzone-icon">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="48">
                              <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3 9V7C3 6.46957 3.21071 5.96086 3.58579 5.58579C3.96086 5.21071 4.46957 5 5 5H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M21 9V7C21 6.46957 20.7893 5.96086 20.4142 5.58579C20.0391 5.21071 19.5304 5 19 5H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3 15V17C3 17.5304 3.21071 18.0391 3.58579 18.4142C3.96086 18.7893 4.46957 19 5 19H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M21 15V17C21 17.5304 20.7893 18.0391 20.4142 18.4142C20.0391 18.7893 19.5304 19 19 19H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                          <p className="dropzone-text">点击或拖拽上传照片</p>
                          <p className="dropzone-hint">支持 JPG、PNG 格式，推荐不超过 20MB</p>
                          </div>
                        )}
                    </label>
                      </div>
                    ) : (
                  <div className="form-grid">
                    <div className="form-group">
                      <label>缩略图直链地址 <span className="required">*</span></label>
                      <input
                        type="url"
                        name="thumbnailUrl"
                        placeholder="https://example.com/thumbnail.jpg"
                        value={uploadForm.thumbnailUrl}
                        onChange={handleFormChange}
                        required={uploadForm.uploadMode === 'url'}
                      />
                    </div>
                    <div className="form-group">
                      <label>原图直链地址 <span className="required">*</span></label>
                      <input
                        type="url"
                        name="imageUrl"
                        placeholder="https://example.com/image.jpg"
                        value={uploadForm.imageUrl}
                        onChange={handleFormChange}
                        required={uploadForm.uploadMode === 'url'}
                      />
                        </div>
                      </div>
                    )}
                </div>

              <div className="form-section">
                <h2 className="form-section-title">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--accent)' }}>
                    <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 9H9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  作品信息
                </h2>
              <div className="form-grid">
                  <div className="form-group">
                    <label>标题 <span className="required">*</span></label>
                  <input
                    type="text"
                    name="title"
                      placeholder="请输入作品标题"
                    value={uploadForm.title}
                    onChange={handleFormChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>拍摄地点 <span className="required">*</span></label>
                  <input
                    type="text"
                    name="location"
                    placeholder="城市 / 地标"
                    value={uploadForm.location}
                    onChange={handleFormChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>国家 / 地区 <span className="required">*</span></label>
                  <input
                    type="text"
                    name="country"
                    placeholder="例如：冰岛"
                    value={uploadForm.country}
                    onChange={handleFormChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>拍摄日期 <span className="required">*</span></label>
                    <input
                      type="date"
                      name="shotDate"
                      value={uploadForm.shotDate}
                    onChange={handleFormChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>分类 <span className="required">*</span></label>
                    <div className="category-select-wrapper">
                      <select 
                        name="category" 
                        value={uploadForm.category} 
                        onChange={handleFormChange}
                        className="category-select"
                      >
                        {tabs.map((tab) => (
                          <option key={tab.id} value={tab.id}>
                            {tab.label}
                          </option>
                        ))}
                      </select>
                      <div className="category-select-display">
                        <span className="category-select-text">
                          {tabs.find(tab => tab.id === uploadForm.category)?.label || '精选'}
                        </span>
                        <svg 
                          width="12" 
                          height="12" 
                          viewBox="0 0 12 12" 
                          fill="none" 
                          xmlns="http://www.w3.org/2000/svg"
                          className="category-select-arrow"
                        >
                          <path 
                            d="M3 4.5L6 7.5L9 4.5" 
                            stroke="currentColor" 
                            strokeWidth="1.5" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="form-group full-width">
                    <label>标签</label>
                  <input
                    type="text"
                    name="tags"
                      placeholder="旅行, 城市, 夜景（用逗号分隔）"
                    value={uploadForm.tags}
                    onChange={handleFormChange}
                  />
                  </div>
                  <div className="form-group">
                    <label>评级（1-10）</label>
                    <input
                      type="number"
                      name="rating"
                      min="1"
                      max="10"
                      value={uploadForm.rating}
                    onChange={handleFormChange}
                  />
                  </div>
                  {/* 地理位置信息 */}
                  <div className="form-group full-width">
                    <label>地理位置</label>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {uploadForm.latitude != null && uploadForm.longitude != null ? (
                        <>
                          <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
                            纬度: {Number(uploadForm.latitude).toFixed(6)}, 经度: {Number(uploadForm.longitude).toFixed(6)}
                            {uploadForm.altitude != null && `, 海拔: ${uploadForm.altitude}m`}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowLocationPicker(true)}
                            style={{
                              padding: '6px 12px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              fontSize: '0.85rem'
                            }}
                          >
                            修改位置
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowLocationPicker(true)}
                          style={{
                            padding: '10px 16px',
                            background: 'var(--accent)',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'var(--bg)',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: '500'
                          }}
                        >
                          在地图上选择位置
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h2 className="form-section-title">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--accent)' }}>
                    <path d="M23 19C23 19.5304 22.7893 20.0391 22.4142 20.4142C22.0391 20.7893 21.5304 21 21 21H3C2.46957 21 1.96086 20.7893 1.58579 20.4142C1.21071 20.0391 1 19.5304 1 19V8C1 7.46957 1.21071 6.96086 1.58579 6.58579C1.96086 6.21071 2.46957 6 3 6H7L9 4H15L17 6H21C21.5304 6 22.0391 6.21071 22.4142 6.58579C22.7893 6.96086 23 7.46957 23 8V19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  相机参数
                </h2>
                
                {/* 相机参数 */}
                <div className="form-grid" style={{ marginBottom: '20px' }}>
                  <div className="form-group">
                    <label>焦距</label>
                    <input
                      type="text"
                      name="focal"
                      placeholder="例如：50mm"
                      value={uploadForm.focal}
                      onChange={handleFormChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>光圈</label>
                    <input
                      type="text"
                      name="aperture"
                      placeholder="例如：f/2.8"
                      value={uploadForm.aperture}
                      onChange={handleFormChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>快门</label>
                    <input
                      type="text"
                      name="shutter"
                      placeholder="例如：1/125s"
                      value={uploadForm.shutter}
                      onChange={handleFormChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>ISO</label>
                    <input
                      type="text"
                      name="iso"
                      placeholder="例如：200"
                      value={uploadForm.iso}
                      onChange={handleFormChange}
                    />
                  </div>
                  <div className="form-group full-width">
                    <label>相机</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        name="camera"
                        placeholder="例如：Canon EOS 5D Mark IV"
                        value={uploadForm.camera}
                        onChange={handleFormChange}
                        onFocus={() => setShowCameraDropdown(true)}
                        onBlur={() => setTimeout(() => setShowCameraDropdown(false), 120)}
                        autoComplete="off"
                      />
                      {showCameraDropdown && uploadForm.camera && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: '100%',
                            marginTop: 4,
                            maxHeight: 160,
                            overflowY: 'auto',
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            zIndex: 20,
                          }}
                        >
                          {!cameraOptions.includes(uploadForm.camera.trim()) && (
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                addCameraOption(uploadForm.camera);
                                setShowCameraDropdown(false);
                              }}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '6px 10px',
                                background: 'rgba(255,255,255,0.04)',
                                border: 'none',
                                color: 'var(--accent)',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                borderBottom: cameraOptions.length ? '1px solid var(--border)' : 'none',
                              }}
                            >
                              添加「{uploadForm.camera.trim()}」到常用相机
                            </button>
                          )}
                          {cameraOptions
                            .filter((opt) =>
                              opt.toLowerCase().includes(uploadForm.camera.toLowerCase())
                            )
                            .map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setUploadForm((prev) => ({ ...prev, camera: opt }));
                                setShowCameraDropdown(false);
                              }}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '6px 10px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text)',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-group full-width">
                    <label>镜头</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        name="lens"
                        placeholder="例如：EF 70-200mm f/2.8L"
                        value={uploadForm.lens}
                        onChange={handleFormChange}
                        onFocus={() => setShowLensDropdown(true)}
                        onBlur={() => setTimeout(() => setShowLensDropdown(false), 120)}
                        autoComplete="off"
                      />
                      {showLensDropdown && uploadForm.lens && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: '100%',
                            marginTop: 4,
                            maxHeight: 160,
                            overflowY: 'auto',
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            zIndex: 20,
                          }}
                        >
                          {!lensOptions.includes(uploadForm.lens.trim()) && (
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                addLensOption(uploadForm.lens);
                                setShowLensDropdown(false);
                              }}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '6px 10px',
                                background: 'rgba(255,255,255,0.04)',
                                border: 'none',
                                color: 'var(--accent)',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                borderBottom: lensOptions.length ? '1px solid var(--border)' : 'none',
                              }}
                            >
                              添加「{uploadForm.lens.trim()}」到常用镜头
                            </button>
                          )}
                          {lensOptions
                            .filter((opt) =>
                              opt.toLowerCase().includes(uploadForm.lens.toLowerCase())
                            )
                            .map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setUploadForm((prev) => ({ ...prev, lens: opt }));
                                setShowLensDropdown(false);
                              }}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '6px 10px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text)',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={isUploading}>
                  <span>{isUploading ? '上传中...' : '提交审核'}</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setUploadForm({
                      title: '',
                      location: '',
                      country: '',
                      category: 'featured',
                      tags: '',
                      preview: '',
                      file: null,
                      uploadMode: 'file',
                      imageUrl: '',
                      latitude: null,
                      longitude: null,
                      altitude: null,
                    });
                    setSelectedLocation(null);
                    const fileInput = document.getElementById('file-upload');
                    if (fileInput) fileInput.value = '';
                  }}
                >
                  重置
                </button>
              </div>
            </form>
          )}

          {/* 地图选择器模态框 */}
          {showLocationPicker && (
            <div 
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '20px'
              }}
              onClick={() => setShowLocationPicker(false)}
            >
              <div 
                style={{
                  background: 'var(--bg)',
                  borderRadius: '16px',
                  padding: '24px',
                  maxWidth: '800px',
                  width: '100%',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={{ 
                  marginBottom: '16px', 
                  fontSize: '1.3rem',
                  color: 'var(--text)',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '12px'
                }}>
                  选择拍摄位置
                </h2>
                
                {/* 搜索框 */}
                <div style={{ marginBottom: '16px', position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="搜索地点（例如：北京、上海、天安门）"
                    value={locationSearchQuery}
                    onChange={(e) => setLocationSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      paddingRight: '40px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text)',
                      fontSize: '0.95rem'
                    }}
                  />
                  {isSearching && (
                    <div style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--muted)',
                      fontSize: '0.85rem'
                    }}>
                      搜索中...
                    </div>
                  )}
                  
                  {/* 搜索结果列表 */}
                  {searchResults.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: '4px',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      zIndex: 1000,
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                    }}>
                      {searchResults.map((result, index) => (
                        <div
                          key={index}
                          onClick={() => selectSearchResult(result, false)}
                          style={{
                            padding: '12px 16px',
                            cursor: 'pointer',
                            borderBottom: index < searchResults.length - 1 ? '1px solid var(--border)' : 'none',
                            transition: 'background 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.05)'}
                          onMouseLeave={(e) => e.target.style.background = 'transparent'}
                        >
                          <div style={{ 
                            fontSize: '0.95rem', 
                            color: 'var(--text)',
                            fontWeight: '500',
                            marginBottom: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span>{result.name.split(' · ')[0]}</span>
                            {result.type && (
                              <span style={{
                                fontSize: '0.75rem',
                                color: 'var(--muted)',
                                background: 'rgba(255, 255, 255, 0.1)',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}>
                                {result.type}
                              </span>
                            )}
                          </div>
                          <div style={{ 
                            fontSize: '0.85rem', 
                            color: 'var(--muted)',
                            marginBottom: '2px'
                          }}>
                            {result.address && <span>{result.address}</span>}
                            {result.address && result.district && <span> · </span>}
                            {result.district && <span>{result.district}</span>}
                          </div>
                          {result.tel && (
                            <div style={{ 
                              fontSize: '0.8rem', 
                              color: 'var(--muted)',
                              opacity: 0.8
                            }}>
                              📞 {result.tel}
                            </div>
                          )}
                          <div style={{ 
                            fontSize: '0.75rem', 
                            color: 'var(--muted)',
                            opacity: 0.6,
                            marginTop: '4px'
                          }}>
                            坐标: {result.lat.toFixed(6)}, {result.lon.toFixed(6)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div 
                  ref={locationMapContainerRef} 
                  className="geo-map-container"
                  style={{ 
                    width: '100%', 
                    height: '400px', 
                    marginBottom: '16px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1px solid var(--border)'
                  }}
                />
                {selectedLocation && (
                  <div style={{ 
                    marginBottom: '16px',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    color: 'var(--text)'
                  }}>
                    <div>纬度: {selectedLocation.lat.toFixed(6)}</div>
                    <div>经度: {selectedLocation.lon.toFixed(6)}</div>
                  </div>
                )}
                <div style={{ 
                  display: 'flex', 
                  gap: '12px', 
                  justifyContent: 'flex-end',
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border)'
                }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setShowLocationPicker(false);
                      setSelectedLocation(null);
                    }}
                    style={{ padding: '10px 20px' }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      if (selectedLocation) {
                        setUploadForm((prev) => ({
                          ...prev,
                          latitude: selectedLocation.lat,
                          longitude: selectedLocation.lon,
                        }));
                        setShowLocationPicker(false);
                        setSubmitMessage({ type: 'success', text: '位置已设置' });
                        setTimeout(() => setSubmitMessage({ type: '', text: '' }), 2000);
                      }
                    }}
                    style={{ padding: '10px 20px' }}
                    disabled={!selectedLocation}
                  >
                    确认
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pending' && (
            <div className="admin-list-section">
              <div className="list-header">
                <h2>待审核作品</h2>
                <span className="list-count">{pendingReviewCount} 条</span>
              </div>
              <div className="admin-list">
                {adminUploads.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="64">
                        <path d="M3 7V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M3 7L12 14L21 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M3 7V19C3 19.5304 3.21071 20.0391 3.58579 20.4142C3.96086 20.7893 4.46957 21 5 21H19C19.5304 21 20.0391 20.7893 20.4142 20.4142C20.7893 20.0391 21 19.5304 21 19V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <p className="empty-text">暂无待审核作品</p>
                    <p className="empty-hint">提交作品后将显示在此</p>
                  </div>
                ) : (
                  adminUploads.map((item) => (
                    <article key={item.id} className="admin-list-item pending compact">
                      <div className="item-image compact">
                        {item.preview ? (
                          <img src={item.preview} alt={item.title} />
                        ) : (
                          <div className="image-placeholder">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32">
                              <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3 9V7C3 6.46957 3.21071 5.96086 3.58579 5.58579C3.96086 5.21071 4.46957 5 5 5H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M21 9V7C21 6.46957 20.7893 5.96086 20.4142 5.58579C20.0391 5.21071 19.5304 5 19 5H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3 15V17C3 17.5304 3.21071 18.0391 3.58579 18.4142C3.96086 18.7893 4.46957 19 5 19H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M21 15V17C21 17.5304 20.7893 18.0391 20.4142 18.4142C20.0391 18.7893 19.5304 19 19 19H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                        <span className="item-tag" style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          background: 'rgba(255, 193, 7, 0.9)',
                          color: '#000',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}>
                          {tabs.find((tab) => tab.id === item.category)?.label || '未知'}
                        </span>
                      </div>
                      <div className="item-content compact">
                        <h3 style={{ 
                          fontSize: '0.95rem', 
                          fontWeight: '600', 
                          marginBottom: '8px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {item.title || '未命名作品'}
                        </h3>
                        <p className="item-location" style={{ 
                          fontSize: '0.85rem', 
                          color: 'var(--muted)',
                          marginBottom: '8px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {item.country || ''}{item.country && item.location ? ' · ' : ''}{item.location || ''}
                        </p>
                        <div className="item-meta" style={{ 
                          fontSize: '0.8rem', 
                          color: 'var(--muted)',
                          marginBottom: '8px'
                        }}>
                          {item.focal && item.aperture && item.shutter && item.iso ? (
                            <>
                              <span>{item.focal}</span>
                              <span>·</span>
                              <span>{item.aperture}</span>
                              <span>·</span>
                              <span>{item.shutter}</span>
                              <span>·</span>
                              <span>ISO {item.iso}</span>
                            </>
                          ) : (
                            <span>相机参数未设置</span>
                          )}
                        </div>
                        {item.camera && item.lens && (
                          <div style={{ 
                            fontSize: '0.75rem', 
                            color: 'var(--muted)',
                            opacity: 0.8,
                            marginBottom: '8px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {item.camera} · {item.lens}
                          </div>
                        )}
                        <p className="item-time" style={{ 
                          fontSize: '0.7rem', 
                          color: 'var(--muted)',
                          opacity: 0.7
                        }}>
                          {new Date(item.createdAt).toLocaleString('zh-CN')}
                        </p>
                      </div>
                      <div className="item-actions compact" style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        flexShrink: 0,
                        minWidth: '80px',
                        alignItems: 'stretch'
                      }}>
                        <button
                          className="btn-approve"
                          onClick={() => handleApproveWithTabSwitch(item.id)}
                          style={{ 
                            width: '100%',
                            fontSize: '0.85rem', 
                            padding: '10px 16px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          ✓ 通过
                        </button>
                        <button
                          className="btn-reject"
                          onClick={() => handleRejectWithTabSwitch(item.id)}
                          style={{ 
                            width: '100%',
                            fontSize: '0.85rem', 
                            padding: '10px 16px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          ✕ 拒绝
                        </button>
                      </div>
                  </article>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'rejected' && (
            <div className="admin-list-section">
              <div className="list-header">
                <h2>已拒绝作品</h2>
                <span className="list-count">{rejectedCount} 条</span>
              </div>

              <div className="admin-list">
                {rejectedPhotos.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="64">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                        <path d="M15 9L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M9 9L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <p className="empty-text">暂无已拒绝作品</p>
                    <p className="empty-hint">被拒绝的作品将显示在此</p>
                  </div>
                ) : (
                  rejectedPhotos.map((item) => (
                    <article key={item.id} className="admin-list-item rejected compact">
                      <div className="item-image compact">
                        {item.preview ? (
                          <img src={item.preview} alt={item.title} />
                        ) : (
                          <div className="image-placeholder">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32">
                              <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3 9V7C3 6.46957 3.21071 5.96086 3.58579 5.58579C3.96086 5.21071 4.46957 5 5 5H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M21 9V7C21 6.46957 20.7893 5.96086 20.4142 5.58579C20.0391 5.21071 19.5304 5 19 5H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3 15V17C3 17.5304 3.21071 18.0391 3.58579 18.4142C3.96086 18.7893 4.46957 19 5 19H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M21 15V17C21 17.5304 20.7893 18.0391 20.4142 18.4142C20.0391 18.7893 19.5304 19 19 19H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                        <span className="item-tag" style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          background: '#dc2626',
                          color: '#fff',
                          fontSize: '0.7rem',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontWeight: '600'
                        }}>
                          已拒绝
                        </span>
                      </div>
                      <div className="item-content">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                            {item.title}
                          </h3>
                        </div>
                        <p className="item-location" style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                          {item.country} · {item.location}
                        </p>
                        {item.reject_reason && (
                          <div style={{
                            marginBottom: '12px',
                            padding: '12px',
                            background: 'rgba(220, 38, 38, 0.1)',
                            border: '1px solid rgba(220, 38, 38, 0.2)',
                            borderRadius: '8px',
                            borderLeft: '3px solid #dc2626'
                          }}>
                            <div style={{
                              fontSize: '0.8rem',
                              fontWeight: '600',
                              color: '#dc2626',
                              marginBottom: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                                <path d="M12 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                <path d="M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                              </svg>
                              拒绝原因
                            </div>
                            <p style={{
                              margin: 0,
                              fontSize: '0.85rem',
                              color: 'var(--text)',
                              lineHeight: '1.5',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word'
                            }}>
                              {item.reject_reason}
                            </p>
                          </div>
                        )}
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '12px' }}>
                          <div style={{ marginBottom: '4px' }}>
                            {item.focal || '50mm'} · {item.aperture || 'f/2.8'} · {item.shutter || '1/125s'} · ISO {item.iso || '200'}
                          </div>
                          <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                            {item.camera || 'Unknown'} · {item.lens || 'Unknown'}
                          </div>
                          {item.createdAt && (
                            <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '4px' }}>
                              {new Date(item.createdAt).toLocaleString('zh-CN')}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                          <button
                            className="btn-approve"
                            onClick={() => handleEdit(item)}
                            style={{ 
                              flex: 1,
                              fontSize: '0.85rem', 
                              padding: '10px 16px',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            ✎ 编辑
                          </button>
                          <button
                            className="btn-primary"
                            onClick={async () => {
                              // 重新提交审核
                              const itemToResubmit = { ...item, status: 'pending' };
                              
                              // 从已拒绝列表移除
                              setRejectedPhotos((prev) => {
                                const updated = prev.filter((p) => p.id !== item.id);
                                if (!supabase) {
                                  try {
                                    Storage.set(REJECTED_STORAGE_KEY, updated);
                                  } catch (error) {
                                    handleError(error, {
                                      context: 'handleReject.updateList',
                                      type: ErrorType.STORAGE,
                                      silent: true,
                                    });
                                  }
                                }
                                return updated;
                              });

                              // 添加到待审核列表
                              setAdminUploads((prev) => [itemToResubmit, ...prev]);

                              if (supabase) {
                                try {
                                  await supabase
                                    .from('photos')
                                    .update({ status: 'pending' })
                                    .eq('id', item.id);
                                  await refreshSupabaseData();
                                } catch (error) {
                                  handleError(error, {
                                    context: 'handleResubmit',
                                    type: ErrorType.NETWORK,
                                  });
                                  setSubmitMessage({ type: 'error', text: `重新提交失败：${error.message}` });
                                  return;
                                }
                              }

                              setSubmitMessage({ type: 'success', text: '作品已重新提交审核' });
                              setActiveTab('pending');
                              setTimeout(() => {
                                setSubmitMessage({ type: '', text: '' });
                              }, 3000);
                            }}
                            style={{ 
                              flex: 1,
                              fontSize: '0.85rem', 
                              padding: '10px 16px',
                              whiteSpace: 'nowrap',
                              background: 'var(--accent)'
                            }}
                          >
                            ↻ 重新提交
                          </button>
                        </div>
                      </div>
                  </article>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'approved' && (
            <div className="admin-list-section">
              <div className="list-header">
                <h2>已审核作品</h2>
                <span className="list-count">{filteredPhotos.length} / {approvedCount} 条</span>
              </div>

              {/* 搜索和筛选栏 */}
              <div style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '16px',
                flexWrap: 'wrap',
                alignItems: 'center'
              }}>
                <div style={{ flex: 1, minWidth: '200px', maxWidth: '400px' }}>
                  <input
                    type="text"
                    placeholder="搜索标题、地点、相机、镜头..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text)',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
                <div style={{ minWidth: '150px' }}>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text)',
                      fontSize: '0.9rem',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">全部分类</option>
                    {tabs.map((tab) => (
                      <option key={tab.id} value={tab.id}>
                        {tab.label}
                      </option>
                    ))}
                  </select>
                </div>
                {(searchQuery || filterCategory) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setFilterCategory('');
                    }}
                    style={{
                      padding: '10px 16px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    清除筛选
                  </button>
                )}
              </div>

              <div className="admin-list grid">
                {paginatedPhotos.length === 0 ? (
                  <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                    <div className="empty-icon">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="64">
                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <p className="empty-text">
                      {approvedPhotos.length === 0 ? '暂无已审核作品' : '没有找到匹配的作品'}
                    </p>
                    <p className="empty-hint">
                      {approvedPhotos.length === 0 ? '通过审核的作品将显示在此' : '请尝试其他搜索关键词或筛选条件'}
                    </p>
                  </div>
                ) : (
                  paginatedPhotos.map((item) => (
                    <article key={item.id} className="admin-list-item approved grid-item">
                      <div className="item-image grid-item-image">
                        {(item.thumbnail || item.preview || item.image) ? (
                          <img src={item.thumbnail || item.preview || item.image} alt={item.title} />
                        ) : (
                          <div className="image-placeholder">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32">
                              <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3 9V7C3 6.46957 3.21071 5.96086 3.58579 5.58579C3.96086 5.21071 4.46957 5 5 5H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M21 9V7C21 6.46957 20.7893 5.96086 20.4142 5.58579C20.0391 5.21071 19.5304 5 19 5H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3 15V17C3 17.5304 3.21071 18.0391 3.58579 18.4142C3.96086 18.7893 4.46957 19 5 19H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M21 15V17C21 17.5304 20.7893 18.0391 20.4142 18.4142C20.0391 18.7893 19.5304 19 19 19H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="item-content grid-item-content">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.title}
                          </h3>
                          <span className="item-tag" style={{ fontSize: '0.7rem', padding: '2px 6px', marginLeft: '6px', flexShrink: 0 }}>
                            {tabs.find((tab) => tab.id === item.category)?.label || '未知'}
                          </span>
                        </div>
                        <p className="item-location" style={{ margin: 0, fontSize: '0.75rem', marginBottom: '8px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.country} · {item.location}
                        </p>
                        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', lineHeight: '1.4', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span>{item.focal || '50mm'}</span>
                            <span>·</span>
                            <span>{item.aperture || 'f/2.8'}</span>
                            <span>·</span>
                            <span>{item.shutter || '1/125s'}</span>
                            <span>·</span>
                            <span>ISO {item.iso || '200'}</span>
                          </div>
                          <div style={{ fontSize: '0.65rem', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.camera || 'Unknown'} · {item.lens || 'Unknown'}
                          </div>
                        </div>
                {item.hidden && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--warning)', marginBottom: '6px' }}>
                    已隐藏（前台不会展示）
                  </div>
                )}
                        <button
                          className="btn-approve"
                          onClick={() => handleEdit(item)}
                          style={{ 
                            fontSize: '0.75rem', 
                            padding: '6px 12px',
                            width: '100%',
                            marginTop: 'auto'
                          }}
                        >
                          ✎ 编辑
                        </button>
                      </div>
                  </article>
                  ))
                )}

                {/* 分页控件 */}
                {totalPages > 1 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '24px',
                      paddingTop: '20px',
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      style={{
                        padding: '8px 16px',
                        background: currentPage === 1 ? 'transparent' : 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: currentPage === 1 ? 'var(--muted)' : 'var(--text)',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        fontSize: '0.9rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      上一页
                    </button>
                    <div
                      style={{
                        display: 'flex',
                        gap: '4px',
                        alignItems: 'center',
                      }}
                    >
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => setCurrentPage(pageNum)}
                            style={{
                              minWidth: '36px',
                              padding: '8px 12px',
                              background:
                                currentPage === pageNum ? 'var(--accent)' : 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              color: currentPage === pageNum ? 'var(--bg)' : 'var(--text)',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              fontWeight: currentPage === pageNum ? '600' : '400',
                            }}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <span style={{ color: 'var(--muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                      第 {currentPage} / {totalPages} 页
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        padding: '8px 16px',
                        background:
                          currentPage === totalPages ? 'transparent' : 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: currentPage === totalPages ? 'var(--muted)' : 'var(--text)',
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        fontSize: '0.9rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      下一页
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 编辑模态框 */}
          {editingPhotoId && (
            <div 
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '20px'
              }}
              onClick={handleCancelEdit}
            >
              <div 
                className="edit-modal-content"
                style={{
                  background: 'var(--bg)',
                  borderRadius: '16px',
                  padding: '32px',
                  maxWidth: '600px',
                  width: '100%',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                  scrollbarWidth: 'none', /* Firefox */
                  msOverflowStyle: 'none' /* IE and Edge */
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={{ 
                  marginBottom: '24px', 
                  fontSize: '1.5rem',
                  color: 'var(--text)',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '16px'
                }}>
                  编辑作品信息
                </h2>
                
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ 
                    fontSize: '1.1rem',
                    color: 'var(--text)',
                    marginBottom: '16px',
                    fontWeight: '600'
                  }}>
                    基本信息
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>标题 <span className="required">*</span></label>
                      <input
                        type="text"
                        placeholder="请输入作品标题"
                        value={editForm.title}
                        onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--text)',
                          fontSize: '0.95rem'
                        }}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label>拍摄地点 <span className="required">*</span></label>
                      <input
                        type="text"
                        placeholder="城市/地标"
                        value={editForm.location}
                        onChange={(e) => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--text)',
                          fontSize: '0.95rem'
                        }}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label>国家/地区 <span className="required">*</span></label>
                      <input
                        type="text"
                        placeholder="例如: 冰岛"
                        value={editForm.country}
                        onChange={(e) => setEditForm(prev => ({ ...prev, country: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--text)',
                          fontSize: '0.95rem'
                        }}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label>分类 <span className="required">*</span></label>
                      <div className="category-select-wrapper">
                        <select 
                          value={editForm.category} 
                          onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                          className="category-select"
                        >
                          {tabs.map((tab) => (
                            <option key={tab.id} value={tab.id}>
                              {tab.label}
                            </option>
                          ))}
                        </select>
                        <div className="category-select-display">
                          <span className="category-select-text">
                            {tabs.find(tab => tab.id === editForm.category)?.label || '精选'}
                          </span>
                          <svg 
                            width="12" 
                            height="12" 
                            viewBox="0 0 12 12" 
                            fill="none" 
                            xmlns="http://www.w3.org/2000/svg"
                            className="category-select-arrow"
                          >
                            <path 
                              d="M3 4.5L6 7.5L9 4.5" 
                              stroke="currentColor" 
                              strokeWidth="1.5" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                    
                    <div className="form-group">
                      <label>评级（1-10）</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={editForm.rating}
                        onChange={(e) => setEditForm(prev => ({ ...prev, rating: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--text)',
                          fontSize: '0.95rem'
                        }}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label>拍摄日期</label>
                      <input
                        type="date"
                        value={editForm.shotDate}
                        onChange={(e) => setEditForm(prev => ({ ...prev, shotDate: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--text)',
                          fontSize: '0.95rem'
                        }}
                      />
                    </div>
                  </div>
                </div>
                
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ 
                    fontSize: '1.1rem',
                    color: 'var(--text)',
                    marginBottom: '16px',
                    fontWeight: '600'
                  }}>
                    相机参数
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  <div className="form-group">
                    <label>焦距 <span className="required">*</span></label>
                    <input
                      type="text"
                      placeholder="例如: 50mm"
                      value={editForm.focal}
                      onChange={(e) => setEditForm(prev => ({ ...prev, focal: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: 'var(--text)'
                      }}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>光圈 <span className="required">*</span></label>
                    <input
                      type="text"
                      placeholder="例如: f/2.8"
                      value={editForm.aperture}
                      onChange={(e) => setEditForm(prev => ({ ...prev, aperture: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: 'var(--text)'
                      }}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>快门 <span className="required">*</span></label>
                    <input
                      type="text"
                      placeholder="例如: 1/125s"
                      value={editForm.shutter}
                      onChange={(e) => setEditForm(prev => ({ ...prev, shutter: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: 'var(--text)'
                      }}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>ISO <span className="required">*</span></label>
                    <input
                      type="text"
                      placeholder="例如: 200"
                      value={editForm.iso}
                      onChange={(e) => setEditForm(prev => ({ ...prev, iso: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: 'var(--text)'
                      }}
                    />
                  </div>
                  
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>相机</label>
                    <input
                      type="text"
                      placeholder="例如: Canon EOS 5D Mark IV"
                      value={editForm.camera}
                      onChange={(e) => setEditForm(prev => ({ ...prev, camera: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: 'var(--text)'
                      }}
                    />
                  </div>
                  
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>镜头</label>
                    <input
                      type="text"
                      placeholder="例如: EF 70-200mm f/2.8L"
                      value={editForm.lens}
                      onChange={(e) => setEditForm(prev => ({ ...prev, lens: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: 'var(--text)'
                      }}
                    />
                  </div>
                  </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h3
                    style={{
                      fontSize: '1.1rem',
                      color: 'var(--text)',
                      marginBottom: '12px',
                      fontWeight: '600',
                    }}
                  >
                    显示控制
                  </h3>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!editForm.hidden}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, hidden: !e.target.checked }))
                      }
                      style={{ width: '16px', height: '16px' }}
                    />
                    <span>
                      在前台展示这张照片
                      <span style={{ marginLeft: '6px', color: 'var(--muted)', fontSize: '0.85rem' }}>
                        （取消勾选则仅在后台保留，前台不会显示）
                      </span>
                    </span>
                  </label>
                </div>
                
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ 
                    fontSize: '1.1rem',
                    color: 'var(--text)',
                    marginBottom: '16px',
                    fontWeight: '600'
                  }}>
                    地理位置
                  </h3>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {editForm.latitude != null && editForm.longitude != null ? (
                        <>
                          <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
                            纬度: {Number(editForm.latitude).toFixed(6)}, 经度: {Number(editForm.longitude).toFixed(6)}
                            {editForm.altitude != null && `, 海拔: ${editForm.altitude}m`}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowEditLocationPicker(true)}
                            style={{
                              padding: '6px 12px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              fontSize: '0.85rem'
                            }}
                          >
                            修改位置
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditForm(prev => ({
                                ...prev,
                                latitude: null,
                                longitude: null,
                                altitude: null
                              }));
                            }}
                            style={{
                              padding: '6px 12px',
                              background: 'rgba(255, 0, 0, 0.1)',
                              border: '1px solid rgba(255, 0, 0, 0.3)',
                              borderRadius: '6px',
                              color: '#ff6b6b',
                              cursor: 'pointer',
                              fontSize: '0.85rem'
                            }}
                          >
                            清除位置
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowEditLocationPicker(true)}
                          style={{
                            padding: '8px 16px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            color: 'var(--text)',
                            cursor: 'pointer',
                            fontSize: '0.9rem'
                          }}
                        >
                          选择位置
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                
                <div style={{ 
                  display: 'flex', 
                  gap: '12px', 
                  justifyContent: 'space-between',
                  marginTop: '24px',
                  paddingTop: '20px',
                  borderTop: '1px solid var(--border)'
                }}>
                  <button
                    type="button"
                    onClick={handleDeleteFromEdit}
                    style={{ 
                      padding: '10px 20px',
                      background: 'rgba(231, 76, 60, 0.1)',
                      border: '1px solid rgba(231, 76, 60, 0.3)',
                      borderRadius: '8px',
                      color: '#e74c3c',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'rgba(231, 76, 60, 0.2)';
                      e.target.style.borderColor = 'rgba(231, 76, 60, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'rgba(231, 76, 60, 0.1)';
                      e.target.style.borderColor = 'rgba(231, 76, 60, 0.3)';
                    }}
                  >
                    删除作品
                  </button>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleCancelEdit}
                      style={{ padding: '10px 20px' }}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleSaveEdit}
                      style={{ padding: '10px 20px' }}
                    >
                      保存
                    </button>
                  </div>
              </div>
            </div>
          </div>
          )}

          {/* 编辑表单的地图选择器模态框 */}
          {showEditLocationPicker && (
            <div 
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1001,
                padding: '20px'
              }}
              onClick={() => setShowEditLocationPicker(false)}
            >
              <div 
                style={{
                  background: 'var(--bg)',
                  borderRadius: '16px',
                  padding: '24px',
                  maxWidth: '800px',
                  width: '100%',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={{ 
                  marginBottom: '16px', 
                  fontSize: '1.3rem',
                  color: 'var(--text)',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '12px'
                }}>
                  选择拍摄位置
                </h2>
                
                {/* 搜索框 */}
                <div style={{ marginBottom: '16px', position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="搜索地点（例如：北京、上海、天安门）"
                    value={editLocationSearchQuery}
                    onChange={(e) => setEditLocationSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      paddingRight: '40px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text)',
                      fontSize: '0.95rem'
                    }}
                  />
                  {isEditSearching && (
                    <div style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--muted)',
                      fontSize: '0.85rem'
                    }}>
                      搜索中...
                    </div>
                  )}
                  
                  {/* 搜索结果列表 */}
                  {editSearchResults.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: '4px',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      zIndex: 1000,
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                    }}>
                      {editSearchResults.map((result, index) => (
                        <div
                          key={index}
                          onClick={() => selectSearchResult(result, true)}
                          style={{
                            padding: '12px 16px',
                            cursor: 'pointer',
                            borderBottom: index < editSearchResults.length - 1 ? '1px solid var(--border)' : 'none',
                            transition: 'background 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.05)'}
                          onMouseLeave={(e) => e.target.style.background = 'transparent'}
                        >
                          <div style={{ 
                            fontSize: '0.95rem', 
                            color: 'var(--text)',
                            fontWeight: '500',
                            marginBottom: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span>{result.name.split(' · ')[0]}</span>
                            {result.type && (
                              <span style={{
                                fontSize: '0.75rem',
                                color: 'var(--muted)',
                                background: 'rgba(255, 255, 255, 0.1)',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}>
                                {result.type}
                              </span>
                            )}
                          </div>
                          <div style={{ 
                            fontSize: '0.85rem', 
                            color: 'var(--muted)',
                            marginBottom: '2px'
                          }}>
                            {result.address && <span>{result.address}</span>}
                            {result.address && result.district && <span> · </span>}
                            {result.district && <span>{result.district}</span>}
                          </div>
                          {result.tel && (
                            <div style={{ 
                              fontSize: '0.8rem', 
                              color: 'var(--muted)',
                              opacity: 0.8
                            }}>
                              📞 {result.tel}
                            </div>
                          )}
                          <div style={{ 
                            fontSize: '0.75rem', 
                            color: 'var(--muted)',
                            opacity: 0.6,
                            marginTop: '4px'
                          }}>
                            坐标: {result.lat.toFixed(6)}, {result.lon.toFixed(6)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div 
                  ref={editLocationMapContainerRef} 
                  className="geo-map-container"
                  style={{ 
                    width: '100%', 
                    height: '400px', 
                    marginBottom: '16px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1px solid var(--border)'
                  }}
                />
                {editSelectedLocation && (
                  <div style={{ 
                    marginBottom: '16px',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    color: 'var(--text)'
                  }}>
                    <div>纬度: {editSelectedLocation.lat.toFixed(6)}</div>
                    <div>经度: {editSelectedLocation.lon.toFixed(6)}</div>
                  </div>
                )}
                <div style={{ 
                  display: 'flex', 
                  gap: '12px', 
                  justifyContent: 'flex-end',
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border)'
                }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setShowEditLocationPicker(false);
                      setEditSelectedLocation(null);
                    }}
                    style={{ padding: '10px 20px' }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      if (editSelectedLocation) {
                        setEditForm((prev) => ({
                          ...prev,
                          latitude: editSelectedLocation.lat,
                          longitude: editSelectedLocation.lon,
                        }));
                        setShowEditLocationPicker(false);
                        setEditSelectedLocation(null);
                      }
                    }}
                    style={{ padding: '10px 20px' }}
                  >
                    确定
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
        )}
      </main>
    </div>
  );
}
