/**
 * ═══════════════════════════════════════════════════════════════
 * STENVAULT - THEME CONTEXT
 * ═══════════════════════════════════════════════════════════════
 *
 * React Context for managing application themes.
 * Supports multiple color palettes with persistence.
 *
 * USAGE:
 * ```tsx
 * const { theme, setTheme, availableThemes } = useTheme();
 * ```
 *
 * ═══════════════════════════════════════════════════════════════
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  themes,
  nocturneTheme,
  ThemePalette,
  ThemeName,
  getTheme,
  getAvailableThemes,
  themeToCssVariables
} from '@/styles/themes';

interface ThemeContextValue {
  theme: ThemePalette;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  isDark: boolean;
  toggleMode: () => void;
  availableThemes: Array<{ name: ThemeName; displayName: string; description: string }>;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_STORAGE_KEY = 'stenvault-theme';
const MODE_STORAGE_KEY = 'stenvault-mode';

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeName;
}

export function ThemeProvider({ children, defaultTheme = 'nocturne' }: ThemeProviderProps) {
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored && stored in themes) {
        return stored as ThemeName;
      }
    }
    return defaultTheme;
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(MODE_STORAGE_KEY);
      if (stored !== null) {
        return stored === 'dark';
      }
      // Default to system preference, fallback to dark
      return window.matchMedia('(prefers-color-scheme: dark)').matches ?? true;
    }
    return true;
  });

  const theme = useMemo(() => getTheme(themeName), [themeName]);
  const availableThemes = useMemo(() => getAvailableThemes(), []);

  const applyTheme = useCallback((themeToApply: ThemePalette) => {
    const root = document.documentElement;
    const cssVars = themeToCssVariables(themeToApply);

    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    root.style.setProperty('--primary', themeToApply.brand.primary);
    root.style.setProperty('--primary-hover', themeToApply.brand.primaryHover);
    root.style.setProperty('--primary-foreground', themeToApply.foreground.onPrimary);
    root.style.setProperty('--secondary', themeToApply.brand.secondary);
    root.style.setProperty('--accent', themeToApply.brand.accent);
    root.style.setProperty('--accent-foreground', themeToApply.foreground.onPrimary);

    root.style.setProperty('--background', themeToApply.background.base);
    root.style.setProperty('--background-elevated', themeToApply.background.elevated);
    root.style.setProperty('--background-surface', themeToApply.background.surface);
    root.style.setProperty('--background-muted', themeToApply.background.muted);
    root.style.setProperty('--foreground', themeToApply.foreground.primary);
    root.style.setProperty('--foreground-muted', themeToApply.foreground.muted);
    root.style.setProperty('--foreground-subtle', themeToApply.foreground.subtle);

    root.style.setProperty('--card', themeToApply.background.elevated);
    root.style.setProperty('--card-foreground', themeToApply.foreground.primary);
    root.style.setProperty('--popover', themeToApply.background.surface);
    root.style.setProperty('--popover-foreground', themeToApply.foreground.primary);

    root.style.setProperty('--border', themeToApply.border.default);
    root.style.setProperty('--border-muted', themeToApply.border.muted);
    root.style.setProperty('--border-strong', themeToApply.border.strong);
    root.style.setProperty('--ring', themeToApply.border.focus);

    root.style.setProperty('--success', themeToApply.semantic.success);
    root.style.setProperty('--warning', themeToApply.semantic.warning);
    root.style.setProperty('--destructive', themeToApply.semantic.error);
    root.style.setProperty('--info', themeToApply.semantic.info);

    root.style.setProperty('--chart-1', themeToApply.chart[1]);
    root.style.setProperty('--chart-2', themeToApply.chart[2]);
    root.style.setProperty('--chart-3', themeToApply.chart[3]);
    root.style.setProperty('--chart-4', themeToApply.chart[4]);
    root.style.setProperty('--chart-5', themeToApply.chart[5]);

    root.style.setProperty('--shadow-glow-sm', `0 0 10px ${themeToApply.effects.glow}`);
    root.style.setProperty('--shadow-glow-md', `0 0 20px ${themeToApply.effects.glow}`);
    root.style.setProperty('--shadow-glow-lg', `0 0 30px ${themeToApply.effects.glowStrong}`);

    root.setAttribute('data-theme', themeToApply.name);

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', themeToApply.background.base);
    }
  }, []);

  const applyMode = useCallback((dark: boolean) => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
  }, []);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeName(name);
    localStorage.setItem(THEME_STORAGE_KEY, name);

    const newTheme = getTheme(name);
    const newIsDark = newTheme.mode === 'dark';
    setIsDark(newIsDark);
    localStorage.setItem(MODE_STORAGE_KEY, newIsDark ? 'dark' : 'light');
  }, []);

  // Remembers the user's last dark/light theme so toggling restores their preference
  const toggleMode = useCallback(() => {
    const currentTheme = getTheme(themeName);
    const currentIsDark = currentTheme.mode === 'dark';

    if (currentIsDark) {
      const lastLightTheme = localStorage.getItem('stenvault-last-light-theme') as ThemeName | null;
      const newThemeName = (lastLightTheme && lastLightTheme in themes) ? lastLightTheme : 'nocturne-day';
      localStorage.setItem('stenvault-last-dark-theme', themeName);

      setThemeName(newThemeName as ThemeName);
      localStorage.setItem(THEME_STORAGE_KEY, newThemeName);
      setIsDark(false);
      localStorage.setItem(MODE_STORAGE_KEY, 'light');
    } else {
      const lastDarkTheme = localStorage.getItem('stenvault-last-dark-theme') as ThemeName | null;
      const newThemeName = (lastDarkTheme && lastDarkTheme in themes) ? lastDarkTheme : 'nocturne';
      localStorage.setItem('stenvault-last-light-theme', themeName);

      setThemeName(newThemeName as ThemeName);
      localStorage.setItem(THEME_STORAGE_KEY, newThemeName);
      setIsDark(true);
      localStorage.setItem(MODE_STORAGE_KEY, 'dark');
    }
  }, [themeName]);

  useEffect(() => {
    applyTheme(theme);
    setIsDark(theme.mode === 'dark');
  }, [theme, applyTheme]);

  useEffect(() => {
    applyMode(isDark);
  }, [isDark, applyMode]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      // Only update if user hasn't manually set a preference
      if (localStorage.getItem(MODE_STORAGE_KEY) === null) {
        if (e.matches) {
          setThemeName('nocturne');
          setIsDark(true);
        } else {
          setThemeName('nocturne-day');
          setIsDark(false);
        }
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const value: ThemeContextValue = {
    theme,
    themeName,
    setTheme,
    isDark,
    toggleMode,
    availableThemes,
    toggleTheme: toggleMode,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function useThemeColors() {
  const { theme } = useTheme();
  return theme;
}

export default ThemeContext;
