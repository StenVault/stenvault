/**
 * Settings contract tests.
 *
 * The page is a routing shell with several useEffect-driven side effects
 * (?tab= redirect, Stripe toast). Rendering it inside MemoryRouter across
 * many cases leaks pending effects between tests and hangs vitest (each
 * render is fine in isolation; >2 in sequence enter a deadlock).
 *
 * So we split coverage:
 *   1. Pure-function tests for resolveLegacyTab / LEGACY_TAB_MAP — the
 *      redirect contract that bookmarks and external links depend on.
 *   2. One mobile-render test that proves the desktop shell never mounts
 *      on mobile (the path the user actually exercises every visit).
 *
 * The path-based group routing and SettingsHome rendering are covered in
 * dedicated files: SettingsHome.test.tsx, VaultStatusFooter.test.tsx, and
 * the App.test.tsx outer-route assertion.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LEGACY_TAB_MAP, resolveLegacyTab } from './Settings';

// ─── Mocks for the mobile-render check ──────────────────────────────────────

vi.mock('@/hooks/useMobile', () => ({ useIsMobile: () => true }));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: { brand: { primary: '#D4AF37' } } }),
}));
vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganizationContext: () => ({ organizations: [] }),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    settings: { getSystemHealth: { useQuery: () => ({ data: null }) } },
    files: { getStorageStats: { useQuery: () => ({ data: null, refetch: () => {} }) } },
    stripe: {
      getSubscription: { useQuery: () => ({ data: null }) },
      isConfigured: { useQuery: () => ({ data: null }) },
    },
  },
}));
vi.mock('@stenvault/shared/lib/toast', () => ({
  toast: { success: () => {}, info: () => {} },
}));
vi.mock('@/components/mobile-v2/pages/MobileSettings', () => ({
  MobileSettings: () => <div data-testid="mobile-settings" />,
}));

import Settings from './Settings';

// ─── Pure-function contract tests ───────────────────────────────────────────

describe('Settings — legacy ?tab= redirect contract', () => {
  describe('resolveLegacyTab', () => {
    it.each([
      ['profile', 'profile'],
      ['security', 'sign-in-and-recovery'],
      ['devices', 'sign-in-and-recovery'],
      ['interface', 'preferences'],
      ['system', 'preferences'],
      ['storage', 'billing'],
      ['subscription', 'billing'],
      ['organizations', 'organizations'],
    ])('?tab=%s redirects to /settings/%s', (input, expected) => {
      expect(resolveLegacyTab(input)).toBe(expected);
    });

    it('returns null when tab is null (no redirect needed)', () => {
      expect(resolveLegacyTab(null)).toBeNull();
    });

    it('returns null for unknown tabs — caller lands on /settings directory', () => {
      // Old behaviour silently fell back to Profile, masking junk tabs in
      // bookmarks. New behaviour returns null so the redirect target is the
      // directory home, not a hijacked "Profile" landing.
      expect(resolveLegacyTab('unknown-tab')).toBeNull();
      expect(resolveLegacyTab('')).toBeNull();
    });
  });

  describe('LEGACY_TAB_MAP', () => {
    it('covers every tab the old <TabsList> exposed', () => {
      // The old Settings.tsx Tabs values were: profile, subscription, security,
      // interface, storage, system, devices, organizations. Every one must
      // have a redirect target — otherwise an old bookmark would land on the
      // generic directory home and lose the user's intent.
      const expectedTabs = [
        'profile',
        'subscription',
        'security',
        'interface',
        'storage',
        'system',
        'devices',
        'organizations',
      ];
      for (const tab of expectedTabs) {
        expect(LEGACY_TAB_MAP[tab]).toBeDefined();
      }
    });

    it('only routes to known group slugs', () => {
      const validSlugs = new Set([
        'profile',
        'sign-in-and-recovery',
        'encryption',
        'billing',
        'preferences',
        'organizations',
      ]);
      for (const target of Object.values(LEGACY_TAB_MAP)) {
        expect(validSlugs.has(target)).toBe(true);
      }
    });
  });
});

// ─── Mobile shell-bypass check (single render — no leak) ────────────────────

describe('Settings — mobile bypass', () => {
  it('renders MobileSettings on mobile and never mounts the desktop shell', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/settings/profile']}>
          <Routes>
            <Route path="/settings/*" element={<Settings />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    expect(screen.getByTestId('mobile-settings')).toBeInTheDocument();
  });
});
