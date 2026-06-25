import React, { createContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';

export type Theme = 'light' | 'dark' | 'dar-red';

const THEMES: Theme[] = ['light', 'dark', 'dar-red'];

function applyThemeClass(root: HTMLElement, theme: Theme) {
  root.classList.remove('dark', 'dar-red');
  if (theme === 'dark') root.classList.add('dark');
  if (theme === 'dar-red') root.classList.add('dar-red');
}

export interface DarkModeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';

    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark' || saved === 'dar-red') return saved;

    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  });

  useLayoutEffect(() => {
    applyThemeClass(document.documentElement, theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      const saved = localStorage.getItem('theme');
      if (saved !== 'light' && saved !== 'dark' && saved !== 'dar-red') {
        setTheme(mediaQuery.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const setThemeWithTransition = (newTheme: Theme) => {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    applyThemeClass(root, newTheme);
    localStorage.setItem('theme', newTheme);
    setTheme(newTheme);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('theme-switching');
      });
    });
  };

  const toggleTheme = () => {
    const currentIndex = THEMES.indexOf(theme);
    const newTheme = THEMES[(currentIndex + 1) % THEMES.length];
    setThemeWithTransition(newTheme);
  };

  const contextValue = useMemo(() => ({ theme, setTheme: setThemeWithTransition, toggleTheme }), [theme]);

  return <DarkModeContext.Provider value={contextValue}>{children}</DarkModeContext.Provider>;
}
