/**
 * RootRedirect Component Tests
 *
 * Tests intelligent "/" route handling:
 * - Loading state shows BrandedLoader
 * - Authenticated users redirected to /home
 * - Unauthenticated users redirected to /auth/login
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RootRedirect } from './RootRedirect';

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('@/_core/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock react-router-dom Navigate
vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => (
    <div data-testid="redirect" data-to={to} />
  ),
}));

// Mock page-loader
vi.mock('@/components/ui/page-loader', () => ({
  BrandedLoader: () => <div data-testid="branded-loader">Loading StenVault...</div>,
}));

describe('RootRedirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show BrandedLoader while checking auth', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: true });

    render(<RootRedirect />);

    expect(screen.getByTestId('branded-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).not.toBeInTheDocument();
  });

  it('should redirect authenticated users to /home', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false });

    render(<RootRedirect />);

    expect(screen.getByTestId('redirect')).toBeInTheDocument();
    expect(screen.getByTestId('redirect').getAttribute('data-to')).toBe('/home');
  });

  it('should redirect unauthenticated users to /auth/login', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });

    render(<RootRedirect />);

    expect(screen.getByTestId('redirect')).toBeInTheDocument();
    expect(screen.getByTestId('redirect').getAttribute('data-to')).toBe('/auth/login');
  });

  it('should not redirect while loading even if authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: true });

    render(<RootRedirect />);

    expect(screen.getByTestId('branded-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).not.toBeInTheDocument();
  });
});
