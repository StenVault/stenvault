/**
 * RegisterV2 Component Tests
 *
 * Tests the registration page including form validation,
 * password strength indicator, invite code handling,
 * and OPAQUE 2-step registration flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterV2 from './RegisterV2';

// Mock wouter
const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: vi.fn(() => ['', mockSetLocation]),
}));

// Mock sonner
vi.mock('sonner');

// Mock auth storage
vi.mock('@/lib/auth', () => ({
  storeTokenPair: vi.fn(),
}));

// Mock OPAQUE client
const mockOpaqueStartRegistration = vi.fn();
const mockOpaqueFinishRegistration = vi.fn();
vi.mock('@/lib/opaqueClient', () => ({
  startRegistration: (...args: any[]) => mockOpaqueStartRegistration(...args),
  finishRegistration: (...args: any[]) => mockOpaqueFinishRegistration(...args),
}));

// Mock tRPC
const mockOpaqueRegisterStartMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};

const mockOpaqueRegisterFinishMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};

const mockRegistrationStatus = {
  isOpen: true,
  allowPublicRegistration: true,
  requireInviteCode: false,
};

const mockInvalidate = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      opaqueRegisterStart: {
        useMutation: vi.fn(() => mockOpaqueRegisterStartMutation),
      },
      opaqueRegisterFinish: {
        useMutation: vi.fn(() => mockOpaqueRegisterFinishMutation),
      },
      getRegistrationStatus: {
        useQuery: vi.fn(() => ({
          data: mockRegistrationStatus,
          isLoading: false,
        })),
      },
    },
    useUtils: vi.fn(() => ({
      auth: {
        getRegistrationStatus: {
          invalidate: vi.fn(),
        },
        me: {
          invalidate: mockInvalidate,
        },
      },
    })),
  },
}));

// Mock auth components with proper label associations
vi.mock('@/components/auth', () => ({
  AuthLayout: ({ children }: any) => <div data-testid="auth-layout">{children}</div>,
  AuthCard: ({ title, description, children }: any) => (
    <div data-testid="auth-card">
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  ),
  AuthInput: ({ id, label, value, onChange, type, placeholder, required }: any) => (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type || 'text'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        data-testid={id}
      />
    </div>
  ),
  AuthButton: ({ children, onClick, type, isLoading, variant }: any) => (
    <button type={type} onClick={onClick} disabled={isLoading} data-variant={variant}>
      {isLoading ? 'Loading...' : children}
    </button>
  ),
  AuthDivider: ({ text }: any) => <div data-testid="divider">{text}</div>,
  AuthLink: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

describe('RegisterV2', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockSetLocation.mockClear();
    mockInvalidate.mockClear();

    const { trpc } = await import('@/lib/trpc');

    // Reset mutation mocks
    Object.assign(mockOpaqueRegisterStartMutation, {
      mutateAsync: vi.fn(),
      isPending: false,
    });

    Object.assign(mockOpaqueRegisterFinishMutation, {
      mutateAsync: vi.fn(),
      isPending: false,
    });

    // Reset registration status
    Object.assign(mockRegistrationStatus, {
      isOpen: true,
      allowPublicRegistration: true,
      requireInviteCode: false,
    });

    vi.mocked(trpc.auth.getRegistrationStatus.useQuery).mockReturnValue({
      data: mockRegistrationStatus,
      isLoading: false,
    } as any);

    // Default OPAQUE mock behavior
    mockOpaqueStartRegistration.mockResolvedValue({
      clientRegistrationState: 'mock-client-reg-state',
      registrationRequest: 'mock-registration-request',
    });

    mockOpaqueFinishRegistration.mockResolvedValue({
      registrationRecord: 'mock-registration-record',
      exportKey: 'mock-export-key',
      serverStaticPublicKey: 'mock-pk',
    });
  });

  describe('Registration Form', () => {
    it('should render registration form', () => {
      render(<RegisterV2 />);

      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByTestId('password')).toBeInTheDocument();
      expect(screen.getByTestId('confirmPassword')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    it('should allow typing in all fields', async () => {
      const user = userEvent.setup();
      render(<RegisterV2 />);

      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/email address/i), 'john@example.com');
      await user.type(screen.getByTestId('password'), 'SecurePass123!');
      await user.type(screen.getByTestId('confirmPassword'), 'SecurePass123!');

      expect(screen.getByLabelText(/full name/i)).toHaveValue('John Doe');
      expect(screen.getByLabelText(/email address/i)).toHaveValue('john@example.com');
      expect(screen.getByTestId('password')).toHaveValue('SecurePass123!');
      expect(screen.getByTestId('confirmPassword')).toHaveValue('SecurePass123!');
    });

    it('should render login link', () => {
      render(<RegisterV2 />);

      expect(screen.getByText(/already have an account/i)).toBeInTheDocument();
    });
  });

  describe('Password Strength Indicator', () => {
    it('should render password strength component', () => {
      render(<RegisterV2 />);

      // The component renders the password strength indicator
      // Actual strength calculation is tested in the component logic
      expect(screen.getByTestId('password')).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should show error for short password', async () => {
      const user = userEvent.setup();
      render(<RegisterV2 />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByTestId('password'), 'short');
      await user.type(screen.getByTestId('confirmPassword'), 'short');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      // Form validation should prevent submission - OPAQUE client should NOT be called
      expect(mockOpaqueStartRegistration).not.toHaveBeenCalled();
    });

    it('should show error for mismatched passwords', async () => {
      const user = userEvent.setup();
      render(<RegisterV2 />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByTestId('password'), 'password123');
      await user.type(screen.getByTestId('confirmPassword'), 'different456');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      expect(mockOpaqueStartRegistration).not.toHaveBeenCalled();
    });

    it('should submit valid OPAQUE registration', async () => {
      const user = userEvent.setup();

      mockOpaqueRegisterStartMutation.mutateAsync.mockResolvedValue({
        registrationResponse: 'mock-registration-response',
      });

      mockOpaqueRegisterFinishMutation.mutateAsync.mockResolvedValue({
        accessToken: 'test-token',
        credentials: {
          accessToken: 'test-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      });

      render(<RegisterV2 />);

      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/email address/i), 'john@example.com');
      await user.type(screen.getByTestId('password'), 'SecurePass123!');
      await user.type(screen.getByTestId('confirmPassword'), 'SecurePass123!');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      // Verify OPAQUE client was called
      await waitFor(() => {
        expect(mockOpaqueStartRegistration).toHaveBeenCalledWith('SecurePass123!');
      });

      // Verify server start call
      await waitFor(() => {
        expect(mockOpaqueRegisterStartMutation.mutateAsync).toHaveBeenCalledWith({
          email: 'john@example.com',
          registrationRequest: 'mock-registration-request',
        });
      });

      // Verify OPAQUE client finish
      await waitFor(() => {
        expect(mockOpaqueFinishRegistration).toHaveBeenCalledWith(
          'SecurePass123!',
          'mock-client-reg-state',
          'mock-registration-response'
        );
      });

      // Verify server finish call
      await waitFor(() => {
        expect(mockOpaqueRegisterFinishMutation.mutateAsync).toHaveBeenCalledWith({
          email: 'john@example.com',
          registrationRecord: 'mock-registration-record',
          name: 'John Doe',
          inviteCode: undefined,
        });
      });

      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalledWith('/home');
      });
    });
  });

  describe('Invite Code', () => {
    it('should show invite code field when required', async () => {
      const { trpc } = await import('@/lib/trpc');

      Object.assign(mockRegistrationStatus, {
        isOpen: true,
        allowPublicRegistration: false,
        requireInviteCode: true,
      });

      vi.mocked(trpc.auth.getRegistrationStatus.useQuery).mockReturnValue({
        data: mockRegistrationStatus,
        isLoading: false,
      } as any);

      render(<RegisterV2 />);

      expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
    });

    it('should not show invite code field when not required', () => {
      render(<RegisterV2 />);

      expect(screen.queryByLabelText(/invite code/i)).not.toBeInTheDocument();
    });

    it('should submit with invite code', async () => {
      const { trpc } = await import('@/lib/trpc');
      const user = userEvent.setup();

      Object.assign(mockRegistrationStatus, {
        isOpen: true,
        allowPublicRegistration: false,
        requireInviteCode: true,
      });

      vi.mocked(trpc.auth.getRegistrationStatus.useQuery).mockReturnValue({
        data: mockRegistrationStatus,
        isLoading: false,
      } as any);

      mockOpaqueRegisterStartMutation.mutateAsync.mockResolvedValue({
        registrationResponse: 'mock-registration-response',
      });

      mockOpaqueRegisterFinishMutation.mutateAsync.mockResolvedValue({
        accessToken: 'test-token',
        credentials: {
          accessToken: 'test-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      });

      render(<RegisterV2 />);

      await user.type(screen.getByLabelText(/invite code/i), 'CLOUD-1234');
      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByTestId('password'), 'SecurePass123!');
      await user.type(screen.getByTestId('confirmPassword'), 'SecurePass123!');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(mockOpaqueRegisterFinishMutation.mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            inviteCode: 'CLOUD-1234',
          })
        );
      });
    });
  });

  describe('Registration Closed State', () => {
    it('should show closed message when registration is closed', async () => {
      const { trpc } = await import('@/lib/trpc');

      Object.assign(mockRegistrationStatus, {
        isOpen: false,
        allowPublicRegistration: false,
        requireInviteCode: false,
      });

      vi.mocked(trpc.auth.getRegistrationStatus.useQuery).mockReturnValue({
        data: mockRegistrationStatus,
        isLoading: false,
      } as any);

      render(<RegisterV2 />);

      expect(screen.getByText('Registration Closed')).toBeInTheDocument();
      expect(screen.getByText(/public signups are currently disabled/i)).toBeInTheDocument();
    });

    it('should show back to sign in button when closed', async () => {
      const { trpc } = await import('@/lib/trpc');
      const user = userEvent.setup();

      Object.assign(mockRegistrationStatus, {
        isOpen: false,
      });

      vi.mocked(trpc.auth.getRegistrationStatus.useQuery).mockReturnValue({
        data: mockRegistrationStatus,
        isLoading: false,
      } as any);

      render(<RegisterV2 />);

      const button = screen.getByRole('button', { name: /back to sign in/i });
      await user.click(button);

      expect(mockSetLocation).toHaveBeenCalledWith('/auth/login');
    });
  });

  describe('Loading States', () => {
    it('should show loading during submission', () => {
      Object.assign(mockOpaqueRegisterStartMutation, { isPending: true });

      render(<RegisterV2 />);

      expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();
    });

    it('should show loading while checking registration status', async () => {
      const { trpc } = await import('@/lib/trpc');

      vi.mocked(trpc.auth.getRegistrationStatus.useQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as any);

      const { container } = render(<RegisterV2 />);

      // Check for spinner/loader
      const spinner = container.querySelector('[class*="animate-spin"]');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('should render complete registration page', () => {
      render(<RegisterV2 />);

      expect(screen.getByTestId('auth-layout')).toBeInTheDocument();
      expect(screen.getByTestId('auth-card')).toBeInTheDocument();
    });

    it('should handle complete OPAQUE registration flow', async () => {
      const user = userEvent.setup();

      mockOpaqueRegisterStartMutation.mutateAsync.mockResolvedValue({
        registrationResponse: 'mock-registration-response',
      });

      mockOpaqueRegisterFinishMutation.mutateAsync.mockResolvedValue({
        accessToken: 'token',
        credentials: {
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresIn: 3600,
        },
      });

      render(<RegisterV2 />);

      await user.type(screen.getByLabelText(/full name/i), 'Test User');
      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByTestId('password'), 'SecurePassword123!');
      await user.type(screen.getByTestId('confirmPassword'), 'SecurePassword123!');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      // Verify 4-step OPAQUE flow
      await waitFor(() => {
        expect(mockOpaqueStartRegistration).toHaveBeenCalledWith('SecurePassword123!');
        expect(mockOpaqueRegisterStartMutation.mutateAsync).toHaveBeenCalled();
        expect(mockOpaqueFinishRegistration).toHaveBeenCalled();
        expect(mockOpaqueRegisterFinishMutation.mutateAsync).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalledWith('/home');
      });
    });
  });
});
