/**
 * InterfaceSettings Component Tests
 *
 * Tests theme selection, interface density, font size, and reset functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterfaceSettings } from './InterfaceSettings';

// Mock contexts
const mockSetTheme = vi.fn();
const mockToggleMode = vi.fn();
const mockSetDensity = vi.fn();
const mockSetFontSize = vi.fn();
const mockResetToDefaults = vi.fn();

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    themeName: 'deep-ocean',
    setTheme: mockSetTheme,
    isDark: true,
    toggleMode: mockToggleMode,
    availableThemes: [
      { name: 'deep-ocean', displayName: 'Deep Ocean', description: 'Dark blue theme' },
      { name: 'forest', displayName: 'Forest', description: 'Dark green theme' },
      { name: 'sunrise', displayName: 'Sunrise', description: 'Light warm theme' },
    ],
  }),
}));

vi.mock('@/contexts/InterfaceContext', () => ({
  useInterface: () => ({
    density: 'comfortable',
    setDensity: mockSetDensity,
    fontSize: 'medium',
    setFontSize: mockSetFontSize,
    resetToDefaults: mockResetToDefaults,
  }),
  DENSITY_LABELS: {
    compact: { label: 'Compact', description: 'Less spacing, more visible content' },
    comfortable: { label: 'Comfortable', description: 'Balanced spacing (default)' },
    spacious: { label: 'Spacious', description: 'More spacing, better readability' },
  },
  FONT_SIZE_LABELS: {
    small: { label: 'Small', description: '14px base' },
    medium: { label: 'Medium', description: '16px base (default)' },
    large: { label: 'Large', description: '18px base' },
    'extra-large': { label: 'Extra Large', description: '20px base' },
  },
}));

vi.mock('@/styles/themes', () => ({
  themes: {
    'deep-ocean': {
      mode: 'dark',
      displayName: 'Deep Ocean',
      background: { base: '#0a1929', surface: '#1e293b' },
      brand: { primary: '#3b82f6', secondary: '#8b5cf6' },
      foreground: { primary: '#f8fafc' },
    },
    'forest': {
      mode: 'dark',
      displayName: 'Forest',
      background: { base: '#0f1419', surface: '#1a2026' },
      brand: { primary: '#10b981', secondary: '#34d399' },
      foreground: { primary: '#f0fdf4' },
    },
    'sunrise': {
      mode: 'light',
      displayName: 'Sunrise',
      background: { base: '#fef3c7', surface: '#ffffff' },
      brand: { primary: '#f59e0b', secondary: '#fbbf24' },
      foreground: { primary: '#78350f' },
    },
  },
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    button: ({ children, onClick, style, className, whileHover, whileTap }: any) => (
      <button onClick={onClick} style={style} className={className}>
        {children}
      </button>
    ),
  },
}));

// Mock lucide icons
vi.mock('lucide-react', () => ({
  Monitor: () => <div data-testid="icon-monitor" />,
  Moon: () => <div data-testid="icon-moon" />,
  Sun: () => <div data-testid="icon-sun" />,
  Palette: () => <div data-testid="icon-palette" />,
  LayoutGrid: () => <div data-testid="icon-layout-grid" />,
  Type: () => <div data-testid="icon-type" />,
  RotateCcw: () => <div data-testid="icon-rotate" />,
  Minus: () => <div data-testid="icon-minus" />,
  Square: () => <div data-testid="icon-square" />,
  Maximize2: () => <div data-testid="icon-maximize" />,
  Check: () => <div data-testid="icon-check" />,
}));

// Mock UI components
vi.mock('@stenvault/shared/ui/aurora-card', () => ({
  AuroraCard: ({ children }: any) => <div data-testid="card">{children}</div>,
}));

vi.mock('@stenvault/shared/ui/button', () => ({
  Button: ({ children, onClick, variant }: any) => (
    <button onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
}));

vi.mock('@stenvault/shared/ui/label', () => ({
  Label: ({ children, htmlFor, className }: any) => (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ),
}));

vi.mock("@stenvault/shared/ui/radio-group", () => ({
  RadioGroup: ({ children, value, onValueChange }: any) => (
    <div data-testid="radio-group" data-value={value} onChange={(e: any) => onValueChange(e.target.value)}>
      {children}
    </div>
  ),
  RadioGroupItem: ({ value, id }: any) => (
    <input type="radio" value={value} id={id} data-testid={`radio-${value}`} />
  ),
}));

vi.mock('@stenvault/shared/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

vi.mock('@stenvault/shared/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: any) => open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div data-testid="dialog-footer">{children}</div>,
  AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
  AlertDialogAction: ({ children, onClick }: any) => <button data-testid="reset-confirm" onClick={onClick}>{children}</button>,
}));

describe('InterfaceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render all setting cards', () => {
      render(<InterfaceSettings />);

      const cards = screen.getAllByTestId('card');
      expect(cards.length).toBeGreaterThanOrEqual(5); // Mode toggle, Theme, Density, Font, Reset
    });

    it('should render appearance mode toggle', () => {
      render(<InterfaceSettings />);

      expect(screen.getByText('Appearance Mode')).toBeInTheDocument();
      expect(screen.getByText(/Dark Mode Active/i)).toBeInTheDocument();
    });

    it('should render theme selector', () => {
      render(<InterfaceSettings />);

      expect(screen.getByText('Choose Theme')).toBeInTheDocument();
    });

    it('should render density selector', () => {
      render(<InterfaceSettings />);

      expect(screen.getByText('Interface Density')).toBeInTheDocument();
    });

    it('should render font size selector', () => {
      render(<InterfaceSettings />);

      expect(screen.getByText('Font Size')).toBeInTheDocument();
    });

    it('should render reset section', () => {
      render(<InterfaceSettings />);

      expect(screen.getByText('Reset Preferences')).toBeInTheDocument();
    });
  });

  describe('Theme Mode Toggle', () => {
    it('should show dark mode indicator', () => {
      render(<InterfaceSettings />);

      const moonIcons = screen.getAllByTestId('icon-moon');
      expect(moonIcons.length).toBeGreaterThan(0);
      expect(screen.getByText(/Dark Mode Active/i)).toBeInTheDocument();
    });

    it('should show current theme name', () => {
      render(<InterfaceSettings />);

      expect(screen.getByText(/Current theme: Deep Ocean/i)).toBeInTheDocument();
    });

    it('should call toggleMode on button click', async () => {
      const user = userEvent.setup();
      render(<InterfaceSettings />);

      const toggleButton = screen.getByText(/Switch to Light/i).closest('button');
      await user.click(toggleButton!);

      expect(mockToggleMode).toHaveBeenCalledTimes(1);
    });
  });

  describe('Theme Selection', () => {
    it('should render dark themes section', () => {
      render(<InterfaceSettings />);

      expect(screen.getByText('Dark Themes')).toBeInTheDocument();
    });

    it('should render light themes section', () => {
      render(<InterfaceSettings />);

      expect(screen.getByText('Light Themes')).toBeInTheDocument();
    });

    it('should display all theme options', () => {
      render(<InterfaceSettings />);

      expect(screen.getByText('Deep Ocean')).toBeInTheDocument();
      expect(screen.getByText('Forest')).toBeInTheDocument();
      expect(screen.getByText('Sunrise')).toBeInTheDocument();
    });

    it('should call setTheme on theme selection', async () => {
      const user = userEvent.setup();
      render(<InterfaceSettings />);

      const forestTheme = screen.getByText('Forest').closest('button');
      await user.click(forestTheme!);

      expect(mockSetTheme).toHaveBeenCalledWith('forest');
    });

    it('should show selected indicator for current theme', () => {
      render(<InterfaceSettings />);

      // Deep Ocean is the current theme
      const checkIcons = screen.getAllByTestId('icon-check');
      expect(checkIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Interface Density', () => {
    it('should render all density options', () => {
      render(<InterfaceSettings />);

      expect(screen.getByText('Compact')).toBeInTheDocument();
      expect(screen.getByText('Comfortable')).toBeInTheDocument();
      expect(screen.getByText('Spacious')).toBeInTheDocument();
    });

    it('should show default badge for comfortable', () => {
      render(<InterfaceSettings />);

      const defaultBadges = screen.getAllByText('Default');
      expect(defaultBadges.length).toBeGreaterThan(0);
    });

    it('should call setDensity on selection', async () => {
      const user = userEvent.setup();
      render(<InterfaceSettings />);

      const compactRadio = screen.getByTestId('radio-compact');
      await user.click(compactRadio);

      expect(mockSetDensity).toHaveBeenCalledWith('compact');
    });

    it('should render density icons', () => {
      render(<InterfaceSettings />);

      expect(screen.getByTestId('icon-minus')).toBeInTheDocument(); // Compact
      expect(screen.getByTestId('icon-square')).toBeInTheDocument(); // Comfortable
      expect(screen.getByTestId('icon-maximize')).toBeInTheDocument(); // Spacious
    });
  });

  describe('Font Size', () => {
    it('should render all font size options', () => {
      render(<InterfaceSettings />);

      expect(screen.getByText('Small')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('Large')).toBeInTheDocument();
      expect(screen.getByText('Extra Large')).toBeInTheDocument();
    });

    it('should show default badge for medium', () => {
      render(<InterfaceSettings />);

      const defaultBadges = screen.getAllByText('Default');
      expect(defaultBadges.length).toBeGreaterThan(0);
    });

    it('should call setFontSize on selection', async () => {
      const user = userEvent.setup();
      render(<InterfaceSettings />);

      const largeRadio = screen.getByTestId('radio-large');
      await user.click(largeRadio);

      expect(mockSetFontSize).toHaveBeenCalledWith('large');
    });

    it('should show Aa preview for all sizes', () => {
      render(<InterfaceSettings />);

      const previews = screen.getAllByText('Aa');
      expect(previews.length).toBe(4); // One for each font size
    });
  });

  describe('Reset Functionality', () => {
    it('should render reset button', () => {
      render(<InterfaceSettings />);

      const resetButton = screen.getByText('Reset').closest('button');
      expect(resetButton).toBeInTheDocument();
    });

    it('should call resetToDefaults on button click after confirmation', async () => {
      const user = userEvent.setup();
      render(<InterfaceSettings />);

      // Click reset opens dialog
      const resetButton = screen.getByText('Reset').closest('button');
      await user.click(resetButton!);

      // Confirm in dialog
      const confirmButton = screen.getByTestId('reset-confirm');
      await user.click(confirmButton);

      expect(mockResetToDefaults).toHaveBeenCalledTimes(1);
    });

    it('should render reset icon', () => {
      render(<InterfaceSettings />);

      expect(screen.getByTestId('icon-rotate')).toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('should handle complete theme customization flow', async () => {
      const user = userEvent.setup();
      render(<InterfaceSettings />);

      // Change theme
      const sunriseTheme = screen.getByText('Sunrise').closest('button');
      await user.click(sunriseTheme!);
      expect(mockSetTheme).toHaveBeenCalledWith('sunrise');

      // Change density
      const spaciousRadio = screen.getByTestId('radio-spacious');
      await user.click(spaciousRadio);
      expect(mockSetDensity).toHaveBeenCalledWith('spacious');

      // Change font size
      const largeRadio = screen.getByTestId('radio-large');
      await user.click(largeRadio);
      expect(mockSetFontSize).toHaveBeenCalledWith('large');

      // Reset — opens dialog, then confirm
      const resetButton = screen.getByText('Reset').closest('button');
      await user.click(resetButton!);
      const confirmButton = screen.getByTestId('reset-confirm');
      await user.click(confirmButton);
      expect(mockResetToDefaults).toHaveBeenCalled();
    });

    it('should render live preview info', () => {
      render(<InterfaceSettings />);

      expect(
        screen.getByText(/Changes are applied instantly/i)
      ).toBeInTheDocument();
    });
  });
});
