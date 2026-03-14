/**
 * ═══════════════════════════════════════════════════════════════
 * CLOUDVAULT - THEME CONTEXT
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
  // Current theme palette (new multi-theme system)
  theme: ThemePalette;
  themeName: ThemeName;

  // Theme controls
  setTheme: (name: ThemeName) => void;

  // Dark/Light mode (within the current theme)
  isDark: boolean;
  toggleMode: () => void;

  // Available themes
  availableThemes: Array<{ name: ThemeName; displayName: string; description: string }>;

  // Legacy compatibility - theme as 'dark' | 'light' string
  // This is for backwards compatibility with existing components
  toggleTheme: () => void; // Alias for toggleMode
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_STORAGE_KEY = 'cloudvault-theme';
const MODE_STORAGE_KEY = 'cloudvault-mode';

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeName;
}

export function ThemeProvider({ children, defaultTheme = 'nocturne' }: ThemeProviderProps) {
  // Initialize theme from localStorage or default
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored && stored in themes) {
        return stored as ThemeName;
      }
    }
    return defaultTheme;
  });

  // Initialize dark mode from localStorage or system preference
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

  // Get current theme object
  const theme = useMemo(() => getTheme(themeName), [themeName]);

  // Get available themes list
  const availableThemes = useMemo(() => getAvailableThemes(), []);

  // Apply theme to document
  const applyTheme = useCallback((themeToApply: ThemePalette) => {
    const root = document.documentElement;
    const cssVars = themeToCssVariables(themeToApply);

    // Apply CSS variables
    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Apply to main CSS variables that components use
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

    // Set glow effect
    root.style.setProperty('--shadow-glow-sm', `0 0 10px ${themeToApply.effects.glow}`);
    root.style.setProperty('--shadow-glow-md', `0 0 20px ${themeToApply.effects.glow}`);
    root.style.setProperty('--shadow-glow-lg', `0 0 30px ${themeToApply.effects.glowStrong}`);

    // Set data attribute for CSS selectors
    root.setAttribute('data-theme', themeToApply.name);

    // Dynamic Meta Theme Color (for mobile browser bars)
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', themeToApply.background.base);
    }
  }, []);

  // Apply dark/light class
  const applyMode = useCallback((dark: boolean) => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
  }, []);

  // Set theme handler
  const setTheme = useCallback((name: ThemeName) => {
    setThemeName(name);
    localStorage.setItem(THEME_STORAGE_KEY, name);

    // Also update isDark based on new theme's mode
    const newTheme = getTheme(name);
    const newIsDark = newTheme.mode === 'dark';
    setIsDark(newIsDark);
    localStorage.setItem(MODE_STORAGE_KEY, newIsDark ? 'dark' : 'light');
  }, []);

  // Toggle mode handler - switches between dark and light themes
  const toggleMode = useCallback(() => {
    const currentTheme = getTheme(themeName);
    const currentIsDark = currentTheme.mode === 'dark';

    if (currentIsDark) {
      // Switch to light theme - use 'nocturne-day' as default light theme
      const lastLightTheme = localStorage.getItem('cloudvault-last-light-theme') as ThemeName | null;
      const newThemeName = (lastLightTheme && lastLightTheme in themes) ? lastLightTheme : 'nocturne-day';

      // Save current dark theme for later
      localStorage.setItem('cloudvault-last-dark-theme', themeName);

      setThemeName(newThemeName as ThemeName);
      localStorage.setItem(THEME_STORAGE_KEY, newThemeName);
      setIsDark(false);
      localStorage.setItem(MODE_STORAGE_KEY, 'light');
    } else {
      // Switch to dark theme - use 'nocturne' as default dark theme
      const lastDarkTheme = localStorage.getItem('cloudvault-last-dark-theme') as ThemeName | null;
      const newThemeName = (lastDarkTheme && lastDarkTheme in themes) ? lastDarkTheme : 'nocturne';

      // Save current light theme for later
      localStorage.setItem('cloudvault-last-light-theme', themeName);

      setThemeName(newThemeName as ThemeName);
      localStorage.setItem(THEME_STORAGE_KEY, newThemeName);
      setIsDark(true);
      localStorage.setItem(MODE_STORAGE_KEY, 'dark');
    }
  }, [themeName]);

  // Apply theme on mount and when theme changes
  useEffect(() => {
    applyTheme(theme);
    // Also sync isDark with theme mode
    setIsDark(theme.mode === 'dark');
  }, [theme, applyTheme]);

  // Apply mode on mount and when mode changes
  useEffect(() => {
    applyMode(isDark);
  }, [isDark, applyMode]);

  // Listen for system preference changes
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
    toggleTheme: toggleMode, // Legacy compatibility alias
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * Hook to get current theme colors (for inline styles)
 */
export function useThemeColors() {
  const { theme } = useTheme();
  return theme;
}

export default ThemeContext;
