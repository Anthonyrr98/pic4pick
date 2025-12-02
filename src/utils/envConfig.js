const STORAGE_KEY = 'pic4pick_env_overrides';

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
let cachedOverrides = null;

const readOverrides = () => {
  if (cachedOverrides !== null) {
    return cachedOverrides;
  }

  if (!isBrowser) {
    cachedOverrides = {};
    return cachedOverrides;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cachedOverrides = raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('[envConfig] 读取本地配置失败:', error);
    cachedOverrides = {};
  }
  return cachedOverrides;
};

const persistOverrides = (overrides) => {
  cachedOverrides = overrides;
  if (!isBrowser) return;

  if (!overrides || Object.keys(overrides).length === 0) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  }
};

export const ENV_OVERRIDE_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_AMAP_KEY',
];

export const getEnvValue = (key, fallback = '') => {
  const overrides = readOverrides();
  const overrideValue = overrides?.[key];
  if (overrideValue !== undefined && overrideValue !== null && overrideValue !== '') {
    return overrideValue;
  }
  return import.meta.env[key] ?? fallback;
};

export const getEnvOverrides = () => ({ ...readOverrides() });

export const updateEnvOverrides = (partial) => {
  const overrides = { ...readOverrides() };
  Object.entries(partial || {}).forEach(([key, value]) => {
    if (!key) return;
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized) {
      overrides[key] = normalized;
    } else {
      delete overrides[key];
    }
  });
  persistOverrides(overrides);
};

export const resetEnvOverrides = (keys) => {
  if (Array.isArray(keys) && keys.length > 0) {
    const overrides = { ...readOverrides() };
    keys.forEach((key) => {
      delete overrides[key];
    });
    persistOverrides(overrides);
    return;
  }
  persistOverrides({});
};

