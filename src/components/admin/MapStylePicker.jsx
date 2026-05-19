/**
 * 地图样式网格选择器（带缩略图）
 */

import { MAP_STYLE_PRESETS } from '../../utils/gaodeMapStyle';

export const MapStylePicker = ({ value, onChange }) => {
  const selectedId = value || 'street';

  return (
    <div className="map-style-grid" role="radiogroup" aria-label="地图样式">
      {MAP_STYLE_PRESETS.map((preset) => {
        const selected = preset.id === selectedId;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`map-style-card${selected ? ' selected' : ''}`}
            onClick={() => onChange(preset.id)}
            title={preset.description}
          >
            <div className="map-style-thumb">
              <img
                src={preset.thumbnail}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
              <span className={`map-style-badge map-style-badge--${preset.kind}`}>
                {preset.kind === 'raster' ? '栅格' : 'JS'}
              </span>
            </div>
            <span className="map-style-label">{preset.label}</span>
          </button>
        );
      })}
    </div>
  );
};
