import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import exifr from 'exifr';
import '../App.css';
import { uploadImage, getUploadType, setUploadType, UPLOAD_TYPES, compressImage } from '../utils/upload';
import { getSupabaseClient } from '../utils/supabaseClient';
import {
  testWebDAVConnection,
  getWebDAVConfig,
  saveWebDAVConfig
} from '../utils/webdav';
import { getEnvValue, updateEnvOverrides, resetEnvOverrides, ENV_OVERRIDE_KEYS } from '../utils/envConfig';
import {
  BRAND_LOGO_EVENT,
  BRAND_LOGO_STORAGE_KEY,
  BRAND_LOGO_SUPABASE_ID,
  BRAND_LOGO_SUPABASE_TABLE,
  getStoredBrandLogo,
  saveBrandLogo,
  removeBrandLogo,
  getStoredBrandText,
  saveBrandText,
  resetBrandText,
} from '../utils/branding';

const tabs = [
  { id: 'featured', label: '精选' },
  { id: 'latest', label: '最新' },
  { id: 'random', label: '随览' },
  { id: 'nearby', label: '附近' },
  { id: 'far', label: '远方' },
];

const STORAGE_KEY = 'camarts_admin_uploads';
const APPROVED_STORAGE_KEY = 'camarts_approved_photos';
const BRAND_LOGO_MAX_SIZE = 1024 * 1024; // 1MB

// 获取上传方式的中文名称
const getUploadTypeName = (type) => {
  const names = {
    [UPLOAD_TYPES.BASE64]: '本地存储',
    [UPLOAD_TYPES.WEBDAV]: 'WebDAV',
    [UPLOAD_TYPES.API]: '后端 API',
    [UPLOAD_TYPES.CLOUDINARY]: 'Cloudinary',
    [UPLOAD_TYPES.SUPABASE]: 'Supabase',
    [UPLOAD_TYPES.ALIYUN_OSS]: '阿里云 OSS',
  };
  return names[type] || '本地存储';
};

export function AdminPage() {
  // === WebDAV 配置状态 ===
  const [webdavConfig, setWebdavConfig] = useState({ url: '', username: '', password: '' });
  const [webdavTestResult, setWebdavTestResult] = useState(null);
  const [webdavTesting, setWebdavTesting] = useState(false);

  const adminPassword = getEnvValue('VITE_ADMIN_PASSWORD', 'pic4pick-admin');

  // === 原有状态 ===
  // 从 localStorage 加载数据
  const loadFromStorage = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load from localStorage:', error);
    }
    return [];
  };

  const mapSupabaseRowToPhoto = (row) => ({
    id: row.id,
    title: row.title || '',
    location: row.location || '',
    country: row.country || '',
    category: row.category || 'featured',
    tags: row.tags || '',
    preview: row.thumbnail_url || row.image_url || '',
    image: row.image_url || '',
    webdavURL: row.image_url || '',
    latitude: row.latitude,
    longitude: row.longitude,
    altitude: row.altitude,
    focal: row.focal || '',
    aperture: row.aperture || '',
    shutter: row.shutter || '',
    iso: row.iso || '',
    camera: row.camera || '',
    lens: row.lens || '',
    rating: typeof row.rating === 'number' ? row.rating : null,
    shotDate: row.shot_date || null,
    createdAt: row.created_at,
    status: row.status || 'pending',
    hidden: row.hidden ?? false,
    thumbnail: row.thumbnail_url || null,
  });

  const buildSupabasePayloadFromPhoto = (photo, statusOverride) => ({
    id: photo.id,
    title: photo.title || '',
    location: photo.location || '',
    country: photo.country || '',
    category: photo.category || 'featured',
    tags: photo.tags || '',
    image_url: photo.image || photo.preview || '',
    latitude: photo.latitude,
    longitude: photo.longitude,
    altitude: photo.altitude,
    focal: photo.focal || null,
    aperture: photo.aperture || null,
    shutter: photo.shutter || null,
    iso: photo.iso || null,
    camera: photo.camera || null,
    lens: photo.lens || null,
    rating: typeof photo.rating === 'number' ? photo.rating : null,
    shot_date: photo.shotDate || null,
    thumbnail_url: photo.thumbnail || null,
    hidden: photo.hidden ?? false,
    status: statusOverride ?? photo.status ?? 'pending',
  });

  const supabase = getSupabaseClient();
  const [envConfigForm, setEnvConfigForm] = useState(() => ({
    supabaseUrl: getEnvValue('VITE_SUPABASE_URL', ''),
    supabaseAnonKey: getEnvValue('VITE_SUPABASE_ANON_KEY', ''),
    amapKey: getEnvValue('VITE_AMAP_KEY', ''),
  }));
  const [envConfigMessage, setEnvConfigMessage] = useState({ type: '', text: '' });
  const importFileInputRef = useRef(null);
  const logoFileInputRef = useRef(null);
  const [adminUploads, setAdminUploads] = useState(() => {
    if (supabase) return [];
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (error) {
      console.error('Failed to load from localStorage:', error);
      }
      return [];
    });
  const [uploadForm, setUploadForm] = useState({
    title: '',
    location: '',
    country: '',
    category: 'featured',
    tags: '',
    preview: '',
    file: null,
    uploadMode: 'url', // 'file' | 'url'
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
  const [cameraOptions, setCameraOptions] = useState(() => {
    try {
      const raw = localStorage.getItem('admin_camera_options');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [lensOptions, setLensOptions] = useState(() => {
    try {
      const raw = localStorage.getItem('admin_lens_options');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [showCameraDropdown, setShowCameraDropdown] = useState(false);
  const [showLensDropdown, setShowLensDropdown] = useState(false);
  const [isAdminAuthed, setIsAdminAuthed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('admin_authed') === 'true';
    } catch {
      return false;
    }
  });
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const addCameraOption = (value) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return;
    setCameraOptions((prev) => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      try {
        localStorage.setItem('admin_camera_options', JSON.stringify(next));
      } catch {}
      if (supabase) {
        (async () => {
          try {
            const { error } = await supabase
              .from('gear_presets')
              .upsert(
                { type: 'camera', name: trimmed },
                { onConflict: 'type,name', ignoreDuplicates: true }
              );
            if (error && error.code !== '23505') {
              console.error('保存常用相机到 Supabase 失败:', error);
            }
          } catch (e) {
            console.error('保存常用相机到 Supabase 异常:', e);
          }
        })();
      }
      return next;
    });
  };
  const addLensOption = (value) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return;
    setLensOptions((prev) => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      try {
        localStorage.setItem('admin_lens_options', JSON.stringify(next));
      } catch {}
      if (supabase) {
        (async () => {
          try {
            const { error } = await supabase
              .from('gear_presets')
              .upsert(
                { type: 'lens', name: trimmed },
                { onConflict: 'type,name', ignoreDuplicates: true }
              );
            if (error && error.code !== '23505') {
              console.error('保存常用镜头到 Supabase 失败:', error);
            }
          } catch (e) {
            console.error('保存常用镜头到 Supabase 异常:', e);
          }
        })();
      }
      return next;
    });
  };
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const locationMapContainerRef = useRef(null);
  const locationMapInstance = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState(null); // { lat, lon }
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [submitMessage, setSubmitMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'pending' | 'approved' | 'tools' | 'config'
  const [isUploading, setIsUploading] = useState(false);
  const [uploadType, setUploadTypeState] = useState(getUploadType());
  const [isSupabaseLoading, setIsSupabaseLoading] = useState(Boolean(supabase));
  const [supabaseError, setSupabaseError] = useState('');
  const [brandLogo, setBrandLogo] = useState(() => getStoredBrandLogo());
  const [logoMessage, setLogoMessage] = useState({ type: '', text: '' });
  const [brandText, setBrandText] = useState(() => getStoredBrandText());
  const [brandTextMessage, setBrandTextMessage] = useState({ type: '', text: '' });

  // 工具：图片压缩模块状态
  const [toolFile, setToolFile] = useState(null);
  const [toolOriginalPreview, setToolOriginalPreview] = useState('');
  const [toolCompressedPreview, setToolCompressedPreview] = useState('');
  const [toolMessage, setToolMessage] = useState({ type: '', text: '' });
  const [toolLoading, setToolLoading] = useState(false);

  const pendingReviewCount = useMemo(() => adminUploads.length, [adminUploads]);

  // 调试：在开发环境打印高德 KEY 是否存在
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('VITE_AMAP_KEY in AdminPage:', getEnvValue('VITE_AMAP_KEY', '(undefined)'));
    }
  }, []);

  // 从 Supabase 同步常用相机/镜头
  useEffect(() => {
    const loadGearPresets = async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from('gear_presets')
          .select('type, name')
          .order('name', { ascending: true });
        if (error) {
          console.error('加载常用相机/镜头失败:', error);
          return;
        }
        const cameras = [];
        const lenses = [];
        for (const row of data || []) {
          if (row.type === 'camera' && row.name && !cameras.includes(row.name)) {
            cameras.push(row.name);
          }
          if (row.type === 'lens' && row.name && !lenses.includes(row.name)) {
            lenses.push(row.name);
          }
        }
        if (cameras.length) {
          setCameraOptions((prev) => {
            const merged = Array.from(new Set([...prev, ...cameras]));
            try {
              localStorage.setItem('admin_camera_options', JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
        if (lenses.length) {
          setLensOptions((prev) => {
            const merged = Array.from(new Set([...prev, ...lenses]));
            try {
              localStorage.setItem('admin_lens_options', JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      } catch (e) {
        console.error('加载常用相机/镜头异常:', e);
      }
    };
    loadGearPresets();
  }, [supabase]);

  const loadRemoteBrandLogo = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from(BRAND_LOGO_SUPABASE_TABLE)
        .select('logo_data, logo_url')
        .eq('id', BRAND_LOGO_SUPABASE_ID)
        .limit(1);
      if (error) {
        console.error('加载云端 Logo 失败:', error);
        return;
      }
      const record = Array.isArray(data) ? data[0] : null;
      const remoteLogo = record?.logo_data || record?.logo_url || '';
      const normalized = remoteLogo || '';
      if (normalized) {
        saveBrandLogo(normalized);
      } else {
        removeBrandLogo();
      }
      setBrandLogo(normalized);
    } catch (error) {
      console.error('加载云端 Logo 失败:', error);
    }
  }, [supabase]);

  const loadRemoteBrandText = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from(BRAND_LOGO_SUPABASE_TABLE)
        .select('site_title, site_subtitle, admin_title, admin_subtitle')
        .eq('id', BRAND_LOGO_SUPABASE_ID)
        .limit(1);
      if (error) {
        console.error('加载云端品牌标题失败:', error);
        return;
      }
      const record = Array.isArray(data) ? data[0] : null;
      if (!record) return;

      // 以本地已有配置为基础，只在为空时用远端覆盖，避免你输入时被频繁重置
      const local = getStoredBrandText();
      const remoteText = {
        siteTitle: record.site_title || local.siteTitle,
        siteSubtitle: record.site_subtitle || local.siteSubtitle,
        adminTitle: record.admin_title || local.adminTitle,
        adminSubtitle: record.admin_subtitle || local.adminSubtitle,
      };
      saveBrandText(remoteText);
      setBrandText(remoteText);
    } catch (error) {
      console.error('加载云端品牌标题失败:', error);
    }
  }, [supabase]);

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
    loadRemoteBrandLogo();
    loadRemoteBrandText();
  }, [loadRemoteBrandLogo, loadRemoteBrandText]);

  useEffect(() => {
    if (!logoMessage.text) return;
    const timer = setTimeout(() => setLogoMessage({ type: '', text: '' }), 3200);
    return () => clearTimeout(timer);
  }, [logoMessage]);

  useEffect(() => {
    if (!brandTextMessage.text) return;
    const timer = setTimeout(() => setBrandTextMessage({ type: '', text: '' }), 3200);
    return () => clearTimeout(timer);
  }, [brandTextMessage]);

  // 加载已审核通过的作品
  const loadApprovedPhotos = () => {
    try {
      const stored = localStorage.getItem(APPROVED_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load approved photos:', error);
    }
    return [];
  };

  const [approvedPhotos, setApprovedPhotos] = useState(() => (supabase ? [] : loadApprovedPhotos()));
  const approvedCount = useMemo(() => approvedPhotos.length, [approvedPhotos]);
  
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

  // WebDAV 配置管理
  useEffect(() => {
    const config = getWebDAVConfig();
    setWebdavConfig(config);
  }, []);

  // 保存 WebDAV 配置
  const handleSaveWebDAVConfig = () => {
    saveWebDAVConfig(
      webdavConfig.url.trim(),
      webdavConfig.username.trim(),
      webdavConfig.password.trim()
    );
    setWebdavTestResult({
      type: 'info',
      message: '配置已保存'
    });
    setTimeout(() => setWebdavTestResult(null), 3000);
  };

  // 测试 WebDAV 连接
  const handleTestWebDAV = async () => {
    setWebdavTesting(true);
    setWebdavTestResult(null);

    try {
      const result = await testWebDAVConnection();
      setWebdavTestResult({
        type: result.success ? 'success' : 'error',
        message: result.message
      });
    } catch (error) {
      setWebdavTestResult({
        type: 'error',
        message: error.message
      });
    } finally {
      setWebdavTesting(false);
    }
  };

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
        console.error('保存 Logo 失败:', error);
        setLogoMessage({ type: 'error', text: `保存失败：${error.message}` });
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
      console.error('重置 Logo 失败:', error);
      setLogoMessage({ type: 'error', text: `重置失败：${error.message}` });
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
      console.error('导出数据失败:', error);
      setSubmitMessage({ type: 'error', text: `导出失败：${error.message}` });
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
          localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
          localStorage.setItem(APPROVED_STORAGE_KEY, JSON.stringify(approved));
        } catch (storageError) {
          console.error('写入 localStorage 失败:', storageError);
        }
        setAdminUploads(pending.map((r) => mapSupabaseRowToPhoto(r)));
        setApprovedPhotos(approved.map((r) => mapSupabaseRowToPhoto(r)));
      }

      setSubmitMessage({ type: 'success', text: '数据导入成功' });
      setTimeout(() => setSubmitMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('导入数据失败:', error);
      setSubmitMessage({ type: 'error', text: `导入失败：${error.message}` });
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
        console.warn('未配置 VITE_AMAP_KEY，高德地点搜索不可用');
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
        const autocompleteUrl = `/amap-api/v3/assistant/inputtips?key=${amapKey}&keywords=${encodeURIComponent(
          query
        )}&city=&datatype=all`;
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
        const searchUrl = `/amap-api/v3/place/text?key=${amapKey}&keywords=${encodeURIComponent(
          query
        )}&city=&offset=20&page=1&extensions=all&types=`;
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
      console.error('搜索位置失败:', error);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(uploads));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  };

  const refreshSupabaseData = useCallback(async () => {
    if (!supabase) return;
    setIsSupabaseLoading(true);
    setSupabaseError('');
    try {
      const [pendingResult, approvedResult] = await Promise.all([
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
      ]);

      if (pendingResult.error || approvedResult.error) {
        throw pendingResult.error || approvedResult.error;
      }

      const pendingMapped = (pendingResult.data || []).map(mapSupabaseRowToPhoto);
      const approvedMapped = (approvedResult.data || []).map(mapSupabaseRowToPhoto);

      setAdminUploads(pendingMapped);
      setApprovedPhotos(approvedMapped);
      saveToStorage(pendingMapped);
      try {
        localStorage.setItem(APPROVED_STORAGE_KEY, JSON.stringify(approvedMapped));
      } catch (storageError) {
        console.warn('同步已审核作品到 localStorage 失败:', storageError);
      }
    } catch (error) {
      console.error('加载 Supabase 数据失败:', error);
      setSupabaseError(error.message || '无法从 Supabase 加载数据');
    } finally {
      setIsSupabaseLoading(false);
    }
  }, [supabase]);

  // 当 adminUploads 变化时保存到 localStorage
  useEffect(() => {
    if (supabase) return;
    saveToStorage(adminUploads);
  }, [adminUploads, supabase]);

  // 更新已审核通过的作品列表
  useEffect(() => {
    if (supabase) return;
    setApprovedPhotos(loadApprovedPhotos());
  }, [supabase]);

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

    // 验证文件大小（例如限制为 10MB）
    if (file.size > 10 * 1024 * 1024) {
      setSubmitMessage({ type: 'error', text: '图片大小不能超过 10MB' });
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const preview = reader.result?.toString() || '';
      setUploadForm((prev) => ({ ...prev, file, preview, imageUrl: '' }));
      
      // 读取EXIF数据获取地理位置
      try {
        const exif = await exifr.parse(file, {
          gps: true,
          translateKeys: false,
        });
        
        if (exif?.GPSLatitude && exif?.GPSLongitude) {
          setUploadForm((prev) => ({
            ...prev,
            latitude: exif.GPSLatitude,
            longitude: exif.GPSLongitude,
            altitude: exif.GPSAltitude || null,
          }));
          setSelectedLocation({
            lat: exif.GPSLatitude,
            lon: exif.GPSLongitude,
          });
          setSubmitMessage({ type: 'success', text: '已从照片EXIF数据中读取地理位置信息' });
        } else {
          // 如果没有EXIF数据，提示可以手动选择
          setUploadForm((prev) => ({
            ...prev,
            latitude: null,
            longitude: null,
            altitude: null,
          }));
          setSelectedLocation(null);
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
          imageURL = await uploadImage(uploadForm.file, filename);
          console.log('上传成功，返回 URL:', imageURL);
          if (uploadType !== UPLOAD_TYPES.BASE64) {
            setSubmitMessage({ type: 'success', text: `照片已上传到 ${getUploadTypeName(uploadType)}` });
          }
        } catch (error) {
          console.error('上传失败，使用本地预览:', error);
          console.error('错误详情:', {
            message: error.message,
            stack: error.stack,
            uploadType: uploadType,
          });
          if (uploadType !== UPLOAD_TYPES.BASE64) {
            setSubmitMessage({ type: 'error', text: `上传失败: ${error.message}，使用本地预览` });
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
        webdavURL: imageURL.startsWith('http') ? imageURL : null, // 标记是否为 WebDAV URL
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

    // 记录常用相机/镜头
    if (newUpload.camera) {
      setCameraOptions((prev) => {
        if (prev.includes(newUpload.camera)) return prev;
        const next = [...prev, newUpload.camera];
        try {
          localStorage.setItem('admin_camera_options', JSON.stringify(next));
        } catch {}
        return next;
      });
    }
    if (newUpload.lens) {
      setLensOptions((prev) => {
        if (prev.includes(newUpload.lens)) return prev;
        const next = [...prev, newUpload.lens];
        try {
          localStorage.setItem('admin_lens_options', JSON.stringify(next));
        } catch {}
        return next;
      });
    }

    if (supabase) {
      try {
        await supabase.from('photos').upsert(buildSupabasePayloadFromPhoto(newUpload, 'pending'));
        await refreshSupabaseData();
      } catch (error) {
        console.error('Supabase 保存失败:', error);
        setSubmitMessage({ type: 'error', text: `上传到云端失败：${error.message}` });
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
      uploadMode: 'url',
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
        localStorage.setItem(APPROVED_STORAGE_KEY, JSON.stringify(approved));
        setApprovedPhotos([...approved]);
      }
    } catch (error) {
      console.error('Failed to save approved photo:', error);
    }
  };

  const handleApprove = async (id) => {
    const itemToApprove = adminUploads.find((item) => item.id === id);
    if (itemToApprove) {
      if (!supabase) {
        // 保存到审核通过列表（本地模式）
      saveApprovedPhoto(itemToApprove);
      } else {
        try {
          await supabase
            .from('photos')
            .update({ status: 'approved' })
            .eq('id', id);
          await refreshSupabaseData();
        } catch (error) {
          console.error('更新 Supabase 状态失败:', error);
          setSubmitMessage({ type: 'error', text: `云端审核失败：${error.message}` });
          return;
        }
      }
      // 从待审核列表移除（本地 UI 立即反馈）
      setAdminUploads((prev) => prev.filter((item) => item.id !== id));
      setSubmitMessage({ type: 'success', text: '作品已通过审核，已添加到前端图库' });
      setActiveTab('approved'); // 切换到已审核标签
    }
    setTimeout(() => {
      setSubmitMessage({ type: '', text: '' });
    }, 3000);
  };

  const handleReject = async (id) => {
    setAdminUploads((prev) => prev.filter((item) => item.id !== id));

    if (supabase) {
      try {
        await supabase
          .from('photos')
          .update({ status: 'rejected' })
          .eq('id', id);
        await refreshSupabaseData();
      } catch (error) {
        console.error('拒绝作品失败:', error);
        setSubmitMessage({ type: 'error', text: `云端拒绝失败：${error.message}` });
        return;
      }
    }

    setSubmitMessage({ type: 'success', text: '作品已拒绝' });
    setTimeout(() => {
      setSubmitMessage({ type: '', text: '' });
    }, 2000);
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
        console.error('更新云端作品失败:', error);
        setSubmitMessage({ type: 'error', text: `保存失败：${error.message}` });
        return;
      }
    }

    try {
      const approved = loadApprovedPhotos();
      const index = approved.findIndex((p) => p.id === editingPhotoId);
      
      if (index !== -1) {
        approved[index] = {
          ...approved[index],
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
        
        localStorage.setItem(APPROVED_STORAGE_KEY, JSON.stringify(approved));
        setApprovedPhotos([...approved]);
        setEditingPhotoId(null);
        setSubmitMessage({ type: 'success', text: '编辑成功！' });
        setTimeout(() => {
          setSubmitMessage({ type: '', text: '' });
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to save edit:', error);
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

  // 删除作品
  const handleDelete = async () => {
    if (!editingPhotoId) return;
    
    if (window.confirm('确定要删除这个作品吗？此操作不可恢复。')) {
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
          console.error('删除云端作品失败:', error);
          setSubmitMessage({ type: 'error', text: `删除失败：${error.message}` });
          return;
        }
      }

      try {
        const approved = loadApprovedPhotos();
        const filtered = approved.filter((p) => p.id !== editingPhotoId);
        
        localStorage.setItem(APPROVED_STORAGE_KEY, JSON.stringify(filtered));
        setApprovedPhotos([...filtered]);
        setEditingPhotoId(null);
        setSubmitMessage({ type: 'success', text: '删除成功！' });
        setTimeout(() => {
          setSubmitMessage({ type: '', text: '' });
        }, 2000);
      } catch (error) {
        console.error('Failed to delete:', error);
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
                            localStorage.setItem('admin_authed', 'true');
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
                    try {
                      localStorage.setItem('admin_authed', 'true');
                    } catch {}
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
              {/* 扳手 + 螺母图标，更符合“工具”含义 */}
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
        </div>

        {/* 内容区域 / 配置区域 */}
        {activeTab === 'config' ? (
          <div className="admin-settings-grid">
            {/* .env.local 配置覆盖 */}
            <section className="admin-settings-card">
              <div className="admin-settings-card-header">
            <div>
                  <h2 className="admin-settings-card-title">运行时配置（覆盖 .env.local）</h2>
                  <p className="admin-settings-card-subtitle">
                这些值会保存到浏览器的 localStorage，用于覆盖 Supabase、地图等配置，适合快速切换测试环境。
              </p>
            </div>
            <div
                  className="admin-settings-card-badge"
                  style={{ color: supabase ? 'var(--success)' : 'var(--warning)' }}
            >
              {supabase ? 'Supabase 已启用' : 'Supabase 未配置，正在使用本地存储'}
            </div>
          </div>

          {envConfigMessage.text && (
            <div className={`admin-message ${envConfigMessage.type}`} style={{ marginBottom: '12px' }}>
              {envConfigMessage.text}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
              marginBottom: '16px',
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Supabase URL</span>
              <input
                type="text"
                name="supabaseUrl"
                value={envConfigForm.supabaseUrl}
                onChange={handleEnvConfigChange}
                placeholder="https://xxxx.supabase.co"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text)',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Supabase anon key</span>
              <textarea
                name="supabaseAnonKey"
                value={envConfigForm.supabaseAnonKey}
                onChange={handleEnvConfigChange}
                placeholder="eyJhbGciOi..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text)',
                  resize: 'vertical',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>高德地图 Key</span>
              <input
                type="text"
                name="amapKey"
                value={envConfigForm.amapKey}
                onChange={handleEnvConfigChange}
                placeholder="请输入高德 Web 服务 key"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text)',
                }}
              />
            </label>
          </div>

              <div className="admin-settings-actions-row">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleExportPhotos}
                style={{ minWidth: '140px' }}
              >
                导出 JSON 备份
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleImportClick}
                style={{ minWidth: '140px' }}
              >
                从 JSON 导入
              </button>
              <input
                ref={importFileInputRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={handleImportPhotos}
              />
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleResetEnvConfig}
                  style={{ minWidth: '120px' }}
            >
              恢复默认
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSaveEnvConfig}
                  style={{ minWidth: '120px' }}
            >
              保存配置
            </button>
          </div>
        </section>

            {/* 品牌 Logo 设置 */}
            <section className="admin-settings-card">
              <div className="admin-settings-card-header">
                <div>
                  <h2 className="admin-settings-card-title">品牌 Logo</h2>
                  <p className="admin-settings-card-subtitle">
                    上传一张正方形的图片即可替换前台与后台顶部的圆环 Logo，支持 PNG / JPG / SVG。
                  </p>
                </div>
                <div
                  className="admin-settings-card-badge"
                  style={{ color: brandLogo ? 'var(--success)' : 'var(--muted)' }}
                >
                  {brandLogo ? '已启用自定义 Logo' : '当前使用默认圆环'}
                </div>
              </div>

              <div className="admin-logo-preview-wrapper">
                <div className="admin-logo-ring-frame">
                  {brandLogo ? (
                    <img
                      src={brandLogo}
                      alt="当前 Logo 预览"
                      className="brand-logo-img"
                      style={{ width: '72px', height: '72px' }}
                    />
                  ) : (
                    <div className="logo-mark" aria-hidden="true" style={{ width: '72px', height: '72px' }} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: '240px' }}>
                  <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '12px' }}>
                    建议尺寸 320×320 以内，背景建议透明或纯色。更新后无需刷新即可在所有页面生效。
                  </p>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button type="button" className="btn-primary" onClick={handleLogoUploadClick}>
                      上传新 Logo
                </button>
                    <button type="button" className="btn-secondary" onClick={handleResetLogo} disabled={!brandLogo}>
                      使用默认
                    </button>
                  </div>
                  {logoMessage.text && (
                    <div className={`admin-message ${logoMessage.type}`} style={{ marginTop: '12px' }}>
                      {logoMessage.text}
                    </div>
                  )}
                </div>
              </div>

              <input
                ref={logoFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoFileChange}
                style={{ display: 'none' }}
              />
            </section>

            {/* 品牌标题设置 */}
            <section className="admin-settings-card">
              <div className="admin-settings-card-header">
                <div>
                  <h2 className="admin-settings-card-title">品牌标题文案</h2>
                  <p className="admin-settings-card-subtitle">
                    配置前台和后台顶部 Logo 旁边显示的主标题与副标题，例如「CAMARTS / PHOTOGRAPHY」「CAMARTS / ADMIN PANEL」。
                  </p>
                </div>
              </div>

              {brandTextMessage.text && (
                <div className={`admin-message ${brandTextMessage.type}`} style={{ marginBottom: '12px' }}>
                  {brandTextMessage.text}
                </div>
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: '16px',
                  marginBottom: '16px',
                }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>前台主标题</span>
                  <input
                    type="text"
                    value={brandText.siteTitle}
                    onChange={(e) => setBrandText((prev) => ({ ...prev, siteTitle: e.target.value }))}
                    placeholder="CAMARTS"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text)',
                    }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>前台副标题</span>
                  <input
                    type="text"
                    value={brandText.siteSubtitle}
                    onChange={(e) => setBrandText((prev) => ({ ...prev, siteSubtitle: e.target.value }))}
                    placeholder="PHOTOGRAPHY"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text)',
                    }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>后台主标题</span>
                  <input
                    type="text"
                    value={brandText.adminTitle}
                    onChange={(e) => setBrandText((prev) => ({ ...prev, adminTitle: e.target.value }))}
                    placeholder="CAMARTS"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text)',
                    }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>后台副标题</span>
                  <input
                    type="text"
                    value={brandText.adminSubtitle}
                    onChange={(e) => setBrandText((prev) => ({ ...prev, adminSubtitle: e.target.value }))}
                    placeholder="ADMIN PANEL"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text)',
                    }}
                  />
                </label>
              </div>

              <div className="admin-settings-actions-row">
          <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    resetBrandText();
                    const fresh = getStoredBrandText();
                    setBrandText(fresh);
                    setBrandTextMessage({ type: 'info', text: '已恢复默认标题文案' });
                  }}
                  style={{ minWidth: '120px' }}
                >
                  恢复默认
          </button>
          <button
                  type="button"
                  className="btn-primary"
                  onClick={async () => {
                    try {
                      saveBrandText(brandText);
                      if (supabase) {
                        await supabase.from(BRAND_LOGO_SUPABASE_TABLE).upsert({
                          id: BRAND_LOGO_SUPABASE_ID,
                          site_title: brandText.siteTitle || null,
                          site_subtitle: brandText.siteSubtitle || null,
                          admin_title: brandText.adminTitle || null,
                          admin_subtitle: brandText.adminSubtitle || null,
                          updated_at: new Date().toISOString(),
                        });
                      }
                      setBrandTextMessage({ type: 'success', text: '标题文案已保存' });
                    } catch (error) {
                      console.error('保存品牌标题失败:', error);
                      setBrandTextMessage({ type: 'error', text: '保存失败，请稍后重试' });
                    }
                  }}
                  style={{ minWidth: '120px' }}
                >
                  保存标题
                </button>
        </div>
            </section>
          </div>
        ) : (
        <div className="admin-content-wrapper">
            {activeTab === 'tools' && (
              <section>
                <h2 className="form-section-title">图片压缩工具</h2>
                <p style={{ marginBottom: '16px', color: 'var(--muted)', fontSize: '0.9rem' }}>
                  上传一张图片，系统会在浏览器内进行压缩处理（尽量不影响画质），并在处理完成后
                  <strong> 仅在本地生成原图和压缩图文件 </strong>，你可以选择同一个文件夹进行保存。
                </p>

                {toolMessage.text && (
                  <div className={`admin-message ${toolMessage.type}`} style={{ marginBottom: '12px' }}>
                    {toolMessage.text}
                  </div>
                )}

                <div className="upload-dropzone-new" style={{ marginBottom: '20px' }}>
                  <input
                    type="file"
                    accept="image/*"
                    id="tool-file-upload"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setToolMessage({ type: '', text: '' });
                      setToolFile(file);

                      // 原图预览
                      const reader = new FileReader();
                      reader.onload = () => {
                        setToolOriginalPreview(reader.result?.toString() || '');
                      };
                      reader.readAsDataURL(file);

                      // 立即压缩，仅在本地保存
                      try {
                        setToolLoading(true);
                        const compressed = await compressImage(file, {
                          maxWidth: 2560,
                          maxHeight: 2560,
                          quality: 0.85,
                        });

                        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
                        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
                        const originalFilename = file.name || `image.${ext}`;
                        const compressedFilename = `${nameWithoutExt}pre.${ext}`;
                        // 预览压缩结果
                        const compressedUrl = compressed instanceof File ? URL.createObjectURL(compressed) : '';
                        setToolCompressedPreview(compressedUrl);

                        // 在浏览器中触发两次下载，让用户保存到同一文件夹
                        const triggerDownload = (blobFile, filename) => {
                          const url = blobFile instanceof File ? URL.createObjectURL(blobFile) : '';
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = filename;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          setTimeout(() => URL.revokeObjectURL(url), 2000);
                        };

                        triggerDownload(file, originalFilename);
                        triggerDownload(compressed, compressedFilename);

                        setToolMessage({
                          type: 'success',
                          text: '已在本地生成原图和压缩图，请在下载对话框中选择同一文件夹保存。',
                        });
                      } catch (error) {
                        console.error('图片压缩工具失败:', error);
                        setToolMessage({
                          type: 'error',
                          text: `处理失败：${error.message || '未知错误'}`,
                        });
                      } finally {
                        setToolLoading(false);
                      }
                    }}
                  />
                  <label htmlFor="tool-file-upload" className="dropzone-label">
                    {toolOriginalPreview ? (
                      <div
                        className="preview-container"
                        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}
                      >
                        <div>
                          <p style={{ marginBottom: '8px', fontSize: '0.85rem', color: 'var(--muted)' }}>
                            原图预览
                          </p>
                          <div
                            style={{
                              width: '100%',
                              maxHeight: '70vh',
                              borderRadius: '12px',
                              background: 'var(--panel)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <img
                              src={toolOriginalPreview}
                              alt="原图预览"
                              style={{
                                maxWidth: '100%',
                                maxHeight: '70vh',
                                width: 'auto',
                                height: 'auto',
                                objectFit: 'contain',
                                display: 'block',
                              }}
                            />
                          </div>
                        </div>
                        {toolCompressedPreview && (
                          <div>
                            <p style={{ marginBottom: '8px', fontSize: '0.85rem', color: 'var(--muted)' }}>
                              压缩图预览
                            </p>
                            <div
                              style={{
                                width: '100%',
                                maxHeight: '70vh',
                                borderRadius: '12px',
                                background: 'var(--panel)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <img
                                src={toolCompressedPreview}
                                alt="压缩图预览"
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: '70vh',
                                  width: 'auto',
                                  height: 'auto',
                                  objectFit: 'contain',
                                  display: 'block',
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="dropzone-placeholder">
                        <div className="dropzone-icon">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            width="48"
                            height="48"
                          >
                            <path
                              d="M4 7H20"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M6 10H18"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M8 13H16"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M10 16H14"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <p className="dropzone-text">
                          点击或拖拽上传图片，自动生成压缩图并保存到同一文件夹
                        </p>
                        <p className="dropzone-hint">支持 JPG、PNG 格式，推荐不超过 20MB</p>
                      </div>
                    )}
                  </label>
                </div>

                {toolLoading && (
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>正在压缩图片，请稍候...</p>
                )}
              </section>
            )}
          {activeTab === 'upload' && (
            <form className="admin-upload-form" onSubmit={handleUpload}>
              <div className="form-section">
                <h2 className="form-section-title">作品信息</h2>
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
                            纬度: {uploadForm.latitude.toFixed(6)}, 经度: {uploadForm.longitude.toFixed(6)}
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
                <h2 className="form-section-title">相机参数 & 上传照片 <span className="required">*</span></h2>
                
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
                
                {/* 上传方式切换 */}
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
                          <p className="dropzone-hint">支持 JPG、PNG 格式，最大 10MB</p>
                        </div>
                      )}
                    </label>
                  </div>
                ) : (
                  <div style={{ 
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px',
                    padding: '20px',
                    border: '1px solid var(--border)'
                  }}>
                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label>缩略图直链地址 <span className="required">*</span></label>
                      <input
                        type="url"
                        placeholder="https://example.com/image-thumb.jpg"
                        value={uploadForm.thumbnailUrl}
                        onChange={handleThumbnailUrlChange}
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: 'rgba(0, 0, 0, 0.2)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--text)',
                          fontSize: '0.95rem'
                        }}
                      />
                      <small style={{ 
                        display: 'block', 
                        marginTop: '8px', 
                        color: 'var(--muted)', 
                        fontSize: '0.85rem' 
                      }}>
                        用于网格和缩略显示的较小图片链接。
                      </small>
                    </div>

                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label>原图直链地址 <span className="required">*</span></label>
                      <input
                        type="url"
                        placeholder="https://example.com/image.jpg"
                        value={uploadForm.imageUrl}
                        onChange={handleUrlChange}
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: 'rgba(0, 0, 0, 0.2)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--text)',
                          fontSize: '0.95rem'
                        }}
                      />
                      <small style={{ 
                        display: 'block', 
                        marginTop: '8px', 
                        color: 'var(--muted)', 
                        fontSize: '0.85rem' 
                      }}>
                        点击大图时展示的原始图片链接。
                      </small>
                    </div>
                    {uploadForm.preview && (
                      <div style={{ 
                        marginTop: '16px',
                        position: 'relative',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: '1px solid var(--border)'
                      }}>
                        <img 
                          src={uploadForm.preview} 
                          alt="预览" 
                          style={{ 
                            width: '100%', 
                            height: 'auto',
                            display: 'block'
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            setSubmitMessage({ type: 'error', text: '无法加载图片，请检查URL是否正确' });
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setUploadForm((prev) => ({ ...prev, imageUrl: '', thumbnailUrl: '', preview: '' }));
                          }}
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            width: '32px',
                            height: '32px',
                            background: 'rgba(0, 0, 0, 0.6)',
                            border: 'none',
                            borderRadius: '50%',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '18px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                )}
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
                      <div className="item-actions" style={{
                        display: 'flex',
                        gap: '8px',
                        marginTop: 'auto',
                        paddingTop: '12px'
                      }}>
                        <button
                          className="btn-approve"
                          onClick={() => handleApprove(item.id)}
                          style={{ 
                            flex: 1,
                            fontSize: '0.85rem', 
                            padding: '8px 12px'
                          }}
                        >
                          ✓ 通过
                        </button>
                        <button
                          className="btn-reject"
                          onClick={() => handleReject(item.id)}
                          style={{ 
                            flex: 1,
                            fontSize: '0.85rem', 
                            padding: '8px 12px'
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
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '24px',
                    paddingTop: '20px',
                    borderTop: '1px solid var(--border)'
                  }}>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      style={{
                        padding: '8px 16px',
                        background: currentPage === 1 ? 'transparent' : 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: currentPage === 1 ? 'var(--muted)' : 'var(--text)',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        fontSize: '0.9rem'
                      }}
                    >
                      上一页
                    </button>
                    <div style={{
                      display: 'flex',
                      gap: '4px',
                      alignItems: 'center'
                    }}>
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
                              background: currentPage === pageNum ? 'var(--accent)' : 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              color: currentPage === pageNum ? 'var(--bg)' : 'var(--text)',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              fontWeight: currentPage === pageNum ? '600' : '400'
                            }}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                      第 {currentPage} / {totalPages} 页
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        padding: '8px 16px',
                        background: currentPage === totalPages ? 'transparent' : 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: currentPage === totalPages ? 'var(--muted)' : 'var(--text)',
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        fontSize: '0.9rem'
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
                            纬度: {editForm.latitude.toFixed(6)}, 经度: {editForm.longitude.toFixed(6)}
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
                    onClick={handleDelete}
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
