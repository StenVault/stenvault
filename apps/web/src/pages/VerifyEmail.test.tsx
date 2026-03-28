/**
 * VerifyEmail Component Tests
 *
 * Tests email verification page routing behavior:
 * - Token extraction from query string via useSearch
 * - Missing token shows error state
 * - Valid token triggers verification mutation
 * - Success state with redirect
 * - Error state with back to login
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
let mockMutateCallback: ((args: any) => void) | null = null;
const mockMutate = vi.fn((args: any) => {
  if (mockMutateCallback) mockMutateCallback(args);
});

let mockMutationOptions: any = {};
vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      verifyEmailToken: {
        useMutation: vi.fn((options: any) => {
          mockMutationOptions = options;
          return { mutate: mockMutate };
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
}));

describe('VerifyEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchString = '';
    mockMutateCallback = null;
    mockMutationOptions = {};
  });

  describe('Token extraction', () => {
    it('should show error when token is missing', () => {
      mockSearchString = '';

      render(<VerifyEmail />);

      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Verification token missing')).toBeInTheDocument();
      expect(screen.getByTestId('icon-x')).toBeInTheDocument();
    });

    it('should not call mutation when token is missing', () => {
      mockSearchString = '';

      render(<VerifyEmail />);

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('should call mutation with token when present', () => {
      mockSearchString = 'token=verify-abc123';

      render(<VerifyEmail />);

      expect(mockMutate).toHaveBeenCalledWith({ token: 'verify-abc123' });
    });

    it('should extract token from complex query string', () => {
      mockSearchString = 'other=value&token=my-token&foo=bar';

      render(<VerifyEmail />);

      expect(mockMutate).toHaveBeenCalledWith({ token: 'my-token' });
    });
  });

  describe('Loading state', () => {
    it('should show loading state initially with token', () => {
      mockSearchString = 'token=abc';

      render(<VerifyEmail />);

      expect(screen.getByText('Verifying...')).toBeInTheDocument();
      expect(screen.getByTestId('loader')).toBeInTheDocument();
    });
  });

  describe('Success state', () => {
    it('should show success state on mutation success', async () => {
      mockSearchString = 'token=valid';

      render(<VerifyEmail />);

      // Simulate mutation success
      mockMutationOptions.onSuccess();

      await waitFor(() => {
        expect(screen.getByText('Email verified')).toBeInTheDocument();
        expect(screen.getByTestId('icon-check')).toBeInTheDocument();
      });
    });

    it('should show Go to Home button on success', async () => {
      mockSearchString = 'token=valid';

      render(<VerifyEmail />);
      mockMutationOptions.onSuccess();

      await waitFor(() => {
        expect(screen.getByText('Go to Home')).toBeInTheDocument();
      });
    });
  });

  describe('Error state', () => {
    it('should show error state on mutation error', async () => {
      mockSearchString = 'token=expired';

      render(<VerifyEmail />);

      // Simulate mutation error
      mockMutationOptions.onError({ message: 'Token expired' });

      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument();
        expect(screen.getByText('Token expired')).toBeInTheDocument();
        expect(screen.getByTestId('icon-x')).toBeInTheDocument();
      });
    });

    it('should show fallback error message', async () => {
      mockSearchString = 'token=bad';

      render(<VerifyEmail />);
      mockMutationOptions.onError({});

      await waitFor(() => {
        expect(screen.getByText('Verification failed')).toBeInTheDocument();
      });
    });

    it('should show back to login button on error', async () => {
      mockSearchString = 'token=bad';

      render(<VerifyEmail />);
      mockMutationOptions.onError({ message: 'Failed' });

      await waitFor(() => {
        expect(screen.getByText('Back to login')).toBeInTheDocument();
      });
    });

    it('should navigate to login when clicking back to login', async () => {
      const user = userEvent.setup();
      mockSearchString = 'token=bad';

      render(<VerifyEmail />);
      mockMutationOptions.onError({ message: 'Failed' });

      await waitFor(() => {
        expect(screen.getByText('Back to login')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Back to login'));
      expect(mockSetLocation).toHaveBeenCalledWith('/auth/login');
    });

    it('should show back link only on error', async () => {
      mockSearchString = 'token=bad';

      const { container } = render(<VerifyEmail />);

      // Initially loading - no back link
      expect(screen.getByTestId('auth-layout').getAttribute('data-show-back')).toBe('false');

      // After error - show back link
      mockMutationOptions.onError({ message: 'Fail' });

      await waitFor(() => {
        expect(screen.getByTestId('auth-layout').getAttribute('data-show-back')).toBe('true');
      });
    });
  });
});
