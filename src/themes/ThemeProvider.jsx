import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { ThemeContext } from './ThemeContext';
import { applyTheme, DEFAULT_THEME, isTheme, readTheme, THEMES } from './themeConfig';

gsap.registerPlugin(useGSAP);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readTheme);
  const wash = useRef(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const preset = THEMES.find((item) => item.id === theme);
      gsap.fromTo(wash.current, { opacity: 0.12 }, { opacity: 0, duration: preset.duration, ease: preset.ease });
    });
    return () => media.revert();
  }, { dependencies: [theme], revertOnUpdate: true });

  const selectTheme = useCallback((id) => {
    if (!isTheme(id)) return;
    applyTheme(id);
    setTheme(id);
    try {
      window.localStorage.setItem(STORAGE_KEYS.THEME, id);
    } catch {
      // The current session still works when storage is disabled or full.
    }
  }, []);

  useEffect(() => {
    const syncTheme = (event) => {
      if (event.key !== STORAGE_KEYS.THEME && event.key !== null) return;
      const id = isTheme(event.newValue) ? event.newValue : DEFAULT_THEME;
      applyTheme(id);
      setTheme(id);
    };
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  const value = useMemo(() => ({ theme, selectTheme }), [theme, selectTheme]);
  return <ThemeContext.Provider value={value}>{children}<div className="theme-transition-wash" ref={wash} aria-hidden="true" /></ThemeContext.Provider>;
}
