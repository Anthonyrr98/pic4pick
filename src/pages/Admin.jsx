import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { zhCN } from 'date-fns/locale';
import exifr from 'exifr';
import '../App.css';
import { uploadImage, getUploadType, setUploadType, UPLOAD_TYPES, compressImage } from '../utils/upload';
import { getSupabaseClient } from '../utils/supabaseClient';
import { UploadProgress } from '../components/UploadProgress';
import { getEnvValue } from '../utils/envConfig';
import { Storage, STORAGE_KEYS } from '../utils/storage';
import { handleError, formatErrorMessage, ErrorType } from '../utils/errorHandler';
import { mapSupabaseRowToPhoto, buildSupabasePayloadFromPhoto, getUploadTypeName, getAmapApiUrl } from '../utils/adminUtils';
import { ensureHttps } from '../utils/urlUtils';
import { login as loginWithApi, verifyToken } from '../utils/auth';
import { ThemeSwitcher } from '../themes/ThemeSwitcher';
import {
  createAdminPhoto,
  fetchAdminPhotos,
  updateAdminPhoto,
} from '../utils/adminApi';
import { usePhotoManagement } from '../hooks/usePhotoManagement';
import { createPhotoSubmission } from '../utils/photoSubmission';
import { useGearOptions } from '../hooks/useGearOptions';
import { useBrandConfig } from '../hooks/useBrandConfig';
import { useFileUpload } from '../hooks/useFileUpload';
import { ConfigPanel } from '../components/admin/ConfigPanel';
import { loadMapLibre } from '../utils/maplibreLoader';
import { getDefaultMaplibreStyle, getMapStylePresetFromEnv } from '../utils/gaodeMapStyle';
import { escapeHtml } from '../utils/security';
import { PHOTO_CATEGORIES, normalizePhotoCategory } from '../utils/photoCategories';

const tabs = PHOTO_CATEGORIES;

const FILM_STOCK_TAG_PREFIX = 'film_stock:';
const FILM_STOCK_OPTIONS = [
  'Kodak Portra 400',
  'Kodak Gold 200',
  'Kodak Ektar 100',
  'Fuji Pro 400H',
  'Fuji Superia 400',
  'Ilford HP5 Plus 400',
  'Ilford Delta 100',
  'Cinestill 800T',
];

const MAX_UPLOAD_FILE_SIZE = 100 * 1024 * 1024;
const OPTIMIZE_UPLOAD_THRESHOLD = 6 * 1024 * 1024;
const UPLOAD_OPTIMIZE_OPTIONS = { maxWidth: 2560, maxHeight: 2560, quality: 0.88 };
const SUPPORTED_UPLOAD_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SUPPORTED_UPLOAD_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const EMPTY_PHOTO_METADATA = {
  location: '', country: '', shotDate: '', focal: '', aperture: '', shutter: '',
  iso: '', camera: '', lens: '', latitude: null, longitude: null, altitude: null,
};

const BACKEND_WAKE_HINT = '正在连接后台服务。Render 免费实例冷启动可能需要 30 秒左右，请稍等。';
const BATCH_DELETE_CONFIRM_TEXT = 'DELETE';

const formatFileSize = (bytes = 0) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** exponent);
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
};

const getFileExtension = (filename = '') => filename.split('.').pop()?.toLowerCase() || '';

const isSupportedUploadFile = (file) => {
  const mimeType = file.type?.toLowerCase();
  const extension = getFileExtension(file.name);
  return SUPPORTED_UPLOAD_MIME_TYPES.has(mimeType) || SUPPORTED_UPLOAD_EXTENSIONS.has(extension);
};

const getUploadFileValidationError = (file) => {
  if (!isSupportedUploadFile(file)) {
    return '请上传 JPG、PNG 或 WEBP 图片。';
  }
  if (file.size > MAX_UPLOAD_FILE_SIZE) {
    return `图片不能超过 ${formatFileSize(MAX_UPLOAD_FILE_SIZE)}，请先压缩后再上传。`;
  }
  return '';
};

const maybeOptimizeUploadFile = async (file) => {
  if (file.size < OPTIMIZE_UPLOAD_THRESHOLD || !SUPPORTED_UPLOAD_MIME_TYPES.has(file.type)) {
    return { file, optimized: false };
  }

  try {
    const optimizedFile = await compressImage(file, UPLOAD_OPTIMIZE_OPTIONS);
    if (optimizedFile.size > 0 && optimizedFile.size < file.size * 0.92) {
      return {
        file: new File([optimizedFile], file.name, {
          type: optimizedFile.type || file.type,
          lastModified: file.lastModified,
        }),
        optimized: true,
      };
    }
  } catch (error) {
    handleError(error, {
      context: 'maybeOptimizeUploadFile',
      type: ErrorType.PARSE,
      silent: true,
    });
  }

  return { file, optimized: false };
};

const isLocalFrontend = () => {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
};

const getBackendUnavailableMessage = () => (
  isLocalFrontend()
    ? '无法连接登录服务，请先运行后端：npm run server'
    : '无法连接后台服务。Render 免费实例可能正在唤醒，请稍等 30 秒后重试。'
);

const isBackendUnavailableError = (error, message = '') => {
  const text = `${message} ${error?.message || ''}`.toLowerCase();
  return (
    message === '网络连接失败，请检查网络设置' ||
    text.includes('failed to fetch') ||
    text.includes('load failed') ||
    text.includes('network') ||
    text.includes('timeout') ||
    text.includes('502') ||
    text.includes('503') ||
    text.includes('504')
  );
};

const getFriendlyAdminErrorMessage = (error, fallback) => {
  const message = formatErrorMessage(error);
  if (isBackendUnavailableError(error, message)) {
    return getBackendUnavailableMessage();
  }
  if (/未登录|unauthorized|jwt|token|401/i.test(`${message} ${error?.message || ''}`)) {
    return '登录状态已过期，请刷新页面后重新登录。';
  }
  return message || fallback;
};

const extractFilmStockFromTags = (tags = '') => {
  if (!tags) return '';
  const parts = String(tags)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const matched = parts.find((item) => item.toLowerCase().startsWith(FILM_STOCK_TAG_PREFIX));
  return matched ? matched.slice(FILM_STOCK_TAG_PREFIX.length).trim() : '';
};

const mergeTagsWithFilmStock = (tags = '', category = '', filmStock = '') => {
  const parts = String(tags)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !item.toLowerCase().startsWith(FILM_STOCK_TAG_PREFIX));

  if (category === 'film' && filmStock.trim()) {
    parts.push(`${FILM_STOCK_TAG_PREFIX}${filmStock.trim()}`);
  }

  return parts.join(', ');
};

const parseDateValue = (value) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateValue = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 使用统一的存储键常量
const STORAGE_KEY = STORAGE_KEYS.ADMIN_UPLOADS;
const APPROVED_STORAGE_KEY = STORAGE_KEYS.APPROVED_PHOTOS;
const REJECTED_STORAGE_KEY = STORAGE_KEYS.REJECTED_PHOTOS;

const clearLocalPhotoCaches = () => {
  Storage.remove(STORAGE_KEY);
  Storage.remove(APPROVED_STORAGE_KEY);
  Storage.remove(REJECTED_STORAGE_KEY);
};

// getUploadTypeName 已移至 adminUtils.js

export function AdminPage() {
  // === 原有状态 ===
  // mapSupabaseRowToPhoto 和 buildSupabasePayloadFromPhoto 已移至 adminUtils.js

  const supabase = getSupabaseClient();
  const [envConfigForm, setEnvConfigForm] = useState(() => ({
    supabaseUrl: getEnvValue('VITE_SUPABASE_URL', ''),
    supabaseAnonKey: getEnvValue('VITE_SUPABASE_ANON_KEY', ''),
    apiBaseUrl: getEnvValue('VITE_API_BASE_URL', ''),
    ossBackendUrl: getEnvValue('VITE_ALIYUN_OSS_BACKEND_URL', ''),
    amapWebKey: getEnvValue('VITE_AMAP_WEB_KEY', getEnvValue('VITE_AMAP_KEY', '')),
    amapSecurityJsCode: getEnvValue('VITE_AMAP_SECURITY_JS_CODE', ''),
    amapServiceKey: getEnvValue('VITE_AMAP_WEB_SERVICE_KEY', getEnvValue('VITE_AMAP_KEY', '')),
    mapStylePreset: getMapStylePresetFromEnv(),
  }));
  const [envConfigMessage, setEnvConfigMessage] = useState({ type: '', text: '' });
  // 照片管理 hook 将在后面初始化（需要 refreshSupabaseData）
  const [uploadForm, setUploadForm] = useState({
    title: '',
    location: '',
    country: '',
    category: 'latest',
    tags: '',
    preview: '',
    file: null,
    fileMeta: null,
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
    filmStock: '',
  });
  const fileSelectionVersionRef = useRef(0);
  const fileReadInProgressRef = useRef(false);
  const photoSubmissionRef = useRef(null);
  if (photoSubmissionRef.current == null) {
    photoSubmissionRef.current = createPhotoSubmission({ uploadImage, createPhoto: createAdminPhoto, storage: Storage });
  }
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const [showEditCameraDropdown, setShowEditCameraDropdown] = useState(false);
  const [showEditLensDropdown, setShowEditLensDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showEditCategoryDropdown, setShowEditCategoryDropdown] = useState(false);
  const [showFilterCategoryDropdown, setShowFilterCategoryDropdown] = useState(false);
  // 使用相机/镜头选项管理 hook
  const {
    cameraOptions,
    lensOptions,
    showCameraDropdown,
    setShowCameraDropdown,
    showLensDropdown,
    setShowLensDropdown,
    addCameraOption,
    addLensOption,
  } = useGearOptions(supabase);

  const [isAdminAuthed, setIsAdminAuthed] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [adminUsernameInput, setAdminUsernameInput] = useState('admin');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');
  const [isAdminLoginSubmitting, setIsAdminLoginSubmitting] = useState(false);
  const [showBackendWakeHint, setShowBackendWakeHint] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const locationMapContainerRef = useRef(null);
  const locationMapInstance = useRef(null);
  const maplibreRef = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState(null); // { lat, lon }
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [submitMessage, setSubmitMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'pending' | 'approved' | 'rejected' | 'config'
  const [selectedPhotoIds, setSelectedPhotoIds] = useState(() => new Set());
  const [isBatchWorking, setIsBatchWorking] = useState(false);
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);
  const [batchDeleteConfirmInput, setBatchDeleteConfirmInput] = useState('');
  const [batchDeleteScope, setBatchDeleteScope] = useState(null);
  // 使用文件上传管理 hook
  const {
    isUploading,
    uploadProgress,
    uploadingFileName,
    uploadBytes,
    uploadStatus,
    setIsUploading,
    setUploadProgress,
    setUploadingFileName,
    setUploadBytes,
    setUploadStatus,
  } = useFileUpload();
  // 默认使用阿里云 OSS
  const [uploadType] = useState(UPLOAD_TYPES.ALIYUN_OSS);

  useEffect(() => {
    if (getUploadType() !== UPLOAD_TYPES.ALIYUN_OSS) {
      setUploadType(UPLOAD_TYPES.ALIYUN_OSS);
    }
  }, []);
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

  // 工具：图片压缩模块（已移除）

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

  // 调试：在开发环境打印高德 KEY 是否存在
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('VITE_AMAP_KEY in AdminPage:', getEnvValue('VITE_AMAP_KEY', '(undefined)'));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkAdminSession = async () => {
      setIsAuthChecking(true);
      setShowBackendWakeHint(false);
      const wakeHintTimer = window.setTimeout(() => {
        if (!cancelled) {
          setShowBackendWakeHint(true);
        }
      }, 2500);
      try {
        const result = await verifyToken();
        if (!cancelled) {
          setIsAdminAuthed(Boolean(result?.authenticated));
        }
      } finally {
        window.clearTimeout(wakeHintTimer);
        if (!cancelled) {
          setIsAuthChecking(false);
        }
      }
    };

    checkAdminSession();

    return () => {
      cancelled = true;
    };
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
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editSaveInProgressRef = useRef(false);
  const editSessionRef = useRef(0);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const editFeedbackRef = useRef(null);
  const [editForm, setEditForm] = useState({
    title: '',
    location: '',
    country: '',
    category: 'latest',
    tags: '',
    latitude: null,
    longitude: null,
    altitude: null,
    focal: '',
    aperture: '',
    shutter: '',
    iso: '',
    camera: '',
    lens: '',
    filmStock: '',
    shotDate: '',
    rating: 7,
    hidden: false,
  });
  const editingPhoto = useMemo(
    () => [...adminUploads, ...approvedPhotos, ...rejectedPhotos].find((photo) => photo.id === editingPhotoId) || null,
    [adminUploads, approvedPhotos, rejectedPhotos, editingPhotoId]
  );
  const deleteConfirmExpectedText = editingPhoto?.title?.trim() || editingPhotoId || '';
  const isDeleteConfirmMatched = deleteConfirmInput.trim() === deleteConfirmExpectedText;
  
  // 编辑表单的地图选择器
  const [showEditLocationPicker, setShowEditLocationPicker] = useState(false);
  const editLocationMapContainerRef = useRef(null);
  const editLocationMapInstance = useRef(null);
  const [editSelectedLocation, setEditSelectedLocation] = useState(null);
  const [editLocationSearchQuery, setEditLocationSearchQuery] = useState('');
  const [isEditSearching, setIsEditSearching] = useState(false);
  const [editSearchResults, setEditSearchResults] = useState([]);

  const ensureMapLibre = useCallback(async () => {
    if (!maplibreRef.current) {
      maplibreRef.current = await loadMapLibre();
    }
    return maplibreRef.current;
  }, []);

  // Each list keeps its own filters and page while reviewing photos.
  const [listControls, setListControls] = useState({
    pending: { page: 1, query: '', category: '' },
    approved: { page: 1, query: '', category: '' },
    rejected: { page: 1, query: '', category: '' },
  });
  const listTab = ['pending', 'approved', 'rejected'].includes(activeTab) ? activeTab : 'approved';
  const { page: currentPage, query: searchQuery, category: filterCategory } = listControls[listTab];
  const setCurrentPage = useCallback((value) => {
    setListControls((prev) => ({
      ...prev,
      [listTab]: { ...prev[listTab], page: typeof value === 'function' ? value(prev[listTab].page) : value },
    }));
  }, [listTab]);
  const setSearchQuery = (query) => setListControls((prev) => ({
    ...prev, [listTab]: { ...prev[listTab], query, page: 1 },
  }));
  const setFilterCategory = (category) => setListControls((prev) => ({
    ...prev, [listTab]: { ...prev[listTab], category, page: 1 },
  }));
  const itemsPerPage = 20; // 每页显示20条

  // 筛选和搜索后的照片列表
  const filteredPhotos = useMemo(() => {
    let filtered = [...({ pending: adminUploads, approved: approvedPhotos, rejected: rejectedPhotos }[listTab])];

    // 搜索筛选
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
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
  }, [adminUploads, approvedPhotos, rejectedPhotos, listTab, searchQuery, filterCategory]);

  // 分页计算
  const totalPages = Math.ceil(filteredPhotos.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPhotos = filteredPhotos.slice(startIndex, endIndex);
  const activeVisiblePhotoIds = useMemo(
    () => ['pending', 'approved', 'rejected'].includes(activeTab) ? paginatedPhotos.map((item) => item.id) : [],
    [paginatedPhotos, activeTab]
  );
  const selectedActivePhotoIds = useMemo(
    () => activeVisiblePhotoIds.filter((id) => selectedPhotoIds.has(id)),
    [activeVisiblePhotoIds, selectedPhotoIds]
  );
  const selectedActiveCount = selectedActivePhotoIds.length;
  const isAllActiveVisibleSelected = activeVisiblePhotoIds.length > 0 && selectedActiveCount === activeVisiblePhotoIds.length;
  const isBatchDeleteConfirmMatched = batchDeleteConfirmInput.trim().toUpperCase() === BATCH_DELETE_CONFIRM_TEXT;

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, Math.max(1, totalPages)));
  }, [totalPages, setCurrentPage]);

  useEffect(() => {
    if (editingPhotoId && submitMessage.type === 'error' && editFeedbackRef.current) {
      editFeedbackRef.current.focus();
      editFeedbackRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [editingPhotoId, submitMessage]);

  useEffect(() => {
    setShowFilterCategoryDropdown(false);
    setSelectedPhotoIds(new Set());
    setBatchDeleteConfirmOpen(false);
    setBatchDeleteConfirmInput('');
    setBatchDeleteScope(null);
  }, [activeTab, currentPage, searchQuery, filterCategory]);

  // （登录功能已移除）

  // 初始化地图选择器
  useEffect(() => {
    if (!showLocationPicker || !locationMapContainerRef.current || locationMapInstance.current) return;
    let cancelled = false;

    const initLocationMap = async () => {
      const maplibregl = await ensureMapLibre();
      if (cancelled || !locationMapContainerRef.current || locationMapInstance.current) return;
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

      locationMapInstance.current = new maplibregl.Map({
        container: locationMapContainerRef.current,
        style: getDefaultMaplibreStyle(),
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
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
        );
      }

      // 等待地图加载完成
      locationMapInstance.current.once('load', () => {
        if (cancelled) return;
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
          .setHTML(`纬度: ${escapeHtml(lat.toFixed(6))}<br>经度: ${escapeHtml(lon.toFixed(6))}`);

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
          .setHTML(`纬度: ${escapeHtml(lat.toFixed(6))}<br>经度: ${escapeHtml(lng.toFixed(6))}`);

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
    };
    initLocationMap();

    return () => {
      cancelled = true;
      if (locationMapInstance.current) {
        locationMapInstance.current.remove();
        locationMapInstance.current = null;
      }
    };
  }, [showLocationPicker, selectedLocation, uploadForm.latitude, uploadForm.longitude, ensureMapLibre]);

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

  // 地理位置搜索函数（优先使用高德地图搜索 API，需要配置 VITE_AMAP_WEB_SERVICE_KEY）
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
      const amapKey = getEnvValue('VITE_AMAP_WEB_SERVICE_KEY', getEnvValue('VITE_AMAP_KEY', ''));
      
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
        } catch {
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
        } catch {
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
  }, []);

  // 选择搜索结果并在地图上定位
  const selectSearchResult = async (result, isEdit = false) => {
    const mapInstance = isEdit ? editLocationMapInstance.current : locationMapInstance.current;
    const setLocation = isEdit ? setEditSelectedLocation : setSelectedLocation;

    if (mapInstance) {
      const maplibregl = await ensureMapLibre();
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
        .setHTML(
          `${escapeHtml(result.name)}<br>纬度: ${escapeHtml(result.lat.toFixed(6))}<br>经度: ${escapeHtml(result.lon.toFixed(6))}`
        );

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
  }, [locationSearchQuery, searchLocation]);

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
  }, [editLocationSearchQuery, searchLocation]);

  // 初始化编辑表单的地图选择器
  useEffect(() => {
    if (!showEditLocationPicker || !editLocationMapContainerRef.current || editLocationMapInstance.current) return;
    let cancelled = false;

    const initEditLocationMap = async () => {
      const maplibregl = await ensureMapLibre();
      if (cancelled || !editLocationMapContainerRef.current || editLocationMapInstance.current) return;
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

      editLocationMapInstance.current = new maplibregl.Map({
        container: editLocationMapContainerRef.current,
        style: getDefaultMaplibreStyle(),
        center: [centerLon, centerLat],
        zoom: zoom,
        attributionControl: true,
      });

      editLocationMapInstance.current._marker = null;

      // 等待地图加载完成
      editLocationMapInstance.current.once('load', () => {
        if (cancelled) return;
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
          .setHTML(`纬度: ${escapeHtml(lat.toFixed(6))}<br>经度: ${escapeHtml(lon.toFixed(6))}`);

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
          .setHTML(`纬度: ${escapeHtml(lat.toFixed(6))}<br>经度: ${escapeHtml(lng.toFixed(6))}`);

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
    };
    initEditLocationMap();

    return () => {
      cancelled = true;
      if (editLocationMapInstance.current) {
        editLocationMapInstance.current.remove();
        editLocationMapInstance.current = null;
      }
    };
  }, [showEditLocationPicker, editSelectedLocation, editForm.latitude, editForm.longitude, ensureMapLibre]);

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
    if (!isAdminAuthed) {
      setIsSupabaseLoading(false);
      return;
    }
    setIsSupabaseLoading(true);
    setSupabaseError('');
    try {
      const data = await fetchAdminPhotos();

      const rows = data || [];
      const pendingMapped = rows
        .filter((row) => row.status === 'pending')
        .map(mapSupabaseRowToPhoto);
      const approvedMapped = rows
        .filter((row) => row.status === 'approved')
        .map(mapSupabaseRowToPhoto);
      const rejectedMapped = rows
        .filter((row) => row.status === 'rejected')
        .map(mapSupabaseRowToPhoto);

      setAdminUploads(pendingMapped);
      setApprovedPhotos(approvedMapped);
      setRejectedPhotos(rejectedMapped);
      clearLocalPhotoCaches();
    } catch (error) {
      handleError(error, {
        context: 'refreshSupabaseData',
        type: ErrorType.NETWORK,
      });
      setSupabaseError(error.message || '无法从 Supabase 加载数据');
    } finally {
      setIsSupabaseLoading(false);
    }
  }, [supabase, isAdminAuthed, setAdminUploads, setApprovedPhotos, setRejectedPhotos]);

  // 更新 ref，使 hook 可以调用 refreshSupabaseData
  useEffect(() => {
    refreshSupabaseDataRef.current = refreshSupabaseData;
  }, [refreshSupabaseData]);

  // 当 adminUploads 变化时保存到 localStorage
  useEffect(() => {
    if (supabase) return;
    saveToStorage(adminUploads);
  }, [adminUploads, supabase]);

  useEffect(() => {
    if (!supabase) return;
    clearLocalPhotoCaches();
  }, [supabase]);

  // 更新已审核通过和已拒绝的作品列表
  useEffect(() => {
    if (supabase) return;
    setApprovedPhotos(loadApprovedPhotos());
    setRejectedPhotos(loadRejectedPhotos());
  }, [supabase, setApprovedPhotos, setRejectedPhotos]);

  useEffect(() => {
    if (!supabase || !isAdminAuthed) return;
    refreshSupabaseData();
  }, [supabase, isAdminAuthed, refreshSupabaseData]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setUploadForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'category' && value !== 'film') {
        next.filmStock = '';
      }
      return next;
    });
    // 清除之前的错误提示
    if (submitMessage.type === 'error') {
      setSubmitMessage({ type: '', text: '' });
    }
  };

  const clearUploadFile = () => {
    fileSelectionVersionRef.current += 1;
    fileReadInProgressRef.current = false;
    setSelectedLocation(null);
    setUploadForm((prev) => ({ ...prev, ...EMPTY_PHOTO_METADATA, file: null, fileMeta: null, preview: '' }));
    const fileInput = document.getElementById('file-upload');
    if (fileInput) fileInput.value = '';
  };

  const handleSelectedFile = async (file) => {
    if (isUploading) return;
    clearUploadFile();
    if (!file) {
      return;
    }
    const selectionVersion = fileSelectionVersionRef.current;
    const isCurrentSelection = () => selectionVersion === fileSelectionVersionRef.current;

    const validationError = getUploadFileValidationError(file);
    if (validationError) {
      setSubmitMessage({ type: 'error', text: validationError });
      return;
    }

    fileReadInProgressRef.current = true;
    setSubmitMessage({ type: 'info', text: '正在检查照片...' });
    // OSS keeps the byte-for-byte original; its backend creates the 2000px lightbox preview.
    const shouldPreserveOriginal = uploadType === UPLOAD_TYPES.ALIYUN_OSS;
    const { file: uploadFile, optimized } = shouldPreserveOriginal
      ? { file, optimized: false }
      : await maybeOptimizeUploadFile(file);
    if (!isCurrentSelection()) return;
    const fileMeta = {
      name: file.name,
      originalSize: file.size,
      uploadSize: uploadFile.size,
      optimized,
      type: (file.type || getFileExtension(file.name) || 'image').replace('image/', '').toUpperCase(),
    };

    const reader = new FileReader();
    reader.onload = async () => {
      if (!isCurrentSelection()) return;
      const preview = reader.result?.toString() || '';
      setUploadForm((prev) => ({ ...prev, file: uploadFile, fileMeta, preview }));
      
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
        if (!isCurrentSelection()) return;
        
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
          latitude = exifWithGPS.latitude ?? exifWithGPS.Latitude ?? exifWithGPS.GPSLatitude ?? exifWithGPS.gpsLatitude;
          longitude = exifWithGPS.longitude ?? exifWithGPS.Longitude ?? exifWithGPS.GPSLongitude ?? exifWithGPS.gpsLongitude;
          altitude = exifWithGPS.altitude ?? exifWithGPS.Altitude ?? exifWithGPS.GPSAltitude ?? exifWithGPS.gpsAltitude;
        }
        
        // 如果上面没找到，尝试从 translateKeys=true 的结果中获取
        if (latitude == null || longitude == null) {
          latitude = latitude ?? exif?.latitude ?? exif?.Latitude ?? exif?.GPSLatitude ?? exif?.gpsLatitude;
          longitude = longitude ?? exif?.longitude ?? exif?.Longitude ?? exif?.GPSLongitude ?? exif?.gpsLongitude;
          altitude = altitude ?? exif?.altitude ?? exif?.Altitude ?? exif?.GPSAltitude ?? exif?.gpsAltitude;
        }
        
        // 如果还是没找到，尝试从 exifWithGPS 的其他可能字段获取
        if (latitude == null || longitude == null) {
          // exifr 可能返回的字段名
          const gpsData = exifWithGPS?.gps || exifWithGPS?.GPS || {};
          latitude = latitude ?? gpsData.latitude ?? gpsData.Latitude ?? gpsData.GPSLatitude;
          longitude = longitude ?? gpsData.longitude ?? gpsData.Longitude ?? gpsData.GPSLongitude;
          altitude = altitude ?? gpsData.altitude ?? gpsData.Altitude ?? gpsData.GPSAltitude;
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
            const amapKey = getEnvValue('VITE_AMAP_WEB_SERVICE_KEY', getEnvValue('VITE_AMAP_KEY', ''));
            if (amapKey) {
              const reverseGeocodeUrl = getAmapApiUrl(`/v3/geocode/regeo?key=${amapKey}&location=${updates.longitude},${updates.latitude}&radius=1000&extensions=all`);
              
              const response = await fetch(reverseGeocodeUrl);
              if (response.ok) {
                const data = await response.json();
                if (data.status === '1' && data.regeocode) {
                  const addressComponent = data.regeocode.addressComponent;
                  const formattedAddress = data.regeocode.formatted_address;
                  
                  // 提取省份信息（优先使用，最准确）
                  // 高德地图API返回的addressComponent.province字段是最准确的省份信息
                  if (addressComponent.province) {
                    // 高德地图返回的省份可能包含"省"、"市"、"自治区"、"特别行政区"等后缀，需要清理
                    let provinceName = addressComponent.province
                      .replace(/省|市|自治区|特别行政区|维吾尔自治区|回族自治区|壮族自治区|藏族自治区/g, '')
                      .trim();
                    
                    // 特殊处理：直辖市和自治区
                    // 北京、上海、天津、重庆已经是城市名，不需要处理
                    // 但需要确保省份名正确
                    if (provinceName === '北京' || provinceName === '上海' || provinceName === '天津' || provinceName === '重庆') {
                      // 直辖市保持不变
                    } else if (addressComponent.province.includes('自治区')) {
                      // 对于自治区，保留完整名称（如"内蒙古"、"新疆"、"西藏"、"宁夏"、"广西"）
                      if (addressComponent.province.includes('内蒙古')) provinceName = '内蒙古';
                      else if (addressComponent.province.includes('新疆')) provinceName = '新疆';
                      else if (addressComponent.province.includes('西藏')) provinceName = '西藏';
                      else if (addressComponent.province.includes('宁夏')) provinceName = '宁夏';
                      else if (addressComponent.province.includes('广西')) provinceName = '广西';
                    }
                    
                    // 将省份信息保存到country字段（这是最重要的，确保后续分类正确）
                    updates.country = provinceName;
                    hasUpdates = true;
                    
                    console.log('提取省份信息:', { 
                      original: addressComponent.province, 
                      cleaned: provinceName 
                    });
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
        
        if (!isCurrentSelection()) return;
        // Update only the current file; missing fields were cleared at selection time.
        setUploadForm((prev) => ({ ...prev, ...updates }));
        if (hasUpdates) {
          const messages = [];
          if (successMessages.length > 0) {
            messages.push(...successMessages);
          }
          if (updates.focal || updates.aperture || updates.shutter || updates.iso || updates.camera || updates.lens) {
            messages.push('相机参数');
          }
          if (updates.shotDate) messages.push('拍摄日期');
          setSubmitMessage({ 
            type: 'success', 
            text: `已从照片EXIF数据中读取：${messages.join('、')}` 
          });
        } else {
          setSubmitMessage({ type: 'info', text: '照片中未找到EXIF数据，请手动填写参数' });
        }
      } catch (error) {
        if (!isCurrentSelection()) return;
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
      
      if (isCurrentSelection()) fileReadInProgressRef.current = false;
    };
    reader.onerror = () => {
      if (!isCurrentSelection()) return;
      fileReadInProgressRef.current = false;
      setUploadForm((prev) => ({ ...prev, file: null, fileMeta: null, preview: '' }));
      setSubmitMessage({ type: 'error', text: '无法读取图片，请换一张照片重试。' });
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (event) => handleSelectedFile(event.target.files?.[0]);

  const handleFileDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(false);
    if (isUploading) return;
    const files = event.dataTransfer.files;
    if (files.length !== 1) {
      setSubmitMessage({ type: 'error', text: '请一次拖入一张照片。' });
      return;
    }
    void handleSelectedFile(files[0]);
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (fileReadInProgressRef.current) {
      setSubmitMessage({ type: 'info', text: '正在读取照片信息，请稍后提交。' });
      return;
    }
    
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
    if (!uploadForm.file) {
      setSubmitMessage({ type: 'error', text: '请上传照片' });
      return;
    }

    setIsUploading(true);
    setSubmitMessage({ type: '', text: '' });
    setUploadProgress(0);
    setUploadingFileName(uploadForm.file?.name || null);
    setUploadBytes({ uploaded: 0, total: uploadForm.file?.size || 0 });
    setUploadStatus('准备上传...');

    try {
      let imageURL = '';
      let thumbnailURL = '';
      let uploadAttempt;
      
      {
        // 使用通用上传函数
        imageURL = uploadForm.preview; // 默认使用预览（base64）
        thumbnailURL = uploadForm.preview;
        
        try {
          uploadAttempt = await photoSubmissionRef.current.getUpload(
            uploadForm.file, 
            uploadType,
            (progress, uploaded, total, status) => {
              setUploadProgress(status?.stage === 'complete' ? 98 : progress);
              if (status?.label) {
                setUploadStatus(
                  status.stage === 'complete' ? '文件上传完成，正在保存作品信息...' : status.label
                );
              }
              if (uploaded !== undefined && total !== undefined) {
                setUploadBytes({ uploaded, total });
              }
            },
            Boolean(supabase) && uploadType === UPLOAD_TYPES.ALIYUN_OSS
          );
          const { url, thumbnailUrl: returnedThumb } = uploadAttempt.result;
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
          throw appError;
        }
      }

    const newUpload = {
      id: uploadAttempt.id,
        title: uploadForm.title.trim(),
        location: uploadForm.location.trim(),
        country: uploadForm.country.trim(),
      category: uploadForm.category,
        tags: mergeTagsWithFilmStock(uploadForm.tags, uploadForm.category, uploadForm.filmStock),
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
      filmStock: uploadForm.filmStock || '',
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    setAdminUploads((prev) => [newUpload, ...prev.filter((item) => item.id !== newUpload.id)]);
    setUploadProgress(99);
    setUploadStatus(supabase ? '正在同步作品信息...' : '正在完成提交...');

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
        
        await photoSubmissionRef.current.commit(uploadAttempt, payload);
        await refreshSupabaseData();
      } catch (error) {
        const appError = handleError(error, {
          context: 'handleSubmit.supabase',
          type: ErrorType.NETWORK,
        });
        const msg = getFriendlyAdminErrorMessage(appError, '无法保存作品信息，请稍后重试');
        const isUniqueViolation = (error?.code || '').includes('23505') || (error?.message || msg || '').toLowerCase().includes('unique') || (error?.message || '').includes('duplicate');
        setAdminUploads((prev) => prev.filter((item) => item.id !== newUpload.id));
        const hint = isUniqueViolation ? ' 可能是图片 URL 重复或数据库唯一约束冲突，请检查是否重复上传。' : '';
        setSubmitMessage({ type: 'error', text: `${msg}${hint}` });
        throw appError;
      }
    }
      if (!supabase) photoSubmissionRef.current.complete(uploadAttempt);
      setUploadProgress(100);
      setUploadStatus('提交完成');
      setSubmitMessage({ type: 'success', text: '提交成功！作品已添加到待审核列表' });
      setActiveTab('pending'); // 切换到待审核标签
      
      // 重置表单
    setUploadForm({
      title: '',
      location: '',
      country: '',
      category: 'latest',
      tags: '',
      preview: '',
      file: null,
      fileMeta: null,
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
      filmStock: '',
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
      setSubmitMessage({
        type: 'error',
        text: getFriendlyAdminErrorMessage(error, '上传失败，请稍后重试'),
      });
    } finally {
      setIsUploading(false);
      // 延迟隐藏进度条，让用户看到100%完成
      setTimeout(() => {
        setUploadProgress(null);
        setUploadingFileName(null);
        setUploadBytes({ uploaded: 0, total: 0 });
        setUploadStatus('');
      }, 500);
    }
  };

  const clearSelectedPhotoIds = (ids) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  // Keep the review list open so the next photo can be reviewed immediately.
  const handleApproveAndClearSelection = async (id) => {
    const didApprove = await handleApprove(id);
    if (!didApprove) return;
    clearSelectedPhotoIds([id]);
  };

  const handleRejectAndClearSelection = async (id) => {
    const didReject = await handleReject(id);
    if (!didReject) return;
    clearSelectedPhotoIds([id]);
    setSubmitMessage({ type: 'success', text: '作品已拒绝' });
  };

  const togglePhotoSelection = (id) => {
    setBatchDeleteConfirmOpen(false);
    setBatchDeleteConfirmInput('');
    setBatchDeleteScope(null);
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleActiveVisibleSelection = () => {
    setBatchDeleteConfirmOpen(false);
    setBatchDeleteConfirmInput('');
    setBatchDeleteScope(null);
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (isAllActiveVisibleSelected) {
        activeVisiblePhotoIds.forEach((id) => next.delete(id));
      } else {
        activeVisiblePhotoIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleResubmitWithTabSwitch = async (id) => {
    const didResubmit = await handleResubmit(id);
    if (!didResubmit) return;
    clearSelectedPhotoIds([id]);
    setActiveTab('pending');
  };

  const runBatchAction = async (action) => {
    const ids = [...selectedActivePhotoIds];
    if (!ids.length || isBatchWorking) return;

    setIsBatchWorking(true);
    setBatchDeleteConfirmOpen(false);
    setBatchDeleteConfirmInput('');
    setBatchDeleteScope(null);

    try {
      const completedIds = [];
      let pendingCleanupCount = 0;

      for (const id of ids) {
        let didComplete = false;

        if (action === 'approve') {
          didComplete = await handleApprove(id);
        } else if (action === 'reject') {
          didComplete = await handleReject(id);
        } else if (action === 'resubmit') {
          didComplete = await handleResubmit(id);
        } else if (action === 'delete') {
          didComplete = await handleDelete(id, activeTab);
        }

        if (didComplete) {
          completedIds.push(id);
          if (didComplete.cleanupPending) pendingCleanupCount += 1;
        }
      }

      clearSelectedPhotoIds(completedIds);
      const failedCount = ids.length - completedIds.length;
      const completedCount = completedIds.length;

      if (failedCount > 0) {
        setSubmitMessage({
          type: 'error',
          text: completedCount > 0
            ? `已完成 ${completedCount} 个，${failedCount} 个失败，请刷新后重试`
            : '批量操作未完成，请检查错误提示后重试',
        });
        return;
      }

      if (action === 'approve') {
        setSubmitMessage({ type: 'success', text: `已通过 ${completedCount} 个作品` });
      } else if (action === 'reject') {
        setSubmitMessage({ type: 'success', text: `已拒绝 ${completedCount} 个作品` });
      } else if (action === 'resubmit') {
        setActiveTab('pending');
        setSubmitMessage({ type: 'success', text: `已重新提交 ${completedCount} 个作品` });
      } else {
        setSubmitMessage({
          type: pendingCleanupCount ? 'info' : 'success',
          text: pendingCleanupCount
            ? `已删除 ${completedCount} 个作品，${pendingCleanupCount} 个作品的云端图片清理暂未完成。${supabase ? '后台会自动重试。' : '请检查云端存储。'}`
            : `已删除 ${completedCount} 个作品，图片清理完成。`,
        });
      }

      if (!pendingCleanupCount) setTimeout(() => {
        setSubmitMessage({ type: '', text: '' });
      }, 3000);
    } catch (error) {
      handleError(error, {
        context: `runBatchAction.${action}`,
        type: ErrorType.NETWORK,
      });
      setSubmitMessage({ type: 'error', text: `批量操作失败：${formatErrorMessage(error)}` });
    } finally {
      setIsBatchWorking(false);
    }
  };

  const openBatchDeleteConfirm = () => {
    if (!selectedActiveCount || isBatchWorking) return;
    setBatchDeleteConfirmOpen(true);
    setBatchDeleteConfirmInput('');
    setBatchDeleteScope(activeTab);
  };

  const handleBatchDeleteConfirmed = async () => {
    if (!isBatchDeleteConfirmMatched) return;
    await runBatchAction('delete');
  };

  const renderBatchToolbar = (items, source) => {
    if (!items.length) return null;

    const isDeleteConfirmVisible = batchDeleteConfirmOpen && batchDeleteScope === source;

    return (
      <div className="batch-toolbar">
        <div className="batch-toolbar-main">
          <button
            type="button"
            className="btn-secondary batch-select-btn"
            onClick={toggleActiveVisibleSelection}
            disabled={isBatchWorking}
          >
            {isAllActiveVisibleSelected ? '取消全选' : '全选当前列表'}
          </button>
          <span className="batch-selected-count">
            已选 {selectedActiveCount} / {items.length}
          </span>
        </div>

        <div className="batch-toolbar-actions">
          {source === 'pending' && (
            <>
              <button
                type="button"
                className="btn-approve"
                onClick={() => runBatchAction('approve')}
                disabled={!selectedActiveCount || isBatchWorking}
              >
                批量通过
              </button>
              <button
                type="button"
                className="btn-reject"
                onClick={() => runBatchAction('reject')}
                disabled={!selectedActiveCount || isBatchWorking}
              >
                批量拒绝
              </button>
            </>
          )}

          {source === 'rejected' && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => runBatchAction('resubmit')}
              disabled={!selectedActiveCount || isBatchWorking}
            >
              批量重新提交
            </button>
          )}

          <button
            type="button"
            className="btn-reject"
            onClick={openBatchDeleteConfirm}
            disabled={!selectedActiveCount || isBatchWorking}
          >
            批量删除
          </button>
        </div>

        {isDeleteConfirmVisible && (
          <div className="batch-delete-confirm">
            <div>
              <strong>确认批量删除</strong>
              <span>将删除当前选中的 {selectedActiveCount} 个作品记录，并清理对应云端图片。请输入 DELETE 继续。</span>
            </div>
            <input
              type="text"
              value={batchDeleteConfirmInput}
              onChange={(event) => setBatchDeleteConfirmInput(event.target.value)}
              placeholder={BATCH_DELETE_CONFIRM_TEXT}
              disabled={isBatchWorking}
            />
            <div className="batch-delete-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setBatchDeleteConfirmOpen(false);
                  setBatchDeleteConfirmInput('');
                  setBatchDeleteScope(null);
                }}
                disabled={isBatchWorking}
              >
                取消
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleBatchDeleteConfirmed}
                disabled={!isBatchDeleteConfirmMatched || isBatchWorking}
              >
                {isBatchWorking ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 打开编辑表单
  const handleEdit = (photo) => {
    if (editSaveInProgressRef.current) return;
    editSessionRef.current += 1;
    setSubmitMessage({ type: '', text: '' });
    setEditingPhotoId(photo.id);
    setIsDeleteConfirmOpen(false);
    setDeleteConfirmInput('');
    setIsDeletingPhoto(false);
    setEditForm({
      title: photo.title || '',
      location: photo.location || '',
      country: photo.country || '',
      category: normalizePhotoCategory(photo.category),
      tags: photo.tags || '',
      latitude: photo.latitude ?? null,
      longitude: photo.longitude ?? null,
      altitude: photo.altitude ?? null,
      focal: photo.focal || '',
      aperture: photo.aperture || '',
      shutter: photo.shutter || '',
      iso: photo.iso || '',
      camera: photo.camera || '',
      lens: photo.lens || '',
      filmStock: photo.filmStock || extractFilmStockFromTags(photo.tags || ''),
      shotDate: photo.shotDate || '',
      rating: typeof photo.rating === 'number' ? photo.rating : (photo.rating ? Number(photo.rating) : 7),
      hidden: !!photo.hidden,
    });
    setEditSelectedLocation(null);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingPhotoId || editSaveInProgressRef.current || isDeletingPhoto) return;

    if (!editForm.title?.trim()) {
      setSubmitMessage({ type: 'error', text: '请填写标题' });
      return;
    }
    if (!editForm.location?.trim()) {
      setSubmitMessage({ type: 'error', text: '请填写拍摄地点' });
      return;
    }
    if (!editForm.country?.trim()) {
      setSubmitMessage({ type: 'error', text: '请填写国家/地区' });
      return;
    }

    const session = editSessionRef.current;
    const isCurrentEdit = () => editSessionRef.current === session;
    editSaveInProgressRef.current = true;
    setIsSavingEdit(true);
    try {
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
            film_stock: editForm.category === 'film' ? (editForm.filmStock || '').trim() || null : null,
            tags: mergeTagsWithFilmStock(
              editForm.tags || '',
              editForm.category,
              editForm.filmStock || ''
            ),
            rating: typeof editForm.rating === 'number' ? editForm.rating : Number(editForm.rating) || 7,
            shot_date: editForm.shotDate || null,
            hidden: !!editForm.hidden,
          };

          await updateAdminPhoto(editingPhotoId, updatePayload);
          await refreshSupabaseData();
          if (!isCurrentEdit()) return;
          setEditingPhotoId(null);
          setSubmitMessage({ type: 'success', text: '编辑成功！' });
          setTimeout(() => {
            if (isCurrentEdit()) setSubmitMessage((message) => (
              message.type === 'success' && message.text === '编辑成功！' ? { type: '', text: '' } : message
            ));
          }, 2000);
          return;
        } catch (error) {
          handleError(error, {
            context: 'handleSaveEdit',
            type: ErrorType.NETWORK,
          });
          if (isCurrentEdit()) setSubmitMessage({ type: 'error', text: `保存失败：${error.message}` });
          return;
        }
      }

      try {
        const buildEditedLocalPhoto = (photo) => ({
          ...photo,
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
          filmStock: editForm.category === 'film' ? (editForm.filmStock || '').trim() : '',
          tags: mergeTagsWithFilmStock(
            editForm.tags || '',
            editForm.category,
            editForm.filmStock || ''
          ),
          rating: typeof editForm.rating === 'number' ? editForm.rating : Number(editForm.rating) || 7,
          shotDate: editForm.shotDate || null,
          hidden: !!editForm.hidden,
        });

        const pending = Storage.get(STORAGE_KEY, []);
        const pendingIndex = pending.findIndex((p) => p.id === editingPhotoId);

        if (pendingIndex !== -1) {
          pending[pendingIndex] = buildEditedLocalPhoto(pending[pendingIndex]);
          Storage.set(STORAGE_KEY, pending);
          setAdminUploads([...pending]);
          setEditingPhotoId(null);
          setSubmitMessage({ type: 'success', text: '编辑成功！' });
          setTimeout(() => {
            if (isCurrentEdit()) setSubmitMessage((message) => (
              message.type === 'success' && message.text === '编辑成功！' ? { type: '', text: '' } : message
            ));
          }, 2000);
          return;
        }

        // 检查是否在已审核列表中
        const approved = loadApprovedPhotos();
        const approvedIndex = approved.findIndex((p) => p.id === editingPhotoId);

        if (approvedIndex !== -1) {
          approved[approvedIndex] = buildEditedLocalPhoto(approved[approvedIndex]);

          Storage.set(APPROVED_STORAGE_KEY, approved);
          setApprovedPhotos([...approved]);
          setEditingPhotoId(null);
          setSubmitMessage({ type: 'success', text: '编辑成功！' });
          setTimeout(() => {
            if (isCurrentEdit()) setSubmitMessage((message) => (
              message.type === 'success' && message.text === '编辑成功！' ? { type: '', text: '' } : message
            ));
          }, 2000);
          return;
        }

        // 检查是否在已拒绝列表中
        const rejected = loadRejectedPhotos();
        const rejectedIndex = rejected.findIndex((p) => p.id === editingPhotoId);

        if (rejectedIndex !== -1) {
          rejected[rejectedIndex] = buildEditedLocalPhoto(rejected[rejectedIndex]);

          Storage.set(REJECTED_STORAGE_KEY, rejected);
          setRejectedPhotos([...rejected]);
          setEditingPhotoId(null);
          setSubmitMessage({ type: 'success', text: '编辑成功！' });
          setTimeout(() => {
            if (isCurrentEdit()) setSubmitMessage((message) => (
              message.type === 'success' && message.text === '编辑成功！' ? { type: '', text: '' } : message
            ));
          }, 2000);
          return;
        }
      } catch (error) {
        handleError(error, {
          context: 'handleSaveEdit',
          type: ErrorType.STORAGE,
          silent: true,
        });
        if (isCurrentEdit()) setSubmitMessage({ type: 'error', text: '保存失败，请重试' });
      }
    } finally {
      editSaveInProgressRef.current = false;
      setIsSavingEdit(false);
    }
  };

  // 取消编辑
  const handleCancelEdit = () => {
    if (editSaveInProgressRef.current || isDeletingPhoto) return;
    editSessionRef.current += 1;
    setSubmitMessage({ type: '', text: '' });
    setEditingPhotoId(null);
    setIsDeleteConfirmOpen(false);
    setDeleteConfirmInput('');
    setIsDeletingPhoto(false);
    setEditForm({
      title: '',
      location: '',
      country: '',
      category: 'latest',
      tags: '',
      latitude: null,
      longitude: null,
      altitude: null,
      focal: '',
      aperture: '',
      shutter: '',
      iso: '',
      camera: '',
      lens: '',
      filmStock: '',
      hidden: false,
    });
    setShowEditLocationPicker(false);
    setEditSelectedLocation(null);
  };

  // Single and batch deletion share the same server-coordinated flow.
  const handleDeleteFromEdit = async () => {
    if (!editingPhotoId || !isDeleteConfirmMatched || isDeletingPhoto || editSaveInProgressRef.current) return;
    setIsDeletingPhoto(true);
    try {
      const source = editingPhoto?.status || activeTab;
      const result = await handleDelete(editingPhotoId, source);
      if (!result) return;
      setEditingPhotoId(null);
      setIsDeleteConfirmOpen(false);
      setDeleteConfirmInput('');
    } finally {
      setIsDeletingPhoto(false);
    }
  };

  const renderListFilters = () => (
    <div style={{
      display: 'flex',
      gap: '12px',
      marginBottom: '16px',
      flexWrap: 'wrap',
      alignItems: 'center'
    }}>
      <div style={{ flex: 1, minWidth: '200px', maxWidth: '400px' }}>
        <input
          type="search"
          aria-label="搜索作品"
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
        <div
          style={{ position: 'relative' }}
          tabIndex={-1}
          onBlur={() => setShowFilterCategoryDropdown(false)}
        >
          <button
            type="button"
            onClick={() => setShowFilterCategoryDropdown((v) => !v)}
            className="category-select-display"
            style={{
              width: '100%',
              border: '1px solid var(--border)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text)',
              minHeight: '39px',
              height: '39px',
              borderRadius: '8px',
              padding: '10px 40px 10px 16px',
              boxShadow: 'none',
              fontSize: '0.9rem',
            }}
          >
            <span className="category-select-text">
              {filterCategory
                ? tabs.find((tab) => tab.id === filterCategory)?.label || '全部分类'
                : '全部分类'}
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="category-select-arrow"
              style={{
                transform: showFilterCategoryDropdown
                  ? 'translateY(-50%) rotate(180deg)'
                  : undefined,
                color: 'currentColor',
                opacity: 0.7,
              }}
            >
              <path
                d="M3 4.5L6 7.5L9 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {showFilterCategoryDropdown && (
            <div className="admin-dropdown-panel" style={{ maxHeight: 220, overflowY: 'auto' }}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setFilterCategory('');
                  setShowFilterCategoryDropdown(false);
                }}
                className={`admin-dropdown-item ${!filterCategory ? 'is-active' : ''}`}
              >
                全部分类
              </button>
              {tabs.map((tab) => {
                const active = tab.id === filterCategory;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setFilterCategory(tab.id);
                      setShowFilterCategoryDropdown(false);
                    }}
                    className={`admin-dropdown-item ${active ? 'is-active' : ''}`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
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
  );

  const renderListPagination = () => (
    totalPages > 1 && (
      <nav className="admin-pagination" aria-label="作品分页">
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
          className="admin-pagination-pages"
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
                aria-current={currentPage === pageNum ? 'page' : undefined}
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
      </nav>
    )
  );


  // 总作品数 = 已审核通过的作品 + 待审核的作品（不包括内置示例）
  const totalPhotos = approvedCount + pendingReviewCount;

  const handleAdminLogin = useCallback(async () => {
    if (!adminUsernameInput.trim() || !adminPasswordInput) return;
    if (isAdminLoginSubmitting) return;

    setIsAdminLoginSubmitting(true);
    setShowBackendWakeHint(false);
    setAdminAuthError('');
    const wakeHintTimer = window.setTimeout(() => {
      setShowBackendWakeHint(true);
    }, 2500);

    try {
      await loginWithApi(adminUsernameInput.trim(), adminPasswordInput);
      setIsAdminAuthed(true);
      setAdminAuthError('');
      setSubmitMessage({ type: '', text: '' });
      setSupabaseError('');
    } catch (error) {
      setAdminAuthError(getFriendlyAdminErrorMessage(error, '用户名或密码不正确'));
    }
    window.clearTimeout(wakeHintTimer);
    setIsAdminLoginSubmitting(false);
  }, [adminUsernameInput, adminPasswordInput, isAdminLoginSubmitting]);

  if (isAuthChecking) {
    return (
      <div className="app-root">
        <main className="admin-page">
          <div className="loading-container">
            <div>正在验证管理员身份...</div>
            {showBackendWakeHint && (
              <div className="admin-loading-hint">{BACKEND_WAKE_HINT}</div>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (!isAdminAuthed) {
    return (
      <div className="app-root">
        <main className="admin-page">
          <div
            className="admin-login-stage"
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
            <div className="login-theme-switcher"><ThemeSwitcher /></div>
            <div
              className="admin-login-card"
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
              <a href={`${import.meta.env.BASE_URL}#/`} className="admin-login-back">
                <span aria-hidden="true">←</span> 返回图库
              </a>
              <div className="admin-login-brand" aria-hidden="true">
                <img src="/pic4pick-icon.svg" alt="" />
                <span>LIGHT OF ANTHONY · STUDIO</span>
              </div>
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
                请输入管理员用户名和密码进入后台。
              </p>
              <div style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  aria-label="管理员用户名"
                  autoComplete="username"
                  value={adminUsernameInput}
                  disabled={isAdminLoginSubmitting}
                  onChange={(e) => {
                    setAdminUsernameInput(e.target.value);
                    setAdminAuthError('');
                  }}
                  placeholder="管理员用户名"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid rgba(148, 163, 184, 0.5)',
                    background: 'rgba(255,255,255,0.9)',
                    color: '#111827',
                    fontSize: '0.95rem',
                    outline: 'none',
                  }}
                />
              </div>
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
                    aria-label="管理员密码"
                    autoComplete="current-password"
                    value={adminPasswordInput}
                    disabled={isAdminLoginSubmitting}
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
                        handleAdminLogin();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword((v) => !v)}
                    aria-label={showAdminPassword ? '隐藏密码' : '显示密码'}
                    aria-pressed={showAdminPassword}
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
                  role="alert"
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
                onClick={handleAdminLogin}
                disabled={isAdminLoginSubmitting}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--bg)',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: isAdminLoginSubmitting ? 'wait' : 'pointer',
                  opacity: isAdminLoginSubmitting ? 0.75 : 1,
                }}
              >
                {isAdminLoginSubmitting ? '正在连接...' : '进入后台'}
              </button>
              {showBackendWakeHint && isAdminLoginSubmitting && (
                <div className="admin-login-hint">{BACKEND_WAKE_HINT}</div>
              )}
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
        statusLabel={uploadStatus}
      />
      <header className="app-header admin-header">
        <div className="brand">
          {brandLogo ? (
            <img src={brandLogo} alt={brandText.siteTitle || brandText.adminTitle} className="brand-logo-img" />
          ) : (
            <div className="logo-mark" aria-hidden="true" />
          )}
          <img
            src="/loa-cropped.png"
            alt="Light of Anthony"
            className="brand-wordmark-img"
          />
        </div>
        <div className="header-actions">
          <ThemeSwitcher />
          <nav className="primary-menu">
            <a href={`${import.meta.env.BASE_URL}#/`}>返回前台</a>
          </nav>
        </div>
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
          {/* 工具统计卡片已删除 */}
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
        {submitMessage.text && !editingPhotoId && (
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 6H8M12 6H20M4 12H14M18 12H20M4 18H6M10 18H20" />
              <circle cx="10" cy="6" r="2" />
              <circle cx="16" cy="12" r="2" />
              <circle cx="8" cy="18" r="2" />
            </svg>
            <span>配置</span>
          </button>
        </div>

        {/* 内容区域 / 配置区域 */}
        {activeTab === 'config' ? (
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
            />
        ) : (
        <div className="admin-content-wrapper">
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

                <div
                  className={`upload-dropzone-new${isDraggingFile ? ' is-dragging' : ''}`}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes('Files')) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = isUploading ? 'none' : 'copy';
                    setIsDraggingFile(!isUploading);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setIsDraggingFile(false);
                  }}
                  onDrop={handleFileDrop}
                >
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} id="file-upload" />
                    <label htmlFor="file-upload" className="dropzone-label">
                      {uploadForm.preview ? (
                        <div className="preview-container">
                          <img src={uploadForm.preview} alt="预览" />
                          <button
                            type="button"
                            className="remove-preview"
                            onClick={(e) => {
                              e.preventDefault();
                              if (!isUploading) clearUploadFile();
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
                          <p className="dropzone-hint">支持 JPG、PNG、WEBP，原图最大 100MB；自动生成 2000px 高清预览</p>
                          </div>
                        )}
                    </label>
                    {uploadForm.fileMeta && (
                      <div className="upload-file-summary">
                        <div>
                          <strong>{uploadForm.fileMeta.name}</strong>
                          <span>{uploadForm.fileMeta.type}</span>
                        </div>
                        <div>
                          <span>
                            {uploadForm.fileMeta.optimized
                              ? `${formatFileSize(uploadForm.fileMeta.originalSize)} → ${formatFileSize(uploadForm.fileMeta.uploadSize)}`
                              : formatFileSize(uploadForm.fileMeta.originalSize)}
                          </span>
                          {uploadForm.fileMeta.optimized && <span>已优化上传文件</span>}
                        </div>
                      </div>
                    )}
                </div>
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
                    <DatePicker
                      selected={parseDateValue(uploadForm.shotDate)}
                      onChange={(date) =>
                        setUploadForm((prev) => ({ ...prev, shotDate: formatDateValue(date) }))
                      }
                      locale={zhCN}
                      dateFormat="yyyy-MM-dd"
                      placeholderText="请选择拍摄日期"
                      calendarClassName="admin-date-calendar"
                      className="admin-date-input"
                      popperClassName="admin-date-popper"
                      showPopperArrow={false}
                    />
                  </div>
                  <div className="form-group">
                    <label>分类 <span className="required">*</span></label>
                    <div
                      style={{ position: 'relative' }}
                      tabIndex={-1}
                      onBlur={() => setShowCategoryDropdown(false)}
                    >
                      <button
                        type="button"
                        onClick={() => setShowCategoryDropdown((v) => !v)}
                        className="category-select-display"
                        style={{
                          width: '100%',
                          border: '1px solid rgba(17,18,24,0.12)',
                          background: '#fff',
                        }}
                      >
                        <span className="category-select-text">
                          {tabs.find((tab) => tab.id === uploadForm.category)?.label || '最新'}
                        </span>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="category-select-arrow"
                          style={{ transform: showCategoryDropdown ? 'translateY(-50%) rotate(180deg)' : undefined }}
                        >
                          <path
                            d="M3 4.5L6 7.5L9 4.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>

                      {showCategoryDropdown && (
                        <div
                          className="admin-dropdown-panel"
                          style={{
                            zIndex: 30,
                          }}
                        >
                          {tabs.map((tab) => {
                            const active = tab.id === uploadForm.category;
                            return (
                              <button
                                key={tab.id}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setUploadForm((prev) => ({
                                    ...prev,
                                    category: tab.id,
                                    filmStock: tab.id === 'film' ? prev.filmStock : '',
                                  }));
                                  setShowCategoryDropdown(false);
                                }}
                                className={`admin-dropdown-item ${active ? 'is-active' : ''}`}
                              >
                                {tab.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
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
                  {uploadForm.category === 'film' && (
                    <div className="form-group full-width">
                      <label>胶卷</label>
                      <input
                        type="text"
                        name="filmStock"
                        placeholder="例如：Kodak Portra 400"
                        value={uploadForm.filmStock}
                        onChange={handleFormChange}
                        autoComplete="off"
                      />
                    </div>
                  )}
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
                    clearUploadFile();
                    setUploadForm({
                      title: '',
                      location: '',
                      country: '',
                      category: 'latest',
                      tags: '',
                      preview: '',
                      file: null,
                      fileMeta: null,
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
                      filmStock: '',
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
                <span className="list-count">{filteredPhotos.length} / {pendingReviewCount} 条</span>
              </div>
              {renderListFilters()}
              {renderBatchToolbar(paginatedPhotos, 'pending')}
              <div className="admin-list">
                {paginatedPhotos.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="64">
                        <path d="M3 7V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M3 7L12 14L21 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M3 7V19C3 19.5304 3.21071 20.0391 3.58579 20.4142C3.96086 20.7893 4.46957 21 5 21H19C19.5304 21 20.0391 20.7893 20.4142 20.4142C20.7893 20.0391 21 19.5304 21 19V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <p className="empty-text">{adminUploads.length === 0 ? '暂无待审核作品' : '没有找到匹配的作品'}</p>
                    <p className="empty-hint">{adminUploads.length === 0 ? '提交作品后将显示在此' : '请尝试其他搜索关键词或筛选条件'}</p>
                  </div>
                ) : (
                  paginatedPhotos.map((item) => (
                    <article key={item.id} className={`admin-list-item pending compact ${selectedPhotoIds.has(item.id) ? 'is-selected' : ''}`}>
                      <label className="admin-item-select" aria-label={`选择 ${item.title || '作品'}`}>
                        <input
                          type="checkbox"
                          checked={selectedPhotoIds.has(item.id)}
                          onChange={() => togglePhotoSelection(item.id)}
                        />
                        <span>选择</span>
                      </label>
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
                          className="btn-secondary"
                          onClick={() => handleEdit(item)}
                          style={{
                            width: '100%',
                            fontSize: '0.85rem',
                            padding: '10px 16px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          ✎ 编辑
                        </button>
                        <button
                          className="btn-approve"
                          onClick={() => handleApproveAndClearSelection(item.id)}
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
                          onClick={() => handleRejectAndClearSelection(item.id)}
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
              {renderListPagination()}
            </div>
          )}

          {activeTab === 'rejected' && (
            <div className="admin-list-section">
              <div className="list-header">
                <h2>已拒绝作品</h2>
                <span className="list-count">{filteredPhotos.length} / {rejectedCount} 条</span>
              </div>
              {renderListFilters()}
              {renderBatchToolbar(paginatedPhotos, 'rejected')}

              <div className="admin-list">
                {paginatedPhotos.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="64">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                        <path d="M15 9L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M9 9L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <p className="empty-text">{rejectedPhotos.length === 0 ? '暂无已拒绝作品' : '没有找到匹配的作品'}</p>
                    <p className="empty-hint">{rejectedPhotos.length === 0 ? '被拒绝的作品将显示在此' : '请尝试其他搜索关键词或筛选条件'}</p>
                  </div>
                ) : (
                  paginatedPhotos.map((item) => (
                    <article key={item.id} className={`admin-list-item rejected compact ${selectedPhotoIds.has(item.id) ? 'is-selected' : ''}`}>
                      <label className="admin-item-select" aria-label={`选择 ${item.title || '作品'}`}>
                        <input
                          type="checkbox"
                          checked={selectedPhotoIds.has(item.id)}
                          onChange={() => togglePhotoSelection(item.id)}
                        />
                        <span>选择</span>
                      </label>
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
                            {item.focal || '—'} · {item.aperture || '—'} · {item.shutter || '—'} · ISO {item.iso || '—'}
                          </div>
                          <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                            {item.camera || '未填写相机'} · {item.lens || '未填写镜头'}
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
                            onClick={() => handleResubmitWithTabSwitch(item.id)}
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
              {renderListPagination()}
            </div>
          )}

          {activeTab === 'approved' && (
            <div className="admin-list-section">
              <div className="list-header">
                <h2>已审核作品</h2>
                <span className="list-count">{filteredPhotos.length} / {approvedCount} 条</span>
              </div>

              {renderListFilters()}

              {renderBatchToolbar(paginatedPhotos, 'approved')}

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
                    <article key={item.id} className={`admin-list-item approved grid-item ${selectedPhotoIds.has(item.id) ? 'is-selected' : ''}`}>
                      <label className="admin-item-select" aria-label={`选择 ${item.title || '作品'}`}>
                        <input
                          type="checkbox"
                          checked={selectedPhotoIds.has(item.id)}
                          onChange={() => togglePhotoSelection(item.id)}
                        />
                        <span>选择</span>
                      </label>
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
                            <span>{item.focal || '—'}</span>
                            <span>·</span>
                            <span>{item.aperture || '—'}</span>
                            <span>·</span>
                            <span>{item.shutter || '—'}</span>
                            <span>·</span>
                            <span>ISO {item.iso || '—'}</span>
                          </div>
                          <div style={{ fontSize: '0.65rem', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.camera || '未填写相机'} · {item.lens || '未填写镜头'}
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
              </div>

              {renderListPagination()}
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
                aria-busy={isSavingEdit}
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
                <fieldset disabled={isSavingEdit || isDeletingPhoto} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                <h2 style={{ 
                  marginBottom: '24px', 
                  fontSize: '1.5rem',
                  color: 'var(--text)',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '16px'
                }}>
                  编辑作品信息
                </h2>
                {submitMessage.text && (
                  <div
                    ref={editFeedbackRef}
                    className={`admin-message ${submitMessage.type}`}
                    role={submitMessage.type === 'error' ? 'alert' : 'status'}
                    tabIndex={-1}
                  >
                    {submitMessage.text}
                  </div>
                )}
                
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
                      <div
                        style={{ position: 'relative' }}
                        tabIndex={-1}
                        onBlur={() => setShowEditCategoryDropdown(false)}
                      >
                        <button
                          type="button"
                          onClick={() => setShowEditCategoryDropdown((v) => !v)}
                          className="category-select-display"
                          style={{
                            width: '100%',
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: 'var(--text)',
                          }}
                        >
                          <span className="category-select-text">
                            {tabs.find((tab) => tab.id === editForm.category)?.label || '最新'}
                          </span>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="category-select-arrow"
                            style={{ transform: showEditCategoryDropdown ? 'translateY(-50%) rotate(180deg)' : undefined }}
                          >
                            <path
                              d="M3 4.5L6 7.5L9 4.5"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>

                        {showEditCategoryDropdown && (
                          <div
                            className="admin-dropdown-panel"
                            style={{
                              zIndex: 60,
                            }}
                          >
                            {tabs.map((tab) => {
                              const active = tab.id === editForm.category;
                              return (
                                <button
                                  key={tab.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setEditForm((prev) => ({
                                      ...prev,
                                      category: tab.id,
                                      filmStock: tab.id === 'film' ? prev.filmStock : '',
                                    }));
                                    setShowEditCategoryDropdown(false);
                                  }}
                                  className={`admin-dropdown-item ${active ? 'is-active' : ''}`}
                                >
                                  {tab.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
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
                      <DatePicker
                        selected={parseDateValue(editForm.shotDate)}
                        onChange={(date) =>
                          setEditForm((prev) => ({ ...prev, shotDate: formatDateValue(date) }))
                        }
                        locale={zhCN}
                        dateFormat="yyyy-MM-dd"
                        placeholderText="请选择拍摄日期"
                        calendarClassName="admin-date-calendar"
                        className="admin-date-input"
                        popperClassName="admin-date-popper"
                        showPopperArrow={false}
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
                    <label>焦距</label>
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
                    <label>光圈</label>
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
                    <label>快门</label>
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
                    <label>ISO</label>
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
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="例如: Canon EOS 5D Mark IV"
                        value={editForm.camera}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, camera: e.target.value }))}
                        onFocus={() => setShowEditCameraDropdown(true)}
                        onBlur={() => setTimeout(() => setShowEditCameraDropdown(false), 120)}
                        autoComplete="off"
                        style={{
                          width: '100%',
                          padding: '10px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--text)'
                        }}
                      />
                      {showEditCameraDropdown && editForm.camera && (
                        <div
                          className="admin-dropdown-panel"
                          style={{
                            maxHeight: 160,
                            overflowY: 'auto',
                            zIndex: 20,
                          }}
                        >
                          {cameraOptions
                            .filter((opt) =>
                              opt.toLowerCase().includes(editForm.camera.toLowerCase())
                            )
                            .map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setEditForm((prev) => ({ ...prev, camera: opt }));
                                  setShowEditCameraDropdown(false);
                                }}
                                className={`admin-dropdown-item ${
                                  opt === editForm.camera ? 'is-active' : ''
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>镜头</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="例如: EF 70-200mm f/2.8L"
                        value={editForm.lens}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, lens: e.target.value }))}
                        onFocus={() => setShowEditLensDropdown(true)}
                        onBlur={() => setTimeout(() => setShowEditLensDropdown(false), 120)}
                        autoComplete="off"
                        style={{
                          width: '100%',
                          padding: '10px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--text)'
                        }}
                      />
                      {showEditLensDropdown && editForm.lens && (
                        <div
                          className="admin-dropdown-panel"
                          style={{
                            maxHeight: 160,
                            overflowY: 'auto',
                            zIndex: 20,
                          }}
                        >
                          {lensOptions
                            .filter((opt) =>
                              opt.toLowerCase().includes(editForm.lens.toLowerCase())
                            )
                            .map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setEditForm((prev) => ({ ...prev, lens: opt }));
                                  setShowEditLensDropdown(false);
                                }}
                                className={`admin-dropdown-item ${
                                  opt === editForm.lens ? 'is-active' : ''
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {editForm.category === 'film' && (
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>胶卷</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          placeholder="例如: Kodak Portra 400"
                          value={editForm.filmStock}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, filmStock: e.target.value }))}
                          autoComplete="off"
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
                  )}
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

                {isDeleteConfirmOpen && (
                  <div className="edit-delete-confirm" role="alertdialog" aria-live="polite">
                    <div className="edit-delete-confirm-header">
                      <strong>确认永久删除</strong>
                      <span>会同步删除作品记录，并尝试清理 OSS 原图和缩略图。</span>
                    </div>
                    <label>
                      输入作品标题确认删除
                      <input
                        type="text"
                        value={deleteConfirmInput}
                        onChange={(e) => setDeleteConfirmInput(e.target.value)}
                        placeholder={deleteConfirmExpectedText}
                        disabled={isDeletingPhoto}
                      />
                    </label>
                    <div className="edit-delete-confirm-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setIsDeleteConfirmOpen(false);
                          setDeleteConfirmInput('');
                        }}
                        disabled={isDeletingPhoto}
                      >
                        取消删除
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={handleDeleteFromEdit}
                        disabled={!isDeleteConfirmMatched || isDeletingPhoto}
                      >
                        {isDeletingPhoto ? '正在删除...' : '永久删除'}
                      </button>
                    </div>
                  </div>
                )}

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
                    className="btn-delete-trigger"
                    onClick={() => {
                      setIsDeleteConfirmOpen(true);
                      setDeleteConfirmInput('');
                    }}
                    disabled={isDeletingPhoto}
                    style={{ 
                      padding: '10px 20px',
                      background: 'rgba(231, 76, 60, 0.1)',
                      border: '1px solid rgba(231, 76, 60, 0.3)',
                      borderRadius: '8px',
                      color: '#e74c3c',
                      cursor: isDeletingPhoto ? 'wait' : 'pointer',
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
                      disabled={isSavingEdit || isDeletingPhoto}
                      style={{ padding: '10px 20px' }}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleSaveEdit}
                      disabled={isSavingEdit || isDeletingPhoto}
                      style={{ padding: '10px 20px' }}
                    >
                      {isSavingEdit ? '正在保存...' : '保存'}
                    </button>
                  </div>
              </div>
                </fieldset>
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
