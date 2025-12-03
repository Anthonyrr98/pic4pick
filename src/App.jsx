import { HashRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import { AdminPage } from './pages/Admin.jsx';
import { GalleryPage } from './pages/Gallery.jsx';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
    <HashRouter>
      <Routes>
        <Route path="/" element={<GalleryPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </HashRouter>
    </ErrorBoundary>
  );
}

export default App;
