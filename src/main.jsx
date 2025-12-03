import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { applyFaviconFromStoredLogo } from './utils/branding';

// 应用启动时，从本地 / Supabase 同步下来的品牌 Logo 初始化 favicon
applyFaviconFromStoredLogo();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
