import { Suspense, lazy } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import { ErrorBoundary } from './components/ErrorBoundary';

const AdminPage = lazy(() =>
  import('./pages/Admin.jsx').then((module) => ({ default: module.AdminPage }))
);
const GalleryPage = lazy(() =>
  import('./pages/Gallery.jsx').then((module) => ({ default: module.GalleryPage }))
);

function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Suspense fallback={<div className="loading-container">正在装片...</div>}>
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
