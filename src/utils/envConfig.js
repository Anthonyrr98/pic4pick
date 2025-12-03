import { Storage, STORAGE_KEYS } from './storage';

const STORAGE_KEY = STORAGE_KEYS.ENV_OVERRIDES;
let cachedOverrides = null;

const readOverrides = () => {
  if (cachedOverrides !== null) {
    return cachedOverrides;
  }

  cachedOverrides = Storage.get(STORAGE_KEY, {});
  return cachedOverrides;
};

const persistOverrides = (overrides) => {
  cachedOverrides = overrides;
  
  if (!overrides || Object.keys(overrides).length === 0) {
    Storage.remove(STORAGE_KEY);
  } else {
    Storage.set(STORAGE_KEY, overrides);
  }
};

export const ENV_OVERRIDE_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_AMAP_KEY',
  'VITE_ADMIN_PASSWORD',
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

