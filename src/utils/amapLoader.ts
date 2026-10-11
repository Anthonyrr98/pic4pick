import { getEnvValue } from './envConfig';
import { getActiveMapStylePreset } from './gaodeMapStyle';
import { preloadMapLibre } from './maplibreLoader';

let amapLoadPromise: Promise<void> | null = null;

export function ensureAMapLoaded(amapKey: string): Promise<void> {
  if ((window as any).AMap?.Map) return Promise.resolve();
  if (amapLoadPromise) return amapLoadPromise;

  amapLoadPromise = new Promise<void>((resolve, reject) => {
    const securityJsCode = getEnvValue('VITE_AMAP_SECURITY_JS_CODE', '');
    if (securityJsCode) (window as any)._AMapSecurityConfig = { securityJsCode };

    const existing = document.querySelector<HTMLScriptElement>('script[data-amap-sdk]');
    const script = existing || document.createElement('script');
    const cleanup = () => {
      window.clearTimeout(timer);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
    const fail = (message: string) => {
      cleanup();
      script.remove();
      reject(new Error(message));
    };
    const onLoad = () => {
      if (!(window as any).AMap?.Map) {
        fail('高德地图 SDK 未就绪（请检查 Key / securityJsCode）');
        return;
      }
      cleanup();
      resolve();
    };
    const onError = () => fail('高德地图 SDK 脚本加载失败');
    const timer = window.setTimeout(() => fail('高德地图 SDK 加载超时'), 10000);
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    if (!existing) {
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(amapKey)}`;
      script.async = true;
      script.setAttribute('data-amap-sdk', 'true');
      document.head.appendChild(script);
    }
  }).catch(error => {
    amapLoadPromise = null;
    throw error;
  });
  return amapLoadPromise;
}

// Only warm the configured provider; the alternative remains a lazy fallback.
export function preloadConfiguredMap() {
  const key = getEnvValue('VITE_AMAP_WEB_KEY', getEnvValue('VITE_AMAP_KEY', ''));
  if (getActiveMapStylePreset().kind === 'amap-js' && key && getEnvValue('VITE_AMAP_SECURITY_JS_CODE', '')) {
    void ensureAMapLoaded(key).catch(() => {});
  } else {
    preloadMapLibre();
  }
}
