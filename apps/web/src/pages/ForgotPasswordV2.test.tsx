/**
 * ForgotPasswordV2 Component Tests
 *
 * Tests the forgot password page including email submission,
 * success state, and retry functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ForgotPasswordV2 from './ForgotPasswordV2';

// Mock sonner
vi.mock('sonner');

// Mock tRPC
const mockSendResetMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};

vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      sendPasswordReset: {
        useMutation: vi.fn(() => mockSendResetMutation),
      },
    },
  },
}));

// Mock auth components
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
  AuthSidePanel: () => null,
}));

describe('ForgotPasswordV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mutation mock
    Object.assign(mockSendResetMutation, {
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  describe('Initial Form View', () => {
    it('should render forgot password form', () => {
      render(<ForgotPasswordV2 />);

      expect(screen.getByText('Reset your Sign-in Password')).toBeInTheDocument();
      expect(screen.getByText(/live behind a different key/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /email me a reset link/i })).toBeInTheDocument();
    });

    it('should render back to sign in link', () => {
      render(<ForgotPasswordV2 />);

      expect(screen.getByText(/back to sign in/i)).toBeInTheDocument();
    });

    it('should allow typing email', async () => {
      const user = userEvent.setup();
      render(<ForgotPasswordV2 />);

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'test@example.com');

      expect(emailInput).toHaveValue('test@example.com');
    });

    it('should submit reset request', async () => {
      const user = userEvent.setup();
      mockSendResetMutation.mutateAsync.mockResolvedValue({ success: true });

      render(<ForgotPasswordV2 />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /email me a reset link/i }));

      expect(mockSendResetMutation.mutateAsync).toHaveBeenCalledWith({
        email: 'test@example.com',
      });
    });

    it('should show loading state during submission', () => {
      Object.assign(mockSendResetMutation, { isPending: true });

      render(<ForgotPasswordV2 />);

      expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();
    });
  });

  describe('Success State', () => {
    it('should show success message after sending reset', async () => {
      const user = userEvent.setup();
      mockSendResetMutation.mutateAsync.mockResolvedValue({ success: true });

      render(<ForgotPasswordV2 />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /email me a reset link/i }));

      await waitFor(() => {
        expect(screen.getByText('Check your email')).toBeInTheDocument();
        expect(screen.getByText(/if test@example.com has an account/i)).toBeInTheDocument();
      });
    });

    it('should show confirmation message', async () => {
      const user = userEvent.setup();
      mockSendResetMutation.mutateAsync.mockResolvedValue({ success: true });

      render(<ForgotPasswordV2 />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /email me a reset link/i }));

      await waitFor(() => {
        expect(screen.getByText(/if an account exists, you will receive an email shortly/i)).toBeInTheDocument();
      });
    });

    it('should show try again button in success state', async () => {
      const user = userEvent.setup();
      mockSendResetMutation.mutateAsync.mockResolvedValue({ success: true });

      render(<ForgotPasswordV2 />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /email me a reset link/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
      });
    });

    it('should reset to form when try again is clicked', async () => {
      const user = userEvent.setup();
      mockSendResetMutation.mutateAsync.mockResolvedValue({ success: true });

      render(<ForgotPasswordV2 />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /email me a reset link/i }));

      await waitFor(() => {
        expect(screen.getByText('Check your email')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /try again/i }));

      expect(screen.getByText('Reset your Sign-in Password')).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle failed reset request', async () => {
      const user = userEvent.setup();
      mockSendResetMutation.mutateAsync.mockRejectedValue(
        new Error('User not found')
      );

      render(<ForgotPasswordV2 />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /email me a reset link/i }));

      // Should not show success state
      await waitFor(() => {
        expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
      });
    });
  });

  describe('Integration', () => {
    it('should render complete forgot password page', () => {
      render(<ForgotPasswordV2 />);

      expect(screen.getByTestId('auth-layout')).toBeInTheDocument();
      expect(screen.getByTestId('auth-card')).toBeInTheDocument();
      expect(screen.getByText('Reset your Sign-in Password')).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    });

    it('should handle complete reset flow', async () => {
      const user = userEvent.setup();
      mockSendResetMutation.mutateAsync.mockResolvedValue({ success: true });

      render(<ForgotPasswordV2 />);

      // Enter email
      await user.type(screen.getByLabelText(/email address/i), 'user@example.com');

      // Submit form
      await user.click(screen.getByRole('button', { name: /email me a reset link/i }));

      // Verify mutation called
      expect(mockSendResetMutation.mutateAsync).toHaveBeenCalledWith({
        email: 'user@example.com',
      });

      // Verify success state
      await waitFor(() => {
        expect(screen.getByText('Check your email')).toBeInTheDocument();
      });

      // Try again
      await user.click(screen.getByRole('button', { name: /try again/i }));

      // Back to form
      expect(screen.getByText('Reset your Sign-in Password')).toBeInTheDocument();
    });
  });

  describe('UI Elements', () => {
    it('should display proper labels and placeholders', () => {
      render(<ForgotPasswordV2 />);

      const emailInput = screen.getByLabelText(/email address/i);
      expect(emailInput).toHaveAttribute('placeholder', 'name@gmail.com');
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(emailInput).toBeRequired();
    });

    it('should have divider before back link', () => {
      render(<ForgotPasswordV2 />);

      expect(screen.getByTestId('divider')).toBeInTheDocument();
      expect(screen.getByText('Alternatives')).toBeInTheDocument();
    });
  });
});
