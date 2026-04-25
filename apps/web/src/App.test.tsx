/**
 * Route Inventory Test — App.tsx + AuthenticatedShell.tsx
 *
 * Verifies every route exists with its correct guard composition.
 * Acts as a migration safety net: if a route is lost, renamed,
 * or assigned the wrong guard during a router swap, this catches it.
 *
 * NOT testing guard behavior (86 guard tests cover that).
 * NOT testing page rendering (page-level tests cover that).
 * ONLY testing: "path X exists and is wrapped by guards Y, Z".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';

// ─── Hoisted helpers (available inside vi.mock factories) ────────────────────

const { mockPage } = vi.hoisted(() => ({
  mockPage: (name: string) => () => <div data-testid={`page:${name}`} />,
}));

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/_core/hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    loading: false,
    user: { role: 'admin', email: 'test@test.com' },
  }),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      me: {
        useQuery: () => ({ data: { email: 'test@test.com', role: 'admin' } }),
      },
    },
    useUtils: () => ({}),
  },
}));

vi.mock('@/lib/auth', () => ({
  scheduleProactiveRefresh: vi.fn(),
  cancelProactiveRefresh: vi.fn(),
}));

// Mock react-router-dom — render all routes with data attributes for inspection
vi.mock('react-router-dom', () => ({
  Route: ({ path, element, children }: any) => {
    // Layout routes have element + children but no path
    if (!path && element && children) {
      return <div data-testid="layout-route">{element}{children}</div>;
    }
    return (
      <div data-testid={`route:${path || '*'}`} data-path={path || '*'}>
        {element}
      </div>
    );
  },
  Routes: ({ children }: any) => <div data-testid="switch">{children}</div>,
  Navigate: ({ to }: any) => <div data-testid="redirect" data-to={to} />,
  BrowserRouter: ({ children }: any) => <div>{children}</div>,
  Outlet: () => <div data-testid="outlet" />,
  useLocation: () => ({ pathname: '/', hash: '' }),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(''), vi.fn()],
  useParams: () => ({}),
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

// Mock guards — render children but mark themselves with data attributes
vi.mock('./routes', () => ({
  RootRedirect: () => <div data-testid="root-redirect" />,
  AuthGuard: ({ children }: any) => (
    <div data-testid="guard:auth">{children}</div>
  ),
  GuestGuard: ({ children, redirectTo }: any) => (
    <div data-testid="guard:guest" data-redirect={redirectTo}>{children}</div>
  ),
  MasterKeyGuard: ({ children }: any) => (
    <div data-testid="guard:masterkey">{children}</div>
  ),
}));

vi.mock('@/routes', () => ({
  RootRedirect: () => <div data-testid="root-redirect" />,
  AuthGuard: ({ children }: any) => (
    <div data-testid="guard:auth">{children}</div>
  ),
  GuestGuard: ({ children, redirectTo }: any) => (
    <div data-testid="guard:guest" data-redirect={redirectTo}>{children}</div>
  ),
  MasterKeyGuard: ({ children }: any) => (
    <div data-testid="guard:masterkey">{children}</div>
  ),
}));

// Mock error boundaries — pass through children
vi.mock('./components/ErrorBoundary', () => ({
  default: ({ children }: any) => <div data-testid="error-boundary">{children}</div>,
}));

vi.mock('./components/RouteErrorBoundary', () => ({
  RouteErrorBoundary: ({ children, routeName }: any) => (
    <div data-testid={`error-boundary:${routeName}`}>{children}</div>
  ),
}));

vi.mock('./components/p2p/P2PErrorBoundary', () => ({
  P2PErrorBoundary: ({ children }: any) => (
    <div data-testid="error-boundary:p2p">{children}</div>
  ),
}));

// Mock DashboardLayout
vi.mock('./components/DashboardLayout', () => ({
  default: ({ children }: any) => (
    <div data-testid="dashboard-layout">{children}</div>
  ),
}));

vi.mock('./components/ContentSpinner', () => ({
  ContentSpinner: () => <div data-testid="content-spinner" />,
}));

// Mock all pages — render data-testid markers

vi.mock('./pages/LoginV2', () => ({ default: mockPage('login') }));
vi.mock('./pages/RegisterV2', () => ({ default: mockPage('register') }));
vi.mock('./pages/SharedDownload', () => ({ default: mockPage('shared-download') }));
vi.mock('./pages/SendPage', () => ({ default: mockPage('send') }));
vi.mock('./pages/ReceivePage', () => ({ default: mockPage('receive') }));
vi.mock('./pages/LocalSendPage', () => ({ default: mockPage('local-send') }));
vi.mock('./pages/TermsOfService', () => ({ default: mockPage('terms') }));
vi.mock('./pages/PrivacyPolicy', () => ({ default: mockPage('privacy') }));
vi.mock('./pages/ForgotPasswordV2', () => ({ default: mockPage('forgot-password') }));
vi.mock('./pages/ResetPasswordV2', () => ({ default: mockPage('reset-password') }));
vi.mock('./pages/VerifyMagicLink', () => ({ default: mockPage('verify-magic-link') }));
vi.mock('./pages/VerifyEmail', () => ({ default: mockPage('verify-email') }));
vi.mock('./pages/VerifyDevice', () => ({ default: mockPage('verify-device') }));
vi.mock('./pages/ShamirRecovery', () => ({ default: mockPage('shamir-recovery') }));
vi.mock('./pages/EncryptionSetup', () => ({ default: mockPage('encryption-setup') }));
vi.mock('./pages/PasskeyNudge', () => ({ default: mockPage('passkey-nudge') }));
vi.mock('./pages/TrustedCircleNudge', () => ({ default: mockPage('trusted-circle-nudge') }));
vi.mock('./pages/AcceptInvitePage', () => ({ default: mockPage('accept-invite') }));
vi.mock('./pages/RecoveryCodeReset', () => ({ default: mockPage('recovery-code-reset') }));
vi.mock('./pages/NotFound', () => ({ default: mockPage('not-found') }));
vi.mock('./pages/Home', () => ({ default: mockPage('home') }));
vi.mock('./pages/Drive', () => ({ default: mockPage('drive') }));
vi.mock('./pages/Chat', () => ({ default: mockPage('chat') }));
vi.mock('./pages/Settings', () => ({ default: mockPage('settings') }));
vi.mock('./pages/QuantumMesh', () => ({ default: mockPage('quantum-mesh') }));
vi.mock('./pages/SendHistory', () => ({ default: mockPage('send-history') }));
vi.mock('./pages/OrgManagementPage', () => ({ default: mockPage('org-management') }));

// Mock P2P components
vi.mock('./components/p2p/P2PReceivePage', () => ({
  P2PReceivePage: mockPage('p2p-receive'),
}));
vi.mock('./components/p2p/OfflineReceivePage', () => ({
  OfflineReceivePage: mockPage('offline-receive'),
}));

// Mock providers
vi.mock('@/contexts/ThemeContext', () => ({
  ThemeProvider: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('./contexts/InterfaceContext', () => ({
  InterfaceProvider: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('./contexts/OrganizationContext', () => ({
  OrganizationProvider: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('./components/email-verification', () => ({
  EmailVerificationProvider: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => <div data-testid="toaster" />,
}));
vi.mock('@stenvault/shared/ui/tooltip', () => ({
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('@/lib/routePrefetch', () => ({
  prefetchCoreRoutes: vi.fn(),
  prefetchRoute: vi.fn(),
}));
vi.mock('./components/PublicLayout', () => ({
  PublicLayout: ({ children }: any) => <div data-testid="public-layout">{children}</div>,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRoute(container: HTMLElement, path: string) {
  return container.querySelector(`[data-path="${path}"]`);
}

function hasGuard(routeEl: Element, guard: string): boolean {
  return routeEl.querySelector(`[data-testid="guard:${guard}"]`) !== null;
}

function hasErrorBoundary(routeEl: Element, name?: string): boolean {
  if (name) {
    return routeEl.querySelector(`[data-testid="error-boundary:${name}"]`) !== null;
  }
  return routeEl.querySelector('[data-testid^="error-boundary:"]') !== null;
}

function hasPage(routeEl: Element, page: string): boolean {
  return routeEl.querySelector(`[data-testid="page:${page}"]`) !== null;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

import App from './App';

describe('Route Inventory', () => {
  let container: HTMLElement;

  beforeEach(async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<App />);
    });
    // Flush lazy component resolution (React.lazy needs extra microtask cycles)
    await act(async () => {});
    container = result!.container;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOT
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Root route', () => {
    it('/ renders RootRedirect', () => {
      const route = screen.getByTestId('route:/');
      expect(route).toBeTruthy();
      expect(within(route).getByTestId('root-redirect')).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GUEST-ONLY ROUTES (GuestGuard)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Guest-only routes (GuestGuard → redirect /home)', () => {
    const guestRoutes = [
      { path: '/auth/login', page: 'login' },
      { path: '/auth/register', page: 'register' },
      { path: '/auth/forgot-password', page: 'forgot-password' },
      { path: '/auth/reset-password', page: 'reset-password' },
    ];

    it.each(guestRoutes)('$path is guest-guarded and renders correct page', ({ path, page }) => {
      const route = getRoute(container, path);
      expect(route).toBeTruthy();
      expect(hasGuard(route!, 'guest')).toBe(true);
      expect(hasPage(route!, page)).toBe(true);
    });

    it.each(guestRoutes)('$path GuestGuard redirects to /home', ({ path }) => {
      const route = getRoute(container, path);
      const guard = route!.querySelector('[data-testid="guard:guest"]');
      expect(guard?.getAttribute('data-redirect')).toBe('/home');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH ROUTES (public, no guard)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Auth routes without GuestGuard', () => {
    const publicAuthRoutes = [
      { path: '/auth/verify', page: 'verify-magic-link' },
      { path: '/auth/verify-email', page: 'verify-email' },
      { path: '/auth/verify-device', page: 'verify-device' },
    ];

    it.each(publicAuthRoutes)('$path is public (no guard) and renders correct page', ({ path, page }) => {
      const route = getRoute(container, path);
      expect(route).toBeTruthy();
      expect(hasGuard(route!, 'guest')).toBe(false);
      expect(hasGuard(route!, 'auth')).toBe(false);
      expect(hasPage(route!, page)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOVERY CODE RESET (AuthGuard only — endpoints require ctx.user)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Recovery Code Reset route', () => {
    it('/auth/recovery-code-reset has AuthGuard (validateRecoveryCode needs JWT to scope per user)', () => {
      const route = getRoute(container, '/auth/recovery-code-reset');
      expect(route).toBeTruthy();
      expect(hasGuard(route!, 'auth')).toBe(true);
      expect(hasGuard(route!, 'guest')).toBe(false);
      expect(hasPage(route!, 'recovery-code-reset')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC ROUTES (no auth required, with error boundaries)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Public routes with RouteErrorBoundary', () => {
    const publicRoutes = [
      { path: '/s/:shareCode', page: 'shared-download', boundary: 'Shared Download' },
      { path: '/recover', page: 'shamir-recovery', boundary: 'Recovery' },
      { path: '/send', page: 'send', boundary: 'Send' },
      { path: '/send/local', page: 'local-send', boundary: 'Local Send' },
      { path: '/send/:sessionId', page: 'receive', boundary: 'Receive' },
      { path: '/terms', page: 'terms', boundary: 'Terms of Service' },
      { path: '/privacy', page: 'privacy', boundary: 'Privacy Policy' },
    ];

    it.each(publicRoutes)(
      '$path is public, has "$boundary" error boundary, renders correct page',
      ({ path, page, boundary }) => {
        const route = getRoute(container, path);
        expect(route).toBeTruthy();
        expect(hasGuard(route!, 'auth')).toBe(false);
        expect(hasGuard(route!, 'guest')).toBe(false);
        expect(hasErrorBoundary(route!, boundary)).toBe(true);
        expect(hasPage(route!, page)).toBe(true);
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ENCRYPTION SETUP (AuthGuard only, NO MasterKeyGuard, NO DashboardLayout)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Encryption Setup route', () => {
    it('/auth/encryption-setup has AuthGuard but NOT MasterKeyGuard or DashboardLayout', () => {
      const route = getRoute(container, '/auth/encryption-setup');
      expect(route).toBeTruthy();
      expect(hasGuard(route!, 'auth')).toBe(true);
      expect(hasGuard(route!, 'masterkey')).toBe(false);
      expect(route!.querySelector('[data-testid="dashboard-layout"]')).toBeNull();
      expect(hasPage(route!, 'encryption-setup')).toBe(true);
      expect(hasErrorBoundary(route!, 'Encryption Setup')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PASSKEY NUDGE (AuthGuard only, NO MasterKeyGuard, NO DashboardLayout)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Passkey Nudge route', () => {
    it('/auth/passkey-setup has AuthGuard but NOT MasterKeyGuard or DashboardLayout', () => {
      const route = getRoute(container, '/auth/passkey-setup');
      expect(route).toBeTruthy();
      expect(hasGuard(route!, 'auth')).toBe(true);
      expect(hasGuard(route!, 'masterkey')).toBe(false);
      expect(route!.querySelector('[data-testid="dashboard-layout"]')).toBeNull();
      expect(hasPage(route!, 'passkey-nudge')).toBe(true);
      expect(hasErrorBoundary(route!, 'Passkey Setup')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TRUSTED CIRCLE NUDGE (AuthGuard only, NO MasterKeyGuard, NO DashboardLayout)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Trusted Circle Nudge route', () => {
    it('/auth/trusted-circle-nudge has AuthGuard but NOT MasterKeyGuard or DashboardLayout', () => {
      const route = getRoute(container, '/auth/trusted-circle-nudge');
      expect(route).toBeTruthy();
      expect(hasGuard(route!, 'auth')).toBe(true);
      expect(hasGuard(route!, 'masterkey')).toBe(false);
      expect(route!.querySelector('[data-testid="dashboard-layout"]')).toBeNull();
      expect(hasPage(route!, 'trusted-circle-nudge')).toBe(true);
      expect(hasErrorBoundary(route!, 'Trusted Circle Nudge')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCEPT INVITE (AuthGuard only, NO MasterKeyGuard, NO DashboardLayout)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Accept Invite route', () => {
    it('/invite/:code has AuthGuard but NOT MasterKeyGuard or DashboardLayout', () => {
      const route = getRoute(container, '/invite/:code');
      expect(route).toBeTruthy();
      expect(hasGuard(route!, 'auth')).toBe(true);
      expect(hasGuard(route!, 'masterkey')).toBe(false);
      expect(route!.querySelector('[data-testid="dashboard-layout"]')).toBeNull();
      expect(hasPage(route!, 'accept-invite')).toBe(true);
      expect(hasErrorBoundary(route!, 'Accept Invite')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P2P ROUTES (public, P2PErrorBoundary)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('P2P public routes', () => {
    it('/p2p/offline/:sessionId has P2PErrorBoundary, no auth guard', () => {
      const route = getRoute(container, '/p2p/offline/:sessionId');
      expect(route).toBeTruthy();
      expect(hasGuard(route!, 'auth')).toBe(false);
      expect(route!.querySelector('[data-testid="error-boundary:p2p"]')).toBeTruthy();
      expect(hasPage(route!, 'offline-receive')).toBe(true);
    });

    it('/p2p/:sessionId has P2PErrorBoundary, no auth guard', () => {
      const route = getRoute(container, '/p2p/:sessionId');
      expect(route).toBeTruthy();
      expect(hasGuard(route!, 'auth')).toBe(false);
      expect(route!.querySelector('[data-testid="error-boundary:p2p"]')).toBeTruthy();
      expect(hasPage(route!, 'p2p-receive')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 404 ROUTE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('404 route', () => {
    it('/404 renders NotFound', () => {
      const route = getRoute(container, '/404');
      expect(route).toBeTruthy();
      expect(hasPage(route!, 'not-found')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTICATED SHELL (AuthGuard + MasterKeyGuard + DashboardLayout)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AuthenticatedShell — catch-all route', () => {
    let shellRoute: Element;

    beforeEach(() => {
      shellRoute = getRoute(container, '*')!;
    });

    it('catch-all route renders AuthenticatedShell', () => {
      expect(shellRoute).toBeTruthy();
    });

    it('wraps all inner routes with AuthGuard > MasterKeyGuard > DashboardLayout', () => {
      const authGuard = shellRoute.querySelector('[data-testid="guard:auth"]');
      expect(authGuard).toBeTruthy();

      const masterKeyGuard = within(authGuard as HTMLElement).queryByTestId('guard:masterkey');
      expect(masterKeyGuard).toBeTruthy();

      const layout = within(masterKeyGuard as HTMLElement).queryByTestId('dashboard-layout');
      expect(layout).toBeTruthy();
    });

    describe('Protected routes inside shell', () => {
      const protectedRoutes = [
        { path: '/home', page: 'home' },
        { path: '/drive', page: 'drive' },
        { path: '/settings/*', page: 'settings' },
        { path: '/chat', page: 'chat' },
        { path: '/sends', page: 'send-history' },
        { path: '/organization', page: 'org-management' },
      ];

      it.each(protectedRoutes)('$path exists inside the shell', ({ path, page }) => {
        const layout = shellRoute.querySelector('[data-testid="dashboard-layout"]')!;
        const route = layout.querySelector(`[data-path="${path}"]`);
        expect(route).toBeTruthy();
        expect(hasPage(route!, page)).toBe(true);
      });
    });

    describe('Legacy filter redirects (Phase 3, I1) and Dashboard fallback (Phase 11)', () => {
      const redirects = [
        { path: '/dashboard', to: '/home' },
        { path: '/favorites', to: '/drive?filter=favorites' },
        { path: '/trash', to: '/drive?filter=trash' },
        { path: '/shares', to: '/drive?filter=shared' },
      ];

      it.each(redirects)('$path redirects to $to', ({ path, to }) => {
        const layout = shellRoute.querySelector('[data-testid="dashboard-layout"]')!;
        const route = layout.querySelector(`[data-path="${path}"]`);
        expect(route).toBeTruthy();
        const redirect = route!.querySelector('[data-testid="redirect"]');
        expect(redirect).toBeTruthy();
        expect(redirect?.getAttribute('data-to')).toBe(to);
      });
    });

    it('/quantum-mesh is wrapped with P2PErrorBoundary inside the shell', () => {
      const layout = shellRoute.querySelector('[data-testid="dashboard-layout"]')!;
      const route = layout.querySelector('[data-path="/quantum-mesh"]');
      expect(route).toBeTruthy();
      expect(route!.querySelector('[data-testid="error-boundary:p2p"]')).toBeTruthy();
      expect(hasPage(route!, 'quantum-mesh')).toBe(true);
    });

    it('shell has a catch-all NotFound for unmatched protected routes', () => {
      const layout = shellRoute.querySelector('[data-testid="dashboard-layout"]')!;
      // The inner catch-all has no path (renders as data-path="*")
      const innerCatchAll = layout.querySelector('[data-path="*"]');
      // Should either be the inner catch-all or the NotFound component
      expect(
        innerCatchAll || layout.querySelector('[data-testid="page:not-found"]'),
      ).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ROUTE COUNT — catches accidentally added or removed routes
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Route count integrity', () => {
    it('App Router has exactly 22 top-level routes + 1 layout route (including catch-all)', () => {
      const topSwitch = container.querySelector('[data-testid="switch"]');
      const topRoutes = topSwitch?.querySelectorAll(':scope > [data-path]');
      // 21 explicit top-level paths + 1 catch-all (*) = 22
      // (includes /master-key-setup legacy redirect, /auth/passkey-setup nudge,
      //  /auth/trusted-circle-nudge nudge)
      expect(topRoutes?.length).toBe(22);
    });

    it('AuthenticatedShell has exactly 12 inner routes (including catch-all)', () => {
      const shellRoute = getRoute(container, '*')!;
      const layout = shellRoute.querySelector('[data-testid="dashboard-layout"]')!;
      const innerSwitch = layout.querySelector('[data-testid="switch"]');
      const innerRoutes = innerSwitch?.querySelectorAll(':scope > [data-path]');
      // 11 explicit paths + 1 catch-all = 12. /dashboard stays as a
      // redirect to /home; /transfers (Phase 11, I7) is gone.
      expect(innerRoutes?.length).toBe(12);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GUARD COMPOSITION — prevents guard misassignment during migration
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Guard composition correctness', () => {
    it('NO public route accidentally has AuthGuard (except /auth/encryption-setup, /auth/passkey-setup, /auth/recovery-code-reset)', () => {
      const publicPaths = [
        '/s/:shareCode', '/recover',
        '/send', '/send/local', '/send/:sessionId', '/ops-deck',
        '/terms', '/privacy', '/p2p/:sessionId', '/p2p/offline/:sessionId',
        '/auth/verify', '/auth/verify-email',
      ];
      for (const path of publicPaths) {
        const route = getRoute(container, path);
        if (route) {
          expect(hasGuard(route, 'auth')).toBe(false);
        }
      }
    });

    it('NO guest route accidentally has AuthGuard', () => {
      const guestPaths = [
        '/auth/login', '/auth/register',
        '/auth/forgot-password', '/auth/reset-password',
      ];
      for (const path of guestPaths) {
        const route = getRoute(container, path)!;
        expect(hasGuard(route, 'auth')).toBe(false);
        expect(hasGuard(route, 'guest')).toBe(true);
      }
    });

    it('ALL authenticated shell routes inherit AuthGuard + MasterKeyGuard', () => {
      const shellRoute = getRoute(container, '*')!;
      // The shell itself must have both guards
      expect(hasGuard(shellRoute, 'auth')).toBe(true);
      expect(hasGuard(shellRoute, 'masterkey')).toBe(true);
    });

  });
});
