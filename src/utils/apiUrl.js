import { getEnvValue } from './envConfig';

/** Preserve relative requests when no backend is configured. */
export const getApiUrl = (path) => {
  const base = String(getEnvValue('VITE_API_BASE_URL', '')).trim()
    .replace(/\/+$/, '').replace(/\/api$/, '');
  return `${base}${path}`;
};
