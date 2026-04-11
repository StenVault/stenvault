/**
 * AuthGuard Component Tests
 *
 * Tests authentication-based route protection:
 * - Loading state shows fallback
 * - Unauthenticated users redirected to /auth/login
 * - Authenticated users see children
 * - Custom redirectTo and fallback props
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthGuard } from './AuthGuard';

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('@/_core/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock react-router-dom Navigate
const mockRedirectTo = vi.fn();
vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => {
    mockRedirectTo(to);
    return <div data-testid="redirect" data-to={to} />;
  },
}));

// Mock page-loader
vi.mock('@/components/ui/page-loader', () => ({
  AuthLoader: () => <div data-testid="auth-loader">Loading...</div>,
}));

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading fallback while auth is checking', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: true });

    render(
      <AuthGuard>
        <div data-testid="protected">Protected Content</div>
      </AuthGuard>
    );

    expect(screen.getByTestId('auth-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('should redirect unauthenticated users to /auth/login', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });

    render(
      <AuthGuard>
        <div data-testid="protected">Protected Content</div>
      </AuthGuard>
    );

    expect(screen.getByTestId('redirect')).toBeInTheDocument();
    expect(screen.getByTestId('redirect').getAttribute('data-to')).toBe('/auth/login');
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('should render children when authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false });

    render(
      <AuthGuard>
        <div data-testid="protected">Protected Content</div>
      </AuthGuard>
    );

    expect(screen.getByTestId('protected')).toBeInTheDocument();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).not.toBeInTheDocument();
  });

  it('should use custom redirectTo path', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });

    render(
      <AuthGuard redirectTo="/login">
        <div>Protected</div>
      </AuthGuard>
    );

    expect(screen.getByTestId('redirect').getAttribute('data-to')).toBe('/login');
  });

  it('should use custom fallback when loading', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: true });

    render(
      <AuthGuard fallback={<div data-testid="custom-loader">Custom Loading</div>}>
        <div>Protected</div>
      </AuthGuard>
    );

    expect(screen.getByTestId('custom-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-loader')).not.toBeInTheDocument();
  });
});
