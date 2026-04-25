/**
 * ResetPasswordV2 Component Tests
 *
 * Tests password reset page routing behavior:
 * - Token extraction from query string via useSearch
 * - Missing token shows error card with link to forgot-password
 * - Valid token renders password form
 * - Password validation (min length, match)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResetPasswordV2 from './ResetPasswordV2';

// Mock react-router-dom
const mockSetLocation = vi.fn();
let mockSearchString = '';
vi.mock('react-router-dom', () => ({
  useLocation: vi.fn(() => ({ pathname: '' })),
  useNavigate: vi.fn(() => mockSetLocation),
  useSearchParams: vi.fn(() => [new URLSearchParams(mockSearchString), vi.fn()]),
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

// Mock OPAQUE client
vi.mock('@/lib/opaqueClient', () => ({
  startRegistration: vi.fn().mockResolvedValue({
    registrationRequest: 'mock-reg-request',
    clientRegistrationState: 'mock-client-state',
  }),
  finishRegistration: vi.fn().mockResolvedValue({
    registrationRecord: 'mock-reg-record',
  }),
}));

// Mock tRPC
const mockResetStartMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};
const mockResetFinishMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};

vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      opaqueResetPasswordStart: {
        useMutation: vi.fn(() => mockResetStartMutation),
      },
      opaqueResetPasswordFinish: {
        useMutation: vi.fn(() => mockResetFinishMutation),
      },
    },
  },
}));

// Mock auth components
vi.mock('@/components/auth', () => ({
  AuthLayout: ({ children }: any) => <div data-testid="auth-layout">{children}</div>,
  AuthCard: ({ title, description, children }: any) => (
    <div data-testid="auth-card">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children}
    </div>
  ),
  AuthInput: ({ id, label, value, onChange, type, placeholder, required }: any) => (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type || 'text'} value={value} onChange={onChange} placeholder={placeholder} required={required} />
    </div>
  ),
  AuthButton: ({ children, onClick, type, isLoading, variant, disabled }: any) => (
    <button
      type={type}
      onClick={onClick}
      disabled={isLoading || disabled}
      data-variant={variant}
    >
      {isLoading ? 'Loading...' : children}
    </button>
  ),
  AuthLink: ({ href, children }: any) => <a href={href}>{children}</a>,
  AuthPasswordPair: ({
    label,
    confirmLabel,
    password,
    confirmPassword,
    onPasswordChange,
    onConfirmChange,
  }: any) => (
    <div>
      <label htmlFor="password">{label}</label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
      />
      <label htmlFor="confirmPassword">{confirmLabel}</label>
      <input
        id="confirmPassword"
        type="password"
        value={confirmPassword}
        onChange={(e) => onConfirmChange(e.target.value)}
      />
    </div>
  ),
  AuthSidePanel: () => null,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  ArrowRight: () => <span data-testid="icon-arrow" />,
}));

describe('ResetPasswordV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchString = '';

    Object.assign(mockResetStartMutation, {
      mutateAsync: vi.fn(),
      isPending: false,
    });
    Object.assign(mockResetFinishMutation, {
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  describe('Token extraction from query params', () => {
    it('should show error card when token is missing', () => {
      mockSearchString = '';

      render(<ResetPasswordV2 />);

      expect(screen.getByText('Invalid link')).toBeInTheDocument();
      expect(screen.getByText(/invalid or expired/i)).toBeInTheDocument();
      expect(screen.getByText('Request a new link')).toBeInTheDocument();
    });

    it('should show toast error when token is missing', () => {
      mockSearchString = '';

      render(<ResetPasswordV2 />);

      expect(mockToastError).toHaveBeenCalledWith('Invalid reset link');
    });

    it('should render password form when token is present', () => {
      mockSearchString = 'token=abc123';

      render(<ResetPasswordV2 />);

      expect(screen.getByLabelText('New Sign-in Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm New Sign-in Password')).toBeInTheDocument();
      expect(screen.getByText('Save new Sign-in Password')).toBeInTheDocument();
      expect(screen.queryByText('Invalid link')).not.toBeInTheDocument();
    });

    it('should not show toast error when token is present', () => {
      mockSearchString = 'token=valid-token';

      render(<ResetPasswordV2 />);

      expect(mockToastError).not.toHaveBeenCalled();
    });

    it('should extract token from complex query string', () => {
      mockSearchString = 'token=xyz789&other=value';

      render(<ResetPasswordV2 />);

      // Should render the form, not the error card
      expect(screen.getByLabelText('New Sign-in Password')).toBeInTheDocument();
      expect(screen.queryByText('Invalid link')).not.toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate to forgot-password when clicking Request New Link', async () => {
      const user = userEvent.setup();
      mockSearchString = '';

      render(<ResetPasswordV2 />);

      await user.click(screen.getByText('Request a new link'));

      expect(mockSetLocation).toHaveBeenCalledWith('/auth/forgot-password');
    });

    it('should show back to sign in link on the form', () => {
      mockSearchString = 'token=abc123';

      render(<ResetPasswordV2 />);

      expect(screen.getByText('Back to sign in')).toBeInTheDocument();
    });
  });
});
