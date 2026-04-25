/**
 * Settings Page Routing Tests
 *
 * Tests URL-synced tab selection and query param behavior:
 * - Tab query param extraction from useSearch
 * - Default tab is "profile" when no param
 * - Stripe success param triggers toast
 * - Mobile redirect to MobileSettings
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Settings from './Settings';

// Mock react-router-dom
let mockSearchString = '';
const mockSetSearchParams = vi.fn();
vi.mock('react-router-dom', () => ({
  useSearchParams: vi.fn(() => [new URLSearchParams(mockSearchString), mockSetSearchParams]),
}));

// Mock sonner
const mockToastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: any[]) => mockToastSuccess(...args),
  },
}));

// Mock useIsMobile
let mockIsMobile = false;
vi.mock('@/hooks/useMobile', () => ({
  useIsMobile: vi.fn(() => mockIsMobile),
}));

// Mock ThemeContext
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: vi.fn(() => ({
    theme: {
      brand: { primary: '#6366F1' },
    },
  })),
}));

// Mock tRPC
vi.mock('@/lib/trpc', () => ({
  trpc: {
    settings: {
      getSystemHealth: {
        useQuery: vi.fn(() => ({ data: null })),
      },
    },
    files: {
      getStorageStats: {
        useQuery: vi.fn(() => ({ data: null, refetch: vi.fn() })),
      },
    },
    stripe: {
      getSubscription: {
        useQuery: vi.fn(() => ({ data: null })),
      },
      isConfigured: {
        useQuery: vi.fn(() => ({ data: null })),
      },
    },
  },
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock UI components
vi.mock('@stenvault/shared/ui/tabs', () => ({
  Tabs: ({ children, value, onValueChange, ...props }: any) => (
    <div data-testid="tabs" data-value={value} {...props}>{children}</div>
  ),
  TabsList: ({ children, ...props }: any) => <div data-testid="tabs-list" {...props}>{children}</div>,
  TabsTrigger: ({ children, value, ...props }: any) => (
    <button data-testid={`tab-${value}`} data-value={value} {...props}>{children}</button>
  ),
  TabsContent: ({ children, value, ...props }: any) => (
    <div data-testid={`tab-content-${value}`} data-value={value} {...props}>{children}</div>
  ),
}));

vi.mock('@stenvault/shared/ui/aurora-card', () => ({
  AuroraCard: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  AuroraCardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('@stenvault/shared/ui/animated', () => ({
  FadeIn: ({ children }: any) => <>{children}</>,
}));

// Mock all settings sub-components
vi.mock('@/components/settings/ProfileSettings', () => ({
  ProfileSettings: () => <div data-testid="profile-settings">Profile</div>,
}));
vi.mock('@/components/settings/SubscriptionSettings', () => ({
  SubscriptionSettings: () => <div data-testid="subscription-settings">Subscription</div>,
}));
vi.mock('@/components/settings/SecuritySettings', () => ({
  SecuritySettings: () => <div data-testid="security-settings">Security</div>,
}));
vi.mock('@/components/settings/InterfaceSettings', () => ({
  InterfaceSettings: () => <div data-testid="interface-settings">Interface</div>,
}));
vi.mock('@/components/settings/StorageSettings', () => ({
  StorageSettings: () => <div data-testid="storage-settings">Storage</div>,
}));
vi.mock('@/components/settings/SystemSettings', () => ({
  SystemSettings: () => <div data-testid="system-settings">System</div>,
}));
vi.mock('@/components/settings/TrustedDevicesSettings', () => ({
  TrustedDevicesSettings: () => <div data-testid="devices-settings">Devices</div>,
}));
vi.mock('@/components/settings/OrganizationSettings', () => ({
  OrganizationSettings: () => <div data-testid="org-settings">Orgs</div>,
}));
vi.mock('@/components/mobile-v2/pages/MobileSettings', () => ({
  MobileSettings: () => <div data-testid="mobile-settings">Mobile Settings</div>,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Activity: () => <span />,
  Building2: () => <span />,
  CreditCard: () => <span />,
  HardDrive: () => <span />,
  Monitor: () => <span />,
  ShieldCheck: () => <span />,
  Smartphone: () => <span />,
  User: () => <span />,
  Settings: () => <span />,
}));

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchString = '';
    mockIsMobile = false;

    mockSetSearchParams.mockClear();
  });

  describe('Tab query param extraction', () => {
    it('should default to profile tab when no query param', () => {
      mockSearchString = '';

      render(<Settings />);

      const tabs = screen.getByTestId('tabs');
      expect(tabs.getAttribute('data-value')).toBe('profile');
    });

    it('should select security tab from query param', () => {
      mockSearchString = 'tab=security';

      render(<Settings />);

      const tabs = screen.getByTestId('tabs');
      expect(tabs.getAttribute('data-value')).toBe('security');
    });

    it('should select devices tab from query param', () => {
      mockSearchString = 'tab=devices';

      render(<Settings />);

      const tabs = screen.getByTestId('tabs');
      expect(tabs.getAttribute('data-value')).toBe('devices');
    });

    it('should select interface tab from query param', () => {
      mockSearchString = 'tab=interface';

      render(<Settings />);

      const tabs = screen.getByTestId('tabs');
      expect(tabs.getAttribute('data-value')).toBe('interface');
    });

    it('should handle tab with other query params', () => {
      mockSearchString = 'foo=bar&tab=storage&baz=qux';

      render(<Settings />);

      const tabs = screen.getByTestId('tabs');
      expect(tabs.getAttribute('data-value')).toBe('storage');
    });
  });

  describe('Stripe success param', () => {
    it('should show success toast when success=true', () => {
      mockSearchString = 'success=true';

      render(<Settings />);

      expect(mockToastSuccess).toHaveBeenCalledWith('Subscription activated!');
    });

    it('should clear success param from URL after toast', () => {
      mockSearchString = 'success=true';

      render(<Settings />);

      expect(mockSetSearchParams).toHaveBeenCalled();
    });

    it('should not show toast when success is not true', () => {
      mockSearchString = 'success=false';

      render(<Settings />);

      expect(mockToastSuccess).not.toHaveBeenCalled();
    });

    it('should not show toast without success param', () => {
      mockSearchString = 'tab=profile';

      render(<Settings />);

      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  describe('Mobile redirect', () => {
    it('should render MobileSettings on mobile', () => {
      mockIsMobile = true;

      render(<Settings />);

      expect(screen.getByTestId('mobile-settings')).toBeInTheDocument();
      expect(screen.queryByTestId('tabs')).not.toBeInTheDocument();
    });

    it('should render desktop tabs on desktop', () => {
      mockIsMobile = false;

      render(<Settings />);

      expect(screen.getByTestId('tabs')).toBeInTheDocument();
      expect(screen.queryByTestId('mobile-settings')).not.toBeInTheDocument();
    });
  });

  describe('Tab triggers', () => {
    it('should render all standard tabs', () => {
      render(<Settings />);

      expect(screen.getByTestId('tab-profile')).toBeInTheDocument();
      expect(screen.getByTestId('tab-security')).toBeInTheDocument();
      expect(screen.getByTestId('tab-interface')).toBeInTheDocument();
      expect(screen.getByTestId('tab-storage')).toBeInTheDocument();
      expect(screen.getByTestId('tab-system')).toBeInTheDocument();
      expect(screen.getByTestId('tab-devices')).toBeInTheDocument();
      expect(screen.getByTestId('tab-organizations')).toBeInTheDocument();
    });
  });
});
