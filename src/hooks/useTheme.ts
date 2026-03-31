import { useState, useEffect, useCallback } from 'react';

export type Theme = 'dark' | 'light' | 'auto';

function getSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme === 'auto' ? getSystemTheme() : theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() =>
    (localStorage.getItem('zeeble-theme') as Theme) || 'dark'
  );

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

  const setTheme = useCallback((newTheme: Theme) => setThemeState(newTheme), []);

  return { theme, setTheme };
}
