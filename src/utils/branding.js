const BRAND_LOGO_STORAGE_KEY = 'camarts_brand_logo';
const BRAND_LOGO_EVENT = 'camarts-brand-logo-change';
const BRAND_LOGO_SUPABASE_TABLE = 'brand_settings';
const BRAND_LOGO_SUPABASE_ID = 'camarts_brand';

// 文案配置（标题、副标题）
const BRAND_TEXT_STORAGE_KEY = 'camarts_brand_text';

const isBrowserEnvironment = () =>
  typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const dispatchLogoChange = (value) => {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BRAND_LOGO_EVENT, { detail: value || '' }));
  }
};

// ===== Logo 存取 =====

export const getStoredBrandLogo = () => {
  if (!isBrowserEnvironment()) return '';
  try {
    return localStorage.getItem(BRAND_LOGO_STORAGE_KEY) || '';
  } catch (error) {
    console.error('Failed to read brand logo from localStorage:', error);
    return '';
  }
};

export const saveBrandLogo = (dataUrl) => {
  if (!isBrowserEnvironment()) return;
  try {
    if (dataUrl) {
      localStorage.setItem(BRAND_LOGO_STORAGE_KEY, dataUrl);
    } else {
      localStorage.removeItem(BRAND_LOGO_STORAGE_KEY);
    }
    dispatchLogoChange(dataUrl);
  } catch (error) {
    console.error('Failed to save brand logo:', error);
  }
};

export const removeBrandLogo = () => {
  if (!isBrowserEnvironment()) return;
  try {
    localStorage.removeItem(BRAND_LOGO_STORAGE_KEY);
    dispatchLogoChange('');
  } catch (error) {
    console.error('Failed to remove brand logo:', error);
  }
};

// ===== 标题文案存取 =====

const DEFAULT_BRAND_TEXT = {
  siteTitle: 'CAMARTS',
  siteSubtitle: 'PHOTOGRAPHY',
  adminTitle: 'CAMARTS',
  adminSubtitle: 'ADMIN PANEL',
};

export const getStoredBrandText = () => {
  if (!isBrowserEnvironment()) return { ...DEFAULT_BRAND_TEXT };
  try {
    const raw = localStorage.getItem(BRAND_TEXT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BRAND_TEXT };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_BRAND_TEXT, ...parsed };
  } catch (error) {
    console.error('Failed to read brand text from localStorage:', error);
    return { ...DEFAULT_BRAND_TEXT };
  }
};

export const saveBrandText = (textConfig) => {
  if (!isBrowserEnvironment()) return;
  try {
    const merged = { ...DEFAULT_BRAND_TEXT, ...(textConfig || {}) };
    localStorage.setItem(BRAND_TEXT_STORAGE_KEY, JSON.stringify(merged));
  } catch (error) {
    console.error('Failed to save brand text:', error);
  }
};

export const resetBrandText = () => {
  if (!isBrowserEnvironment()) return;
  try {
    localStorage.removeItem(BRAND_TEXT_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to reset brand text:', error);
  }
};

export {
  BRAND_LOGO_STORAGE_KEY,
  BRAND_LOGO_EVENT,
  BRAND_LOGO_SUPABASE_TABLE,
  BRAND_LOGO_SUPABASE_ID,
  BRAND_TEXT_STORAGE_KEY,
};

