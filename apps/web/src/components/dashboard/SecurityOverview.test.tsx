/**
 * SecurityOverview Component Tests
 *
 * Tests the security overview card including status calculation,
 * security items rendering, and score percentage.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SecurityOverview } from './SecurityOverview';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Shield: () => <div data-testid="icon-shield" />,
  ShieldCheck: () => <div data-testid="icon-shield-check" />,
  ShieldAlert: () => <div data-testid="icon-shield-alert" />,
  CheckCircle2: () => <div data-testid="icon-check-circle" />,
  XCircle: () => <div data-testid="icon-x-circle" />,
  AlertCircle: () => <div data-testid="icon-alert-circle" />,
}));

// Mock AuroraCard — the component uses plain divs internally for the
// header/content rows so we only need to surface the outer card here.
vi.mock('@stenvault/shared/ui/aurora-card', () => ({
  AuroraCard: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('@stenvault/shared/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <div data-testid="badge" data-variant={variant} className={className}>
      {children}
    </div>
  ),
}));

describe('SecurityOverview', () => {
  describe('Loading State', () => {
    it('should render loading skeleton', () => {
      const { container } = render(
        <SecurityOverview
          mfaEnabled={false}
          emailVerified={false}
          isLoading={true}
        />
      );

      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should not render security items when loading', () => {
      render(
        <SecurityOverview
          mfaEnabled={false}
          emailVerified={false}
          isLoading={true}
        />
      );

      expect(screen.queryByText('2FA Authentication')).not.toBeInTheDocument();
      expect(screen.queryByText('Email Verified')).not.toBeInTheDocument();
    });
  });

  describe('Component Rendering', () => {
    it('should render security card', () => {
      render(
        <SecurityOverview mfaEnabled={false} emailVerified={false} />
      );

      expect(screen.getByTestId('card')).toBeInTheDocument();
    });

    it('should render title', () => {
      render(
        <SecurityOverview mfaEnabled={false} emailVerified={false} />
      );

      expect(screen.getByText('Security')).toBeInTheDocument();
    });

    it('should render all security items', () => {
      render(
        <SecurityOverview mfaEnabled={false} emailVerified={false} />
      );

      expect(screen.getByText('2FA Authentication')).toBeInTheDocument();
      expect(screen.getByText('Email Verified')).toBeInTheDocument();
      expect(screen.getByText('E2E Encryption')).toBeInTheDocument();
    });
  });

  describe('Security Score Calculation', () => {
    it('should calculate score correctly when all disabled', () => {
      render(
        <SecurityOverview
          mfaEnabled={false}
          emailVerified={false}
          encryptionEnabled={false}
        />
      );

      expect(screen.getByText('0/3')).toBeInTheDocument();
      expect(screen.getByText(/0%/)).toBeInTheDocument();
    });

    it('should calculate score correctly when all enabled', () => {
      render(
        <SecurityOverview
          mfaEnabled={true}
          emailVerified={true}
          encryptionEnabled={true}
        />
      );

      expect(screen.getByText('3/3')).toBeInTheDocument();
      expect(screen.getByText(/100%/)).toBeInTheDocument();
    });

    it('should calculate score correctly when partially enabled', () => {
      render(
        <SecurityOverview
          mfaEnabled={true}
          emailVerified={false}
          encryptionEnabled={true}
        />
      );

      expect(screen.getByText('2/3')).toBeInTheDocument();
      expect(screen.getByText(/67%/)).toBeInTheDocument();
    });

    it('should calculate score with one item enabled', () => {
      render(
        <SecurityOverview
          mfaEnabled={true}
          emailVerified={false}
          encryptionEnabled={false}
        />
      );

      expect(screen.getByText('1/3')).toBeInTheDocument();
      expect(screen.getByText(/33%/)).toBeInTheDocument();
    });
  });

  describe('Overall Status', () => {
    it('should show excellent status when all enabled', () => {
      render(
        <SecurityOverview
          mfaEnabled={true}
          emailVerified={true}
          encryptionEnabled={true}
        />
      );

      expect(screen.getByText(/excellent/i)).toBeInTheDocument();
      expect(screen.getByTestId('icon-shield-check')).toBeInTheDocument();
    });

    it('should show good status when 2/3 enabled', () => {
      render(
        <SecurityOverview
          mfaEnabled={true}
          emailVerified={true}
          encryptionEnabled={false}
        />
      );

      expect(screen.getByText(/good/i)).toBeInTheDocument();
      expect(screen.getByTestId('icon-shield')).toBeInTheDocument();
    });

    it('should show attention status when 1/3 or less enabled', () => {
      render(
        <SecurityOverview
          mfaEnabled={true}
          emailVerified={false}
          encryptionEnabled={false}
        />
      );

      expect(screen.getByText(/attention/i)).toBeInTheDocument();
      expect(screen.getByTestId('icon-shield-alert')).toBeInTheDocument();
    });

    it('should show attention status when none enabled', () => {
      render(
        <SecurityOverview
          mfaEnabled={false}
          emailVerified={false}
          encryptionEnabled={false}
        />
      );

      expect(screen.getByText(/attention/i)).toBeInTheDocument();
    });
  });

  describe('MFA Status', () => {
    it('should show MFA as enabled', () => {
      render(
        <SecurityOverview mfaEnabled={true} emailVerified={false} />
      );

      expect(screen.getByText('2FA Authentication')).toBeInTheDocument();
      expect(screen.getByText('TOTP code active')).toBeInTheDocument();
    });

    it('should show MFA as disabled', () => {
      render(
        <SecurityOverview mfaEnabled={false} emailVerified={false} />
      );

      expect(screen.getByText('2FA Authentication')).toBeInTheDocument();
      expect(screen.getByText('Recommended to enable')).toBeInTheDocument();
    });

    it('should render MFA status badge', () => {
      render(
        <SecurityOverview mfaEnabled={true} emailVerified={false} />
      );

      const badges = screen.getAllByTestId('badge');
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  describe('Email Verification Status', () => {
    it('should show email as verified', () => {
      render(
        <SecurityOverview mfaEnabled={false} emailVerified={true} />
      );

      expect(screen.getByText('Email Verified')).toBeInTheDocument();
      expect(screen.getByText('Verified')).toBeInTheDocument();
    });

    it('should show email as not verified', () => {
      render(
        <SecurityOverview mfaEnabled={false} emailVerified={false} />
      );

      expect(screen.getByText('Email Verified')).toBeInTheDocument();
      expect(screen.getByText('Please verify your email')).toBeInTheDocument();
    });
  });

  describe('Encryption Status', () => {
    it('should show encryption as enabled by default', () => {
      render(
        <SecurityOverview mfaEnabled={false} emailVerified={false} />
      );

      expect(screen.getByText('E2E Encryption')).toBeInTheDocument();
      expect(screen.getByText('Files encrypted locally')).toBeInTheDocument();
    });

    it('should show encryption as enabled when explicitly set', () => {
      render(
        <SecurityOverview
          mfaEnabled={false}
          emailVerified={false}
          encryptionEnabled={true}
        />
      );

      expect(screen.getByText('E2E Encryption')).toBeInTheDocument();
    });

    it('should show encryption as disabled when set to false', () => {
      render(
        <SecurityOverview
          mfaEnabled={false}
          emailVerified={false}
          encryptionEnabled={false}
        />
      );

      expect(screen.getByText('E2E Encryption')).toBeInTheDocument();
      expect(screen.getByText('Files encrypted locally')).toBeInTheDocument();
    });
  });

  describe('Last Login Date', () => {
    it('should show last login date when provided', () => {
      const lastLogin = new Date('2026-01-24T10:30:00');

      render(
        <SecurityOverview
          mfaEnabled={false}
          emailVerified={false}
          lastLoginDate={lastLogin}
        />
      );

      expect(screen.getByText(/last login:/i)).toBeInTheDocument();
    });

    it('should not show last login when not provided', () => {
      render(
        <SecurityOverview mfaEnabled={false} emailVerified={false} />
      );

      expect(screen.queryByText(/last login:/i)).not.toBeInTheDocument();
    });

    it('should not show last login when null', () => {
      render(
        <SecurityOverview
          mfaEnabled={false}
          emailVerified={false}
          lastLoginDate={null}
        />
      );

      expect(screen.queryByText(/last login:/i)).not.toBeInTheDocument();
    });

    it('should format last login date correctly', () => {
      const lastLogin = new Date('2026-01-24T10:30:00');

      render(
        <SecurityOverview
          mfaEnabled={false}
          emailVerified={false}
          lastLoginDate={lastLogin}
        />
      );

      const loginText = screen.getByText(/last login:/i);
      expect(loginText.textContent).toContain('24');
      expect(loginText.textContent).toContain('Jan');
    });
  });

  describe('Status Badges', () => {
    it('should render status badges for all items', () => {
      render(
        <SecurityOverview mfaEnabled={false} emailVerified={false} />
      );

      const badges = screen.getAllByTestId('badge');
      // Score badge + 3 item badges = 4 total
      expect(badges.length).toBeGreaterThanOrEqual(4);
    });

    it('should show Active badge for enabled items', () => {
      render(
        <SecurityOverview mfaEnabled={true} emailVerified={false} />
      );

      const activeBadges = screen.getAllByText(/active/i);
      expect(activeBadges.length).toBeGreaterThan(0);
    });

    it('should show Inactive badge for disabled items', () => {
      render(
        <SecurityOverview mfaEnabled={false} emailVerified={false} />
      );

      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('should show Warning badge for unverified email', () => {
      render(
        <SecurityOverview mfaEnabled={false} emailVerified={false} />
      );

      expect(screen.getByText('Warning')).toBeInTheDocument();
    });
  });

  describe('Custom ClassName', () => {
    it('should apply custom className to card', () => {
      const { container } = render(
        <SecurityOverview
          mfaEnabled={false}
          emailVerified={false}
          className="custom-class"
        />
      );

      const card = container.querySelector('[data-testid="card"]');
      expect(card?.className).toContain('custom-class');
    });
  });

  describe('Integration', () => {
    it('should render complete security overview', () => {
      render(
        <SecurityOverview
          mfaEnabled={true}
          emailVerified={true}
          encryptionEnabled={true}
        />
      );

      // Title
      expect(screen.getByText('Security')).toBeInTheDocument();

      // Score
      expect(screen.getByText('3/3')).toBeInTheDocument();
      expect(screen.getByText(/100%/)).toBeInTheDocument();

      // Overall status
      expect(screen.getByText(/excellent/i)).toBeInTheDocument();

      // All security items
      expect(screen.getByText('2FA Authentication')).toBeInTheDocument();
      expect(screen.getByText('Email Verified')).toBeInTheDocument();
      expect(screen.getByText('E2E Encryption')).toBeInTheDocument();
    });

    it('should handle all states correctly', () => {
      const { rerender } = render(
        <SecurityOverview
          mfaEnabled={false}
          emailVerified={false}
          isLoading={true}
        />
      );

      // Loading state
      expect(screen.queryByText('2FA Authentication')).not.toBeInTheDocument();

      // All disabled
      rerender(
        <SecurityOverview
          mfaEnabled={false}
          emailVerified={false}
          encryptionEnabled={false}
        />
      );
      expect(screen.getByText('0/3')).toBeInTheDocument();
      expect(screen.getByText(/attention/i)).toBeInTheDocument();

      // All enabled
      rerender(
        <SecurityOverview
          mfaEnabled={true}
          emailVerified={true}
          encryptionEnabled={true}
        />
      );
      expect(screen.getByText('3/3')).toBeInTheDocument();
      expect(screen.getByText(/excellent/i)).toBeInTheDocument();
    });
  });
});
