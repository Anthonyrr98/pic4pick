import { Suspense, lazy, useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import './themes/themes.css';
import './themes/darkroom.css';
import { ErrorBoundary } from './components/ErrorBoundary';

const AdminPage = lazy(() =>
  import('./pages/Admin.jsx').then((module) => ({ default: module.AdminPage }))
);
const GalleryPage = lazy(() =>
  import('./pages/Gallery.jsx').then((module) => ({ default: module.GalleryPage }))
);

const INTRO_VISIBLE_MS = 900;
const INTRO_FADE_MS = 260;
const INTRO_SESSION_KEY = 'pic4pick_intro_seen';

const shouldSkipIntro = () => {
  if (typeof window === 'undefined') return false;
  if (window.location.hash.includes('/admin')) return true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  return window.sessionStorage.getItem(INTRO_SESSION_KEY) === '1';
};

function AppLoading({ exiting = false } = {}) {
  return (
    <div
      className={`app-loading-screen ${exiting ? 'is-exiting' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="胶片正在装入时光"
    >
      <div className="app-loading-mark" aria-hidden="true">
        <img
          src="/loa-loading.webp"
          width="900"
          height="313"
          alt=""
          fetchPriority="high"
          decoding="sync"
        />
        <span className="app-loading-sheen" />
      </div>
      <div className="app-loading-progress" aria-hidden="true">
        <span />
      </div>
      <p>胶片正在装入时光…</p>
    </div>
  );
}

function App() {
  const [introState, setIntroState] = useState(() => shouldSkipIntro() ? 'hidden' : 'visible');

  useEffect(() => {
    if (introState !== 'visible') return undefined;
    window.sessionStorage.setItem(INTRO_SESSION_KEY, '1');
    const fadeTimer = window.setTimeout(() => setIntroState('exiting'), INTRO_VISIBLE_MS);
    const removeTimer = window.setTimeout(() => setIntroState('hidden'), INTRO_VISIBLE_MS + INTRO_FADE_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
    // The timers intentionally use the mount-time intro state; rerunning on phase changes cancels removal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ErrorBoundary>
      {introState !== 'hidden' && <AppLoading exiting={introState === 'exiting'} />}
      <HashRouter>
        <Suspense fallback={<AppLoading />}>
          <Routes>
            <Route path="/" element={<GalleryPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;
