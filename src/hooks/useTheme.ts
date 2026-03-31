/**
 * Theme management hook.
 * Handles dark/light/auto theme switching with system preference detection.
 * Persists preference to localStorage and applies to document root.
 */
import { useState, useEffect, useCallback } from 'react';

export type Theme = 'dark' | 'light' | 'auto';

/** Gets the system's preferred color scheme */
function getSystemTheme(): 'dark' | 'light' {
return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Applies theme to document root as data-theme attribute */
function applyTheme(theme: Theme) {
const effectiveTheme = theme === 'auto' ? getSystemTheme() : theme;
document.documentElement.setAttribute('data-theme', effectiveTheme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('zeeble-theme') as Theme | null;
    return saved || 'dark';
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('zeeble-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'auto') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('auto');
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  return { theme, setTheme };
}