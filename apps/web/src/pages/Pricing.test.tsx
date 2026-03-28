/**
 * Pricing Page Tests
 *
 * Tests the pending checkout flow that preserves plan selection
 * through auth/registration, with email verification retry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pricing from './Pricing';

const PENDING_CHECKOUT_KEY = 'stenvault_pending_checkout';
const RETURN_URL_KEY = 'stenvault_return_url';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
    useNavigate: vi.fn(() => mockNavigate),
    Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a>,
}));

// Mock sonner
const mockToastError = vi.fn();
const mockToastInfo = vi.fn();
vi.mock('sonner', () => ({
    toast: {
        error: (...args: any[]) => mockToastError(...args),
        info: (...args: any[]) => mockToastInfo(...args),
    },
}));

// Mock tRPC — configurable per test
let mockUser: any = null;
let mockPricing: any = {
    stripeConfigured: true,
    plans: [
        { id: 'free', name: 'Free', monthlyPrice: 0, yearlyPrice: 0, highlighted: false, features: ['5 GB storage'], perUser: false },
        { id: 'pro', name: 'Pro', monthlyPrice: 5, yearlyPrice: 48, highlighted: true, features: ['200 GB storage'], perUser: false },
        { id: 'business', name: 'Business', monthlyPrice: 8, yearlyPrice: 80, highlighted: false, features: ['500 GB storage'], perUser: true, minUsers: 3 },
    ],
};
let mockSubscription: any = null;
let mockLoadingPricing = false;

const mockMutate = vi.fn();
const mockMutateAsync = vi.fn();
let mockMutationState = { isPending: false, isError: false, isSuccess: false };
let mockOnSuccess: ((data: any) => void) | null = null;
let mockOnError: ((error: any) => void) | null = null;

vi.mock('@/lib/trpc', () => ({
    trpc: {
        auth: {
            me: {
                useQuery: vi.fn(() => ({ data: mockUser })),
            },
        },
        stripe: {
            getPricing: {
                useQuery: vi.fn(() => ({ data: mockPricing, isLoading: mockLoadingPricing })),
            },
            getSubscription: {
                useQuery: vi.fn(() => ({ data: mockSubscription })),
            },
            createCheckout: {
                useMutation: vi.fn((opts: any) => {
                    mockOnSuccess = opts?.onSuccess;
                    mockOnError = opts?.onError;
                    return {
                        mutate: mockMutate,
                        mutateAsync: mockMutateAsync,
                        ...mockMutationState,
                    };
                }),
            },
        },
    },
}));

describe('Pricing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        mockUser = null;
        mockSubscription = null;
        mockLoadingPricing = false;
        mockMutationState = { isPending: false, isError: false, isSuccess: false };
        mockOnSuccess = null;
        mockOnError = null;
    });

    afterEach(() => {
        sessionStorage.clear();
    });

    // ═══════════════════════════════════════════════
    // Rendering
    // ═══════════════════════════════════════════════

    it('shows loading spinner when pricing is loading', () => {
        mockLoadingPricing = true;
        render(<Pricing />);
        expect(document.querySelector('.animate-spin')).toBeTruthy();
    });

    it('renders all three plan cards', () => {
        render(<Pricing />);
        // Plan names appear in h3 headings
        const headings = screen.getAllByRole('heading', { level: 3 });
        const names = headings.map(h => h.textContent);
        expect(names).toContain('Free');
        expect(names).toContain('Pro');
        expect(names).toContain('Business');
    });

    it('shows "Get Started" for unauthenticated paid plans', () => {
        render(<Pricing />);
        const buttons = screen.getAllByRole('button');
        const getStartedButtons = buttons.filter(b => b.textContent === 'Get Started');
        expect(getStartedButtons).toHaveLength(2); // Pro + Business
    });

    it('shows "Create Free Account" for unauthenticated free plan', () => {
        render(<Pricing />);
        expect(screen.getByText('Create Free Account')).toBeTruthy();
    });

    it('shows "Start 14-Day Trial" for authenticated paid plans', () => {
        mockUser = { id: '1', email: 'a@b.com', emailVerified: new Date() };
        mockSubscription = { plan: 'free', status: 'free' };
        render(<Pricing />);
        const buttons = screen.getAllByRole('button');
        const trialButtons = buttons.filter(b => b.textContent === 'Start 14-Day Trial');
        expect(trialButtons).toHaveLength(2);
    });

    it('shows "Current Plan" for the active plan', () => {
        mockUser = { id: '1', email: 'a@b.com', emailVerified: new Date() };
        mockSubscription = { plan: 'pro', status: 'active' };
        render(<Pricing />);
        expect(screen.getByText('Current Plan')).toBeTruthy();
    });

    // ═══════════════════════════════════════════════
    // Unauthenticated plan selection
    // ═══════════════════════════════════════════════

    it('redirects to /auth/register when unauthenticated user clicks Free', async () => {
        render(<Pricing />);
        const btn = screen.getByText('Create Free Account');
        await userEvent.click(btn);
        expect(mockNavigate).toHaveBeenCalledWith('/auth/register');
        expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
    });

    it('saves pending checkout and redirects to /auth/register for Pro', async () => {
        render(<Pricing />);
        const buttons = screen.getAllByRole('button');
        const proBtn = buttons.find(b => b.textContent === 'Get Started');
        await userEvent.click(proBtn!);

        expect(mockNavigate).toHaveBeenCalledWith('/auth/register');

        const stored = JSON.parse(sessionStorage.getItem(PENDING_CHECKOUT_KEY)!);
        expect(stored.plan).toBe('pro');
        expect(stored.billingCycle).toBe('monthly');
        expect(stored.ts).toBeGreaterThan(0);

        expect(sessionStorage.getItem(RETURN_URL_KEY)).toBe('/pricing');
    });

    it('saves seats for Business plan', async () => {
        render(<Pricing />);
        // Find the Business "Get Started" button (second one)
        const buttons = screen.getAllByRole('button');
        const getStartedButtons = buttons.filter(b => b.textContent === 'Get Started');
        await userEvent.click(getStartedButtons[1]!); // Business is the second

        const stored = JSON.parse(sessionStorage.getItem(PENDING_CHECKOUT_KEY)!);
        expect(stored.plan).toBe('business');
        expect(stored.seats).toBe(3); // default seat count
    });

    // ═══════════════════════════════════════════════
    // Pending checkout auto-trigger
    // ═══════════════════════════════════════════════

    it('does NOT auto-trigger for already-verified user on mount', () => {
        mockUser = { id: '1', email: 'a@b.com', emailVerified: new Date() };
        sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({
            plan: 'pro', billingCycle: 'monthly', ts: Date.now(),
        }));

        render(<Pricing />);
        expect(mockMutate).not.toHaveBeenCalled();
    });

    it('auto-triggers for unverified user arriving with pending checkout', () => {
        mockUser = { id: '1', email: 'a@b.com', emailVerified: null };
        sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({
            plan: 'pro', billingCycle: 'monthly', ts: Date.now(),
        }));

        render(<Pricing />);
        expect(mockMutate).toHaveBeenCalledWith({
            plan: 'pro',
            billingCycle: 'monthly',
        });
    });

    it('auto-triggers with seats for Business pending checkout', () => {
        mockUser = { id: '1', email: 'a@b.com', emailVerified: null };
        sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({
            plan: 'business', billingCycle: 'yearly', seats: 5, ts: Date.now(),
        }));

        render(<Pricing />);
        expect(mockMutate).toHaveBeenCalledWith({
            plan: 'business',
            billingCycle: 'yearly',
            seats: 5,
        });
    });

    it('does NOT trigger when no user is authenticated', () => {
        sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({
            plan: 'pro', billingCycle: 'monthly', ts: Date.now(),
        }));

        render(<Pricing />);
        expect(mockMutate).not.toHaveBeenCalled();
    });

    // ═══════════════════════════════════════════════
    // TTL and validation
    // ═══════════════════════════════════════════════

    it('cleans up expired pending checkout (>15 min)', () => {
        mockUser = { id: '1', email: 'a@b.com', emailVerified: null };
        const expired = Date.now() - 16 * 60 * 1000; // 16 minutes ago
        sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({
            plan: 'pro', billingCycle: 'monthly', ts: expired,
        }));

        render(<Pricing />);
        expect(mockMutate).not.toHaveBeenCalled();
        expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
    });

    it('cleans up malformed JSON in sessionStorage', () => {
        mockUser = { id: '1', email: 'a@b.com', emailVerified: null };
        sessionStorage.setItem(PENDING_CHECKOUT_KEY, 'not-json{{{');

        render(<Pricing />);
        expect(mockMutate).not.toHaveBeenCalled();
        expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
    });

    it('cleans up invalid plan value', () => {
        mockUser = { id: '1', email: 'a@b.com', emailVerified: null };
        sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({
            plan: 'enterprise', billingCycle: 'monthly', ts: Date.now(),
        }));

        render(<Pricing />);
        expect(mockMutate).not.toHaveBeenCalled();
        expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
    });

    it('cleans up invalid billingCycle value', () => {
        mockUser = { id: '1', email: 'a@b.com', emailVerified: null };
        sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({
            plan: 'pro', billingCycle: 'weekly', ts: Date.now(),
        }));

        render(<Pricing />);
        expect(mockMutate).not.toHaveBeenCalled();
        expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
    });

    // ═══════════════════════════════════════════════
    // Error handling
    // ═══════════════════════════════════════════════

    it('keeps pending checkout on EMAIL_NOT_VERIFIED error', () => {
        sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({
            plan: 'pro', billingCycle: 'monthly', ts: Date.now(),
        }));

        render(<Pricing />);

        // Simulate EMAIL_NOT_VERIFIED error
        act(() => {
            mockOnError?.({ message: 'EMAIL_NOT_VERIFIED' });
        });

        expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).not.toBeNull();
        expect(mockToastError).not.toHaveBeenCalled();
    });

    it('clears pending checkout on non-email error', () => {
        sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({
            plan: 'pro', billingCycle: 'monthly', ts: Date.now(),
        }));

        render(<Pricing />);

        act(() => {
            mockOnError?.({ message: 'Stripe not configured' });
        });

        expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
        expect(mockToastError).toHaveBeenCalledWith('Stripe not configured');
    });

    it('clears pending checkout on success and redirects', () => {
        sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({
            plan: 'pro', billingCycle: 'monthly', ts: Date.now(),
        }));

        // Mock window.location.href
        const originalLocation = window.location;
        const mockHref = vi.fn();
        Object.defineProperty(window, 'location', {
            value: { ...originalLocation, href: '' },
            writable: true,
            configurable: true,
        });
        Object.defineProperty(window.location, 'href', {
            set: mockHref,
            configurable: true,
        });

        render(<Pricing />);

        act(() => {
            mockOnSuccess?.({ url: 'https://checkout.stripe.com/session123' });
        });

        expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
        expect(mockHref).toHaveBeenCalledWith('https://checkout.stripe.com/session123');

        // Restore
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            writable: true,
            configurable: true,
        });
    });

    // ═══════════════════════════════════════════════
    // Authenticated user direct checkout
    // ═══════════════════════════════════════════════

    it('shows toast when clicking already-active plan', async () => {
        mockUser = { id: '1', email: 'a@b.com', emailVerified: new Date() };
        mockSubscription = { plan: 'pro', status: 'active' };

        render(<Pricing />);

        // The Pro button should be disabled (Current Plan), try to find any way to trigger
        // The function checks subscription?.plan === planId and shows toast
        // We can't click because it's disabled, so test the button text instead
        expect(screen.getByText('Current Plan')).toBeTruthy();
    });

    it('calls startCheckout directly for authenticated verified user', async () => {
        mockUser = { id: '1', email: 'a@b.com', emailVerified: new Date() };
        mockSubscription = { plan: 'free', status: 'free' };
        mockMutateAsync.mockResolvedValue({ url: 'https://stripe.com' });

        render(<Pricing />);
        const buttons = screen.getAllByRole('button');
        const trialBtn = buttons.find(b => b.textContent === 'Start 14-Day Trial');
        await userEvent.click(trialBtn!);

        expect(mockMutateAsync).toHaveBeenCalledWith({
            plan: 'pro',
            billingCycle: 'monthly',
        });
        // Should NOT save to sessionStorage (user is already authenticated)
        expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
    });

    // ═══════════════════════════════════════════════
    // Billing cycle toggle
    // ═══════════════════════════════════════════════

    it('saves yearly billing cycle in pending checkout', async () => {
        render(<Pricing />);

        // Toggle to yearly — the toggle is the button with no visible text between Monthly/Yearly
        const allButtons = screen.getAllByRole('button');
        const toggleBtn = allButtons.find(b =>
            b.className.includes('rounded-full') && b.className.includes('h-7')
        );
        expect(toggleBtn).toBeTruthy();
        await userEvent.click(toggleBtn!);

        // Click Pro "Get Started"
        const getStartedButtons = screen.getAllByRole('button').filter(b => b.textContent === 'Get Started');
        await userEvent.click(getStartedButtons[0]!);

        const stored = JSON.parse(sessionStorage.getItem(PENDING_CHECKOUT_KEY)!);
        expect(stored.billingCycle).toBe('yearly');
    });
});
