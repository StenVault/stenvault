/**
 * MasterKeyGuard Component Tests
 *
 * Tests master key configuration guard:
 * - Loading state shows AuthLoader
 * - Not configured redirects to /master-key-setup
 * - Configured renders children
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MasterKeyGuard } from './MasterKeyGuard';

// Mock useMasterKey
const mockUseMasterKey = vi.fn();
vi.mock('@/hooks/useMasterKey', () => ({
  useMasterKey: () => mockUseMasterKey(),
}));

// Mock react-router-dom Navigate
vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => (
    <div data-testid="redirect" data-to={to} />
  ),
}));

// Mock page-loader
vi.mock('@/components/ui/page-loader', () => ({
  AuthLoader: () => <div data-testid="auth-loader">Loading encryption...</div>,
}));

describe('MasterKeyGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show AuthLoader while loading encryption config', () => {
    mockUseMasterKey.mockReturnValue({ isConfigured: false, isLoading: true });

    render(
      <MasterKeyGuard>
        <div data-testid="protected">Protected Content</div>
      </MasterKeyGuard>
    );

    expect(screen.getByTestId('auth-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('should redirect to /master-key-setup when not configured', () => {
    mockUseMasterKey.mockReturnValue({ isConfigured: false, isLoading: false });

    render(
      <MasterKeyGuard>
        <div data-testid="protected">Protected Content</div>
      </MasterKeyGuard>
    );

    expect(screen.getByTestId('redirect')).toBeInTheDocument();
    expect(screen.getByTestId('redirect').getAttribute('data-to')).toBe('/master-key-setup');
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('should render children when master key is configured', () => {
    mockUseMasterKey.mockReturnValue({ isConfigured: true, isLoading: false });

    render(
      <MasterKeyGuard>
        <div data-testid="protected">Protected Content</div>
      </MasterKeyGuard>
    );

    expect(screen.getByTestId('protected')).toBeInTheDocument();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).not.toBeInTheDocument();
    expect(screen.queryByTestId('auth-loader')).not.toBeInTheDocument();
  });

  it('should not render children while still loading even if configured', () => {
    mockUseMasterKey.mockReturnValue({ isConfigured: true, isLoading: true });

    render(
      <MasterKeyGuard>
        <div data-testid="protected">Protected Content</div>
      </MasterKeyGuard>
    );

    // Loading takes precedence
    expect(screen.getByTestId('auth-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });
});
