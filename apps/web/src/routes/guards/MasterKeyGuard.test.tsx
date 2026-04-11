/**
 * MasterKeyGuard Component Tests
 *
 * Tests master key configuration guard:
 * - Loading state shows AuthLoader
 * - Not configured redirects to /master-key-setup
 * - Configured renders children
 * - Device verification required shows modal
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MasterKeyGuard } from './MasterKeyGuard';

// Mock useMasterKey
const mockUseMasterKey = vi.fn();
vi.mock('@/hooks/useMasterKey', () => ({
  useMasterKey: () => mockUseMasterKey(),
}));

// Mock useAuth
const mockUser = { id: 1, email: 'test@test.com', emailVerified: new Date() };
vi.mock('@/_core/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, logout: vi.fn() }),
}));

// Mock useDeviceVerification
vi.mock('@/hooks/useDeviceVerification', () => ({
  useDeviceVerification: () => ({
    isLoading: false,
    cooldown: 0,
    verifyWithOTP: vi.fn(),
    resendEmail: vi.fn(),
  }),
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => (
    <div data-testid="redirect" data-to={to} />
  ),
  useNavigate: () => vi.fn(),
}));

// Mock page-loader
vi.mock('@/components/ui/page-loader', () => ({
  AuthLoader: () => <div data-testid="auth-loader">Loading encryption...</div>,
}));

// Mock DeviceVerificationModal
vi.mock('@/components/device-verification/DeviceVerificationModal', () => ({
  DeviceVerificationModal: () => <div data-testid="device-verification-modal">Device Verification</div>,
}));

// Mock useEmailVerificationContext
vi.mock('@/components/email-verification', () => ({
  useEmailVerificationContext: () => ({
    isModalOpen: false,
    isLoading: false,
    cooldown: 0,
    verifyWithOTP: vi.fn(),
    resendEmail: vi.fn(),
    handleError: vi.fn(),
    isEmailNotVerifiedError: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    setIsModalOpen: vi.fn(),
  }),
}));

// Mock EmailVerificationModal
vi.mock('@/components/email-verification/EmailVerificationModal', () => ({
  EmailVerificationModal: () => <div data-testid="email-verification-modal">Email Verification</div>,
}));

describe('MasterKeyGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.emailVerified = new Date();
  });

  it('should show AuthLoader while loading encryption config', () => {
    mockUseMasterKey.mockReturnValue({
      isConfigured: false, isLoading: true,
      deviceVerificationRequired: false, emailSendFailed: false, deviceFingerprint: null,
    });

    render(
      <MasterKeyGuard>
        <div data-testid="protected">Protected Content</div>
      </MasterKeyGuard>
    );

    expect(screen.getByTestId('auth-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('should redirect to /master-key-setup when not configured', () => {
    mockUseMasterKey.mockReturnValue({
      isConfigured: false, isLoading: false,
      deviceVerificationRequired: false, emailSendFailed: false, deviceFingerprint: null,
    });

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
    mockUseMasterKey.mockReturnValue({
      isConfigured: true, isLoading: false,
      deviceVerificationRequired: false, emailSendFailed: false, deviceFingerprint: 'abc123',
    });

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
    mockUseMasterKey.mockReturnValue({
      isConfigured: true, isLoading: true,
      deviceVerificationRequired: false, emailSendFailed: false, deviceFingerprint: 'abc123',
    });

    render(
      <MasterKeyGuard>
        <div data-testid="protected">Protected Content</div>
      </MasterKeyGuard>
    );

    // Loading takes precedence
    expect(screen.getByTestId('auth-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('should show email verification modal when email not verified', () => {
    mockUser.emailVerified = null as any;
    mockUseMasterKey.mockReturnValue({
      isConfigured: true, isLoading: false,
      deviceVerificationRequired: false, emailSendFailed: false, deviceFingerprint: 'abc123',
    });

    render(
      <MasterKeyGuard>
        <div data-testid="protected">Protected Content</div>
      </MasterKeyGuard>
    );

    expect(screen.getByTestId('email-verification-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('should render children once email becomes verified', () => {
    mockUser.emailVerified = null as any;
    mockUseMasterKey.mockReturnValue({
      isConfigured: true, isLoading: false,
      deviceVerificationRequired: false, emailSendFailed: false, deviceFingerprint: 'abc123',
    });

    const { rerender } = render(
      <MasterKeyGuard><div data-testid="protected">Content</div></MasterKeyGuard>
    );

    expect(screen.getByTestId('email-verification-modal')).toBeInTheDocument();

    mockUser.emailVerified = new Date();
    rerender(<MasterKeyGuard><div data-testid="protected">Content</div></MasterKeyGuard>);

    expect(screen.getByTestId('protected')).toBeInTheDocument();
    expect(screen.queryByTestId('email-verification-modal')).not.toBeInTheDocument();
  });

  it('should prioritize email verification over device verification', () => {
    mockUser.emailVerified = null as any;
    mockUseMasterKey.mockReturnValue({
      isConfigured: true, isLoading: false,
      deviceVerificationRequired: true, emailSendFailed: false, deviceFingerprint: 'abc123',
    });

    render(
      <MasterKeyGuard>
        <div data-testid="protected">Protected Content</div>
      </MasterKeyGuard>
    );

    expect(screen.getByTestId('email-verification-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('device-verification-modal')).not.toBeInTheDocument();
  });

  it('should show device verification modal when required', () => {
    mockUseMasterKey.mockReturnValue({
      isConfigured: true, isLoading: false,
      deviceVerificationRequired: true, emailSendFailed: false, deviceFingerprint: 'abc123',
    });

    render(
      <MasterKeyGuard>
        <div data-testid="protected">Protected Content</div>
      </MasterKeyGuard>
    );

    expect(screen.getByTestId('device-verification-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });
});
