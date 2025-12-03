import { Storage, StorageString, STORAGE_KEYS } from './storage';
import { safeSync } from './errorHandler';

const BRAND_LOGO_STORAGE_KEY = STORAGE_KEYS.BRAND_LOGO;
const BRAND_LOGO_EVENT = 'camarts-brand-logo-change';
const BRAND_LOGO_SUPABASE_TABLE = 'brand_settings';
const BRAND_LOGO_SUPABASE_ID = 'camarts_brand';
const BRAND_LOGO_MAX_SIZE = 1024 * 1024; // 1MB

// 文案配置（标题、副标题）
const BRAND_TEXT_STORAGE_KEY = STORAGE_KEYS.BRAND_TEXT;

const isBrowserEnvironment = () =>
  typeof window !== 'undefined' && typeof localStorage !== 'undefined';

// 动态更新浏览器标签上的小图标（favicon）
const applyFavicon = (dataUrl) => {
  if (typeof document === 'undefined') return;

  try {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }

    if (dataUrl) {
      // 使用后台 / Supabase 配置的品牌 Logo 作为 favicon
      link.href = dataUrl;
    }
    // 如果传入空值，则保留 HTML 里配置的默认 favicon
  } catch (error) {
    // Favicon 应用失败不影响主要功能，静默处理
  }
};

const dispatchLogoChange = (value) => {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BRAND_LOGO_EVENT, { detail: value || '' }));
  }
  // 同步更新 favicon
  applyFavicon(value || '');
};

// ===== Logo 存取 =====

export const getStoredBrandLogo = () => {
  return StorageString.get(BRAND_LOGO_STORAGE_KEY, '');
};

export const saveBrandLogo = (dataUrl) => {
    if (dataUrl) {
    StorageString.set(BRAND_LOGO_STORAGE_KEY, dataUrl);
    } else {
    Storage.remove(BRAND_LOGO_STORAGE_KEY);
    }
    dispatchLogoChange(dataUrl);
};

// 在应用初始化时，根据本地 / 远端已保存的品牌 Logo 应用 favicon
export const applyFaviconFromStoredLogo = () => {
  if (!isBrowserEnvironment()) return;
  try {
    const logo = getStoredBrandLogo();
    if (logo) {
      applyFavicon(logo);
    }
  } catch (error) {
    // Favicon 初始化失败不影响主要功能，静默处理
  }
};

export const removeBrandLogo = () => {
  Storage.remove(BRAND_LOGO_STORAGE_KEY);
    dispatchLogoChange('');
};

// ===== 标题文案存取 =====

const DEFAULT_BRAND_TEXT = {
  siteTitle: 'CAMARTS',
  siteSubtitle: 'PHOTOGRAPHY',
  adminTitle: 'CAMARTS',
  adminSubtitle: 'ADMIN PANEL',
};

export const getStoredBrandText = () => {
  const parsed = Storage.get(BRAND_TEXT_STORAGE_KEY, null);
  if (!parsed) return { ...DEFAULT_BRAND_TEXT };
    return { ...DEFAULT_BRAND_TEXT, ...parsed };
};

export const saveBrandText = (textConfig) => {
    const merged = { ...DEFAULT_BRAND_TEXT, ...(textConfig || {}) };
  Storage.set(BRAND_TEXT_STORAGE_KEY, merged);
};

export const resetBrandText = () => {
  Storage.remove(BRAND_TEXT_STORAGE_KEY);
};

export {
  BRAND_LOGO_STORAGE_KEY,
  BRAND_LOGO_EVENT,
  BRAND_LOGO_SUPABASE_TABLE,
  BRAND_LOGO_SUPABASE_ID,
  BRAND_LOGO_MAX_SIZE,
  BRAND_TEXT_STORAGE_KEY,
};

