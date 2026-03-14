/**
 * AdminGuard Component Tests
 *
 * Tests admin-only route protection:
 * - Loading state shows fallback
 * - Unauthenticated users redirected to /landing
 * - Non-admin users see Access Denied
 * - Admin users see children
 * - Custom redirectTo overrides Access Denied with redirect
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminGuard } from './AdminGuard';

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('@/_core/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock wouter Redirect
vi.mock('wouter', () => ({
  Redirect: ({ to }: { to: string }) => (
    <div data-testid="redirect" data-to={to} />
  ),
}));

// Mock page-loader
vi.mock('@/components/ui/page-loader', () => ({
  PageLoader: ({ message }: { message?: string }) => (
    <div data-testid="page-loader">{message || 'Loading...'}</div>
  ),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  ShieldX: () => <div data-testid="icon-shield-x" />,
}));

describe('AdminGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading fallback while auth is checking', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, loading: true });

    render(
      <AdminGuard>
        <div data-testid="admin-content">Admin Panel</div>
      </AdminGuard>
    );

    expect(screen.getByTestId('page-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
  });

  it('should redirect unauthenticated users to /landing', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, loading: false });

    render(
      <AdminGuard>
        <div data-testid="admin-content">Admin Panel</div>
      </AdminGuard>
    );

    expect(screen.getByTestId('redirect')).toBeInTheDocument();
    expect(screen.getByTestId('redirect').getAttribute('data-to')).toBe('/landing');
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
  });

  it('should show Access Denied for non-admin users', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, role: 'user' },
      isAuthenticated: true,
      loading: false,
    });

    render(
      <AdminGuard>
        <div data-testid="admin-content">Admin Panel</div>
      </AdminGuard>
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText(/do not have permission/i)).toBeInTheDocument();
    expect(screen.getByText('Back to Home')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
  });

  it('should render children for admin users', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, role: 'admin' },
      isAuthenticated: true,
      loading: false,
    });

    render(
      <AdminGuard>
        <div data-testid="admin-content">Admin Panel</div>
      </AdminGuard>
    );

    expect(screen.getByTestId('admin-content')).toBeInTheDocument();
    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
  });

  it('should redirect non-admin to custom path when redirectTo is set', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, role: 'user' },
      isAuthenticated: true,
      loading: false,
    });

    render(
      <AdminGuard redirectTo="/home">
        <div>Admin Panel</div>
      </AdminGuard>
    );

    expect(screen.getByTestId('redirect')).toBeInTheDocument();
    expect(screen.getByTestId('redirect').getAttribute('data-to')).toBe('/home');
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
  });

  it('should use custom fallback when loading', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, loading: true });

    render(
      <AdminGuard fallback={<div data-testid="custom-fallback">Checking...</div>}>
        <div>Admin Panel</div>
      </AdminGuard>
    );

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('page-loader')).not.toBeInTheDocument();
  });

  it('should show loading message about permissions', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, loading: true });

    render(
      <AdminGuard>
        <div>Admin Panel</div>
      </AdminGuard>
    );

    expect(screen.getByText('Verifying permissions...')).toBeInTheDocument();
  });
});
