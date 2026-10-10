import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useTheme } from './ThemeContext';
import { THEMES } from './themeConfig';

gsap.registerPlugin(useGSAP);

export function ThemeSwitcher() {
  const { theme, selectTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const panelId = useId();
  const activeTheme = THEMES.find((item) => item.id === theme);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      if (open) {
        gsap.from(panel.current, { y: -8, opacity: 0, duration: activeTheme.duration, ease: activeTheme.ease });
        gsap.from([...panel.current.querySelectorAll('.theme-option')], { y: 5, opacity: 0, stagger: 0.045, duration: 0.25 });
      }
    });
    return () => media.revert();
  }, { scope: container, dependencies: [open, theme], revertOnUpdate: true });

  useEffect(() => {
    if (!open) return undefined;
    panel.current?.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
    const outside = (event) => {
      if (!container.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };

  const onBlur = (event) => {
    if (!container.current?.contains(event.relatedTarget) && !panel.current?.contains(event.relatedTarget)) setOpen(false);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (!open) { setOpen(true); return; }
    const options = [...panel.current.querySelectorAll('.theme-option')];
    const current = options.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : (current + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1) + options.length) % options.length;
    options[next].focus({ preventScroll: true });
  };

  return (
    <div className="theme-switcher" ref={container} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button className="theme-trigger" type="button" ref={trigger}
        aria-label={`切换主题，当前：${activeTheme.name}`} aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? panelId : undefined} onClick={() => setOpen((value) => !value)}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
        </svg>
        <span className="theme-trigger-label">外观</span>
      </button>
      {open && createPortal(
        <div className="theme-popover" id={panelId} ref={panel} onBlur={onBlur}>
          <div className="theme-popover-heading"><span>选择你的观展氛围</span><span>APPEARANCE</span></div>
          <div role="menu" aria-label="全局主题">
            {THEMES.map((item, index) => (
              <button key={item.id} type="button" role="menuitemradio" aria-checked={theme === item.id}
                tabIndex={theme === item.id ? 0 : -1} className={`theme-option${theme === item.id ? ' is-selected' : ''}`}
                onClick={() => { selectTheme(item.id); close(); }}>
                <span className="theme-preview" style={{ '--preview-bg': item.colors[0], '--preview-panel': item.colors[1], '--preview-ink': item.colors[2], '--preview-accent': item.colors[3] }} aria-hidden="true">
                  <span className="theme-preview-line" /><span className="theme-preview-frame" /><span className="theme-preview-dot" />
                </span>
                <span className="theme-option-copy"><span className="theme-option-name">{item.name}<span className="theme-option-number">0{index + 1}</span></span>
                  <span className="theme-option-english">{item.english}</span></span>
                <span className="theme-option-check" aria-hidden="true">{theme === item.id ? '✓' : ''}</span>
              </button>
            ))}
          </div>
          <p className="theme-popover-note">全站同步 · 自动记住你的选择</p>
        </div>, document.body
      )}
      <span className="theme-sr-only" role="status" aria-live="polite">当前主题：{activeTheme.name}</span>
    </div>
  );
}
