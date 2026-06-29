import { Suspense, lazy, useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import { ErrorBoundary } from './components/ErrorBoundary';

const AdminPage = lazy(() =>
  import('./pages/Admin.jsx').then((module) => ({ default: module.AdminPage }))
);
const GalleryPage = lazy(() =>
  import('./pages/Gallery.jsx').then((module) => ({ default: module.GalleryPage }))
);

const INTRO_VISIBLE_MS = 900;
const INTRO_FADE_MS = 260;

function AppLoading({ exiting = false } = {}) {
  return (
    <div
      className={`app-loading-screen ${exiting ? 'is-exiting' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="胶片正在装入时光"
    >
      <div className="app-loading-mark" aria-hidden="true">
        <img src="/loa-cropped.png" alt="" />
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
  const [introState, setIntroState] = useState('visible');

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setIntroState('exiting'), INTRO_VISIBLE_MS);
    const removeTimer = window.setTimeout(() => setIntroState('hidden'), INTRO_VISIBLE_MS + INTRO_FADE_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
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
