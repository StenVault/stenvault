/**
 * GuestGuard Component Tests
 *
 * Tests guest-only route protection:
 * - Loading state shows fallback
 * - Authenticated users redirected to /home
 * - Unauthenticated users see children
 * - Custom redirectTo and fallback props
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuestGuard } from './GuestGuard';

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
vi.mock('@stenvault/shared/ui/page-loader', () => ({
  PageLoader: () => <div data-testid="page-loader">Loading...</div>,
}));

describe('GuestGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading fallback while auth is checking', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: true });

    render(
      <GuestGuard>
        <div data-testid="guest-content">Login Page</div>
      </GuestGuard>
    );

    expect(screen.getByTestId('page-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('guest-content')).not.toBeInTheDocument();
  });

  it('should redirect authenticated users to /home', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false });

    render(
      <GuestGuard>
        <div data-testid="guest-content">Login Page</div>
      </GuestGuard>
    );

    expect(screen.getByTestId('redirect')).toBeInTheDocument();
    expect(screen.getByTestId('redirect').getAttribute('data-to')).toBe('/home');
    expect(screen.queryByTestId('guest-content')).not.toBeInTheDocument();
  });

  it('should render children when not authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });

    render(
      <GuestGuard>
        <div data-testid="guest-content">Login Page</div>
      </GuestGuard>
    );

    expect(screen.getByTestId('guest-content')).toBeInTheDocument();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).not.toBeInTheDocument();
  });

  it('should use custom redirectTo path', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false });

    render(
      <GuestGuard redirectTo="/dashboard">
        <div>Login Page</div>
      </GuestGuard>
    );

    expect(screen.getByTestId('redirect').getAttribute('data-to')).toBe('/dashboard');
  });

  it('should use custom fallback when loading', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: true });

    render(
      <GuestGuard fallback={<div data-testid="custom-loader">Please wait...</div>}>
        <div>Login Page</div>
      </GuestGuard>
    );

    expect(screen.getByTestId('custom-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('page-loader')).not.toBeInTheDocument();
  });

  it('should not redirect when auth is still loading even if authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: true });

    render(
      <GuestGuard>
        <div data-testid="guest-content">Login Page</div>
      </GuestGuard>
    );

    // Loading takes precedence over auth check
    expect(screen.getByTestId('page-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).not.toBeInTheDocument();
    expect(screen.queryByTestId('guest-content')).not.toBeInTheDocument();
  });
});
