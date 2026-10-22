import { STORAGE_KEYS } from '../constants/storageKeys';

export const THEMES = [
  { id: 'paper', name: '纸白', english: 'PAPER GALLERY', colors: ['#f5f5f2', '#ffffff', '#1e2729', '#48645e'], duration: 0.34, ease: 'power2.out' },
  { id: 'film', name: '暖调', english: 'WARM ANALOG', colors: ['#f2eadd', '#faf4e9', '#3b3028', '#a85532'], duration: 0.56, ease: 'power2.inOut' },
];

export const DEFAULT_THEME = 'paper';
// A section atmosphere is temporary and never replaces the visitor's saved preference.
export const FILM_SECTION_THEME = { id: 'darkroom', name: '暗房相册', colors: ['#25241f', '#302e28', '#d9d2c4', '#be754c'], duration: 0.3, ease: 'power2.out' };
export const getThemeDefinition = (id) => id === FILM_SECTION_THEME.id
  ? FILM_SECTION_THEME : THEMES.find((theme) => theme.id === id) || THEMES[0];
export const isTheme = (value) => THEMES.some((theme) => theme.id === value);

export function readTheme() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEYS.THEME);
    return isTheme(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',
    getThemeDefinition(id).colors[0]);
}
