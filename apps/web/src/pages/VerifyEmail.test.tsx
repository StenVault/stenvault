/**
 * VerifyEmail Component Tests
 *
 * Tests email verification page routing behavior:
 * - Token extraction from query string via useSearch
 * - Missing token shows error state
 * - Valid token triggers verification mutation
 * - Success state with redirect
 * - Error state with back to login
 * - MFA gate redirects to login with mfa=true
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerifyEmail from './VerifyEmail';

// Mock react-router-dom
const mockSetLocation = vi.fn();
let mockSearchString = '';
vi.mock('react-router-dom', () => ({
  useSearchParams: vi.fn(() => [new URLSearchParams(mockSearchString), vi.fn()]),
  useLocation: vi.fn(() => ({ pathname: '' })),
  useNavigate: vi.fn(() => mockSetLocation),
}));

// Mock tRPC
let mockMutateAsync: ReturnType<typeof vi.fn>;
vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      verifyEmailToken: {
        useMutation: vi.fn(() => {
          return { mutateAsync: mockMutateAsync };
        }),
      },
    },
  },
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Loader2: ({ className }: any) => <div data-testid="loader" className={className} />,
  CheckCircle: () => <div data-testid="icon-check" />,
  XCircle: () => <div data-testid="icon-x" />,
}));

// Mock auth components
vi.mock('@/components/auth', () => ({
  AuthLayout: ({ children, showBackLink }: any) => (
    <div data-testid="auth-layout" data-show-back={showBackLink}>
      {children}
    </div>
  ),
  AuthCard: ({ title, description, children }: any) => (
    <div data-testid="auth-card">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children}
    </div>
  ),
  AuthButton: ({ children, onClick, variant }: any) => (
    <button onClick={onClick} data-variant={variant}>{children}</button>
  ),
  AuthSidePanel: () => null,
}));

describe('VerifyEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchString = '';
    mockMutateAsync = vi.fn().mockResolvedValue({ success: true });
  });

  describe('Token extraction', () => {
    it('should show error when token is missing', () => {
      mockSearchString = '';

      render(<VerifyEmail />);

      expect(screen.getByText('Verification failed')).toBeInTheDocument();
      expect(screen.getByText('Verification token missing')).toBeInTheDocument();
      expect(screen.getByTestId('icon-x')).toBeInTheDocument();
    });

    it('should not call mutation when token is missing', () => {
      mockSearchString = '';

      render(<VerifyEmail />);

      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('should call mutation with token when present', async () => {
      mockSearchString = 'token=verify-abc123';

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({ token: 'verify-abc123' });
      });
    });

    it('should extract token from complex query string', async () => {
      mockSearchString = 'other=value&token=my-token&foo=bar';

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({ token: 'my-token' });
      });
    });
  });

  describe('Loading state', () => {
    it('should show loading state initially with token', () => {
      // Keep the promise pending so we stay in loading state
      mockMutateAsync = vi.fn().mockReturnValue(new Promise(() => {}));
      mockSearchString = 'token=abc';

      render(<VerifyEmail />);

      expect(screen.getByText('Verifying…')).toBeInTheDocument();
      expect(screen.getByTestId('loader')).toBeInTheDocument();
    });
  });

  describe('Success state', () => {
    it('should show success state on mutation success', async () => {
      mockSearchString = 'token=valid';
      mockMutateAsync = vi.fn().mockResolvedValue({ success: true });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Email verified')).toBeInTheDocument();
        expect(screen.getByTestId('icon-check')).toBeInTheDocument();
      });
    });

    it('should show Go to Home button on success', async () => {
      mockSearchString = 'token=valid';
      mockMutateAsync = vi.fn().mockResolvedValue({ success: true });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Go to home')).toBeInTheDocument();
      });
    });
  });

  describe('MFA gate', () => {
    it('should redirect to login with mfa=true when MFA required', async () => {
      mockSearchString = 'token=valid-mfa';
      mockMutateAsync = vi.fn().mockResolvedValue({ mfaRequired: true, mfaToken: 'mfa-tok' });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalledWith('/auth/login?mfa=true');
      });
    });

    it('should store mfaToken in sessionStorage when MFA required', async () => {
      mockSearchString = 'token=valid-mfa';
      mockMutateAsync = vi.fn().mockResolvedValue({ mfaRequired: true, mfaToken: 'challenge-123' });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(sessionStorage.getItem('mfaToken')).toBe('challenge-123');
      });

      sessionStorage.removeItem('mfaToken');
    });
  });

  describe('Error state', () => {
    it('should show error state on mutation error', async () => {
      mockSearchString = 'token=expired';
      mockMutateAsync = vi.fn().mockRejectedValue({ message: 'Token expired' });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification failed')).toBeInTheDocument();
        expect(screen.getByText('Token expired')).toBeInTheDocument();
        expect(screen.getByTestId('icon-x')).toBeInTheDocument();
      });
    });

    it('should show fallback error message', async () => {
      mockSearchString = 'token=bad';
      mockMutateAsync = vi.fn().mockRejectedValue({});

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText(/request a new verification link/i)).toBeInTheDocument();
      });
    });

    it('should show back to login button on error', async () => {
      mockSearchString = 'token=bad';
      mockMutateAsync = vi.fn().mockRejectedValue({ message: 'Failed' });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Back to sign in')).toBeInTheDocument();
      });
    });

    it('should navigate to login when clicking back to login', async () => {
      const user = userEvent.setup();
      mockSearchString = 'token=bad';
      mockMutateAsync = vi.fn().mockRejectedValue({ message: 'Failed' });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Back to sign in')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Back to sign in'));
      expect(mockSetLocation).toHaveBeenCalledWith('/auth/login');
    });

    it('should show back link only on error', async () => {
      mockSearchString = 'token=bad';
      mockMutateAsync = vi.fn().mockRejectedValue({ message: 'Fail' });

      render(<VerifyEmail />);

      // Initially loading - no back link
      expect(screen.getByTestId('auth-layout').getAttribute('data-show-back')).toBe('false');

      // After error - show back link
      await waitFor(() => {
        expect(screen.getByTestId('auth-layout').getAttribute('data-show-back')).toBe('true');
      });
    });
  });
});
