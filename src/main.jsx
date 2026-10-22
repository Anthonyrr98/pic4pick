import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { applyFaviconFromStoredLogo } from './utils/branding';
import { ThemeProvider } from './themes/ThemeProvider';
import { applyTheme, readTheme } from './themes/themeConfig';
import { prefetchPublicPhotos } from './utils/galleryPhotoSource';

// Start the public list while React and the gallery's lazy chunk initialize.
if (!window.location.hash.includes('/admin')) prefetchPublicPhotos();

applyTheme(readTheme());

// 应用启动时，从本地 / Supabase 同步下来的品牌 Logo 初始化 favicon
applyFaviconFromStoredLogo();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider><App /></ThemeProvider>
  </StrictMode>,
)
