import { useId, useState } from 'react';

export function FilmStockInput({ value, onChange, options, onRemember, style }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const matches = options.filter((name) => name.toLowerCase().includes(value.trim().toLowerCase()));
  const expanded = open && matches.length > 0;
  const choose = (name) => {
    onChange(name);
    onRemember(name);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        name="filmStock"
        aria-label="胶卷"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={`${id}-options`}
        aria-activedescendant={expanded && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        placeholder="例如：Kodak Portra 400"
        value={value}
        autoComplete="off"
        style={{ width: '100%', ...style }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          onRemember(value);
          setOpen(false);
          setActiveIndex(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setActiveIndex(-1);
          } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && matches.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => event.key === 'ArrowDown'
              ? (index + 1) % matches.length
              : (index <= 0 ? matches.length : index) - 1);
          } else if (event.key === 'Enter' && expanded && activeIndex >= 0) {
            event.preventDefault();
            choose(matches[activeIndex]);
          }
        }}
      />
      {expanded && (
        <div id={`${id}-options`} role="listbox" aria-label="常用胶卷" className="admin-dropdown-panel" style={{ top: 'auto', bottom: '100%', marginTop: 0, marginBottom: 6, maxHeight: 192, overflowY: 'auto' }}>
          {matches.map((name, index) => (
            <button
              key={name}
              id={`${id}-option-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              tabIndex={-1}
              className={`admin-dropdown-item ${index === activeIndex ? 'is-active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
