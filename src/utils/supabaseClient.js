import { createClient } from '@supabase/supabase-js';
import { getEnvValue } from './envConfig';

let supabase = null;
let currentUrl = null;
let currentKey = null;

const ensureClient = () => {
  const url = getEnvValue('VITE_SUPABASE_URL', '');
  const anonKey = getEnvValue('VITE_SUPABASE_ANON_KEY', '');

  if (!url || !anonKey) {
    if (supabase) {
      console.warn('[supabaseClient] Supabase 配置缺失，已回退到本地存储。');
    }
    supabase = null;
    currentUrl = null;
    currentKey = null;
    return null;
  }

  if (supabase && url === currentUrl && anonKey === currentKey) {
    return supabase;
  }

  supabase = createClient(url, anonKey);
  currentUrl = url;
  currentKey = anonKey;
  return supabase;
};

export const getSupabaseClient = () => ensureClient();


