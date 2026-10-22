import { escapeHtml } from './security.js';

// Upload and edit pickers use the same marker, while each owns its map lifecycle.
export const addLocationMarker = (maplibre, map, latitude, longitude, options = {}) => {
  const element = document.createElement('div');
  element.className = 'custom-marker';
  element.style.cssText = `
    width: 30px;
    height: 30px;
    background: #e74c3c;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    cursor: pointer;
  `;
  const label = 'label' in options ? `${escapeHtml(options.label)}<br>` : '';
  const popup = new maplibre.Popup({ offset: 25 }).setHTML(
    `${label}纬度: ${escapeHtml(latitude.toFixed(6))}<br>经度: ${escapeHtml(longitude.toFixed(6))}`
  );
  const marker = new maplibre.Marker(element).setLngLat([longitude, latitude]).setPopup(popup).addTo(map);
  marker.togglePopup();
  return marker;
};
