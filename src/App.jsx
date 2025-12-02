import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import { AdminPage } from './pages/Admin.jsx';
import { GalleryPage } from './pages/Gallery.jsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GalleryPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
