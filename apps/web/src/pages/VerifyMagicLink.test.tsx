/**
 * VerifyMagicLink Component Tests
 *
 * Tests magic link verification page routing behavior:
 * - Token extraction from query string via useSearch
 * - Missing token shows error toast and redirects to login
 * - Valid token triggers verification mutation
 * - MFA required redirects to login with ?mfa=true
 * - Success redirects to /home
 * - Error redirects to login with toast
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import VerifyMagicLink from './VerifyMagicLink';

// Mock wouter
const mockSetLocation = vi.fn();
let mockSearchString = '';
vi.mock('wouter', () => ({
  useLocation: vi.fn(() => ['', mockSetLocation]),
  useSearch: vi.fn(() => mockSearchString),
}));

// Mock sonner
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: any[]) => mockToastError(...args),
    success: (...args: any[]) => mockToastSuccess(...args),
  },
}));

// Mock tRPC
const mockMutateAsync = vi.fn();
vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      verifyMagicLink: {
        useMutation: vi.fn(() => ({
          mutateAsync: mockMutateAsync,
        })),
      },
    },
  },
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Loader2: ({ className }: any) => <div data-testid="loader" className={className} />,
}));

// Mock auth components
vi.mock('@/components/auth', () => ({
  AuthLayout: ({ children, showBackLink }: any) => (
    <div data-testid="auth-layout" data-show-back={showBackLink}>{children}</div>
  ),
  AuthCard: ({ title, description, children }: any) => (
    <div data-testid="auth-card">
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  ),
}));

describe('VerifyMagicLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchString = '';
    sessionStorage.clear();
  });

  describe('Token extraction', () => {
    it('should show error and redirect when token is missing', async () => {
      mockSearchString = '';

      render(<VerifyMagicLink />);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Invalid token');
        expect(mockSetLocation).toHaveBeenCalledWith('/auth/login');
      });
    });

    it('should not call mutation when token is missing', () => {
      mockSearchString = '';

      render(<VerifyMagicLink />);

      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('should call mutation with token when present', async () => {
      mockSearchString = 'token=magic-link-token';
      mockMutateAsync.mockResolvedValue({});

      render(<VerifyMagicLink />);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({ token: 'magic-link-token' });
      });
    });
  });

  describe('Successful verification', () => {
    it('should redirect to /home on success', async () => {
      mockSearchString = 'token=valid-token';
      mockMutateAsync.mockResolvedValue({});

      render(<VerifyMagicLink />);

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('Login successful');
        expect(mockSetLocation).toHaveBeenCalledWith('/home');
      });
    });
  });

  describe('MFA required', () => {
    it('should redirect to login with mfa param when MFA is required', async () => {
      mockSearchString = 'token=mfa-token';
      mockMutateAsync.mockResolvedValue({
        mfaRequired: true,
        mfaToken: 'mfa-challenge-token',
      });

      render(<VerifyMagicLink />);

      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalledWith('/auth/login?mfa=true');
      });
    });

    it('should store mfaToken in sessionStorage when MFA is required', async () => {
      mockSearchString = 'token=mfa-token';
      mockMutateAsync.mockResolvedValue({
        mfaRequired: true,
        mfaToken: 'mfa-challenge-token',
      });

      render(<VerifyMagicLink />);

      await waitFor(() => {
        expect(sessionStorage.getItem('mfaToken')).toBe('mfa-challenge-token');
      });
    });

    it('should not show success toast when MFA is required', async () => {
      mockSearchString = 'token=mfa-token';
      mockMutateAsync.mockResolvedValue({
        mfaRequired: true,
        mfaToken: 'mfa-challenge-token',
      });

      render(<VerifyMagicLink />);

      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalledWith('/auth/login?mfa=true');
      });

      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should show error toast and redirect on verification failure', async () => {
      mockSearchString = 'token=expired-token';
      mockMutateAsync.mockRejectedValue(new Error('Token expired'));

      render(<VerifyMagicLink />);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Token expired');
        expect(mockSetLocation).toHaveBeenCalledWith('/auth/login');
      });
    });

    it('should show fallback error message when error has no message', async () => {
      mockSearchString = 'token=bad-token';
      mockMutateAsync.mockRejectedValue({});

      render(<VerifyMagicLink />);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Invalid or expired link');
      });
    });
  });

  describe('UI', () => {
    it('should show loading UI with spinner', () => {
      mockSearchString = 'token=abc';
      mockMutateAsync.mockReturnValue(new Promise(() => {})); // never resolves

      render(<VerifyMagicLink />);

      expect(screen.getByText('Securing session')).toBeInTheDocument();
      expect(screen.getByTestId('loader')).toBeInTheDocument();
    });

    it('should not show back link', () => {
      mockSearchString = 'token=abc';
      mockMutateAsync.mockReturnValue(new Promise(() => {}));

      render(<VerifyMagicLink />);

      expect(screen.getByTestId('auth-layout').getAttribute('data-show-back')).toBe('false');
    });
  });
});
