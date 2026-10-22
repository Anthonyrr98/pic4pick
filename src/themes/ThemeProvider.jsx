import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { ThemeContext } from './ThemeContext';
import { applyTheme, DEFAULT_THEME, FILM_SECTION_THEME, getThemeDefinition, isTheme, readTheme } from './themeConfig';

gsap.registerPlugin(useGSAP);

export function ThemeProvider({ children }) {
  const [preferredTheme, setPreferredTheme] = useState(readTheme);
  const [filmMode, setFilmMode] = useState(false);
  const theme = filmMode ? FILM_SECTION_THEME.id : preferredTheme;
  const wash = useRef(null);

  useLayoutEffect(() => { applyTheme(theme); }, [theme]);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const preset = getThemeDefinition(theme);
      gsap.fromTo(wash.current, { opacity: 0.12 }, { opacity: 0, duration: preset.duration, ease: preset.ease });
    });
    return () => media.revert();
  }, { dependencies: [theme], revertOnUpdate: true });

  const selectTheme = useCallback((id) => {
    if (!isTheme(id)) return;
    setPreferredTheme(id);
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
      setPreferredTheme(id);
    };
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  const value = useMemo(() => ({ theme, preferredTheme, selectTheme, setFilmMode }), [theme, preferredTheme, selectTheme]);
  return <ThemeContext.Provider value={value}>{children}<div className="theme-transition-wash" ref={wash} aria-hidden="true" /></ThemeContext.Provider>;
}
