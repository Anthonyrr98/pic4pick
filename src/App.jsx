import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import './themes/themes.css';
import './themes/darkroom.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppIntro, AppLoading } from './components/AppLoading';
import { EntryMotionContext } from './contexts/EntryMotionContext';

const AdminPage = lazy(() =>
  import('./pages/Admin.jsx').then((module) => ({ default: module.AdminPage }))
);
const GalleryPage = lazy(() =>
  import('./pages/Gallery.jsx').then((module) => ({ default: module.GalleryPage }))
);

const INTRO_SESSION_KEY = 'pic4pick_intro_seen';

const shouldSkipIntro = () => {
  if (typeof window === 'undefined') return false;
  if (window.location.hash.includes('/admin')) return true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  try { return window.sessionStorage.getItem(INTRO_SESSION_KEY) === '1'; }
  catch { return false; }
};

function PageReady({ onReady, children }) {
  useEffect(() => { onReady(); }, [onReady]);
  return children;
}

function App() {
  const [introVisible, setIntroVisible] = useState(() => !shouldSkipIntro());
  const [pageReady, setPageReady] = useState(false);
  const markReady = useCallback(() => setPageReady(true), []);
  const dismissIntro = useCallback(() => setIntroVisible(false), []);

  useEffect(() => {
    if (!introVisible) return;
    try { window.sessionStorage.setItem(INTRO_SESSION_KEY, '1'); }
    catch { /* An unavailable session store must not block the opening sequence. */ }
  }, [introVisible]);

  return (
    <ErrorBoundary>
      <EntryMotionContext.Provider value={!introVisible}>
        {introVisible && <AppIntro ready={pageReady} onComplete={dismissIntro} />}
        <HashRouter>
          <Suspense fallback={introVisible ? null : <AppLoading />}>
            <Routes>
              <Route path="/" element={<PageReady onReady={markReady}><GalleryPage /></PageReady>} />
              <Route path="/admin" element={<PageReady onReady={markReady}><AdminPage /></PageReady>} />
            </Routes>
          </Suspense>
        </HashRouter>
      </EntryMotionContext.Provider>
    </ErrorBoundary>
  );
}

export default App;
