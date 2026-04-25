/**
 * PasskeyNudge Component Tests
 *
 * Covers the post-Encryption-Setup passkey invitation — gating rules,
 * enable / skip mutations, and WebAuthn cancel handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasskeyNudge from './PasskeyNudge';

// ─── react-router-dom ─────────────────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
    useNavigate: vi.fn(() => mockNavigate),
}));

// ─── toast ────────────────────────────────────────────────────────────────────
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('@stenvault/shared/lib/toast', () => ({
    toast: {
        success: (...args: any[]) => mockToastSuccess(...args),
        error: (...args: any[]) => mockToastError(...args),
    },
}));

// ─── @simplewebauthn/browser ──────────────────────────────────────────────────
const mockBrowserSupportsWebAuthn = vi.fn(() => true);
const mockStartRegistration = vi.fn();
vi.mock('@simplewebauthn/browser', () => ({
    browserSupportsWebAuthn: () => mockBrowserSupportsWebAuthn(),
    startRegistration: (input: unknown) => mockStartRegistration(input),
}));

// ─── tRPC ─────────────────────────────────────────────────────────────────────
// Each query/mutation is a fresh mock per test so assertions stay clean.
const mockAuthMeQuery = vi.fn();
const mockPasskeysListQuery = vi.fn();
const mockGenerateRegOptions = vi.fn();
const mockVerifyRegistration = vi.fn();
const mockDismissNudge = vi.fn();
const mockInvalidateAuthMe = vi.fn();
const mockInvalidatePasskeysList = vi.fn();

vi.mock('@/lib/trpc', () => ({
    trpc: {
        useUtils: vi.fn(() => ({
            auth: { me: { invalidate: mockInvalidateAuthMe } },
            passkeys: { list: { invalidate: mockInvalidatePasskeysList } },
        })),
        auth: {
            me: {
                useQuery: vi.fn(() => mockAuthMeQuery()),
            },
        },
        passkeys: {
            list: {
                useQuery: vi.fn(() => mockPasskeysListQuery()),
            },
            generateRegistrationOptions: {
                useMutation: vi.fn(() => ({ mutateAsync: mockGenerateRegOptions, isPending: false })),
            },
            verifyRegistration: {
                useMutation: vi.fn(() => ({ mutateAsync: mockVerifyRegistration, isPending: false })),
            },
            dismissNudge: {
                useMutation: vi.fn(() => ({ mutateAsync: mockDismissNudge, isPending: false })),
            },
        },
    },
}));

// ─── Auth primitives (render plain DOM for assertion simplicity) ──────────────
vi.mock('@/components/auth', () => ({
    AuthLayout: ({ children }: any) => <div data-testid="auth-layout">{children}</div>,
    AuthCard: ({ title, description, children }: any) => (
        <div data-testid="auth-card">
            <h1>{title}</h1>
            <p>{description}</p>
            {children}
        </div>
    ),
    AuthButton: ({ children, onClick, isLoading, disabled }: any) => (
        <button type="button" onClick={onClick} disabled={disabled || isLoading} data-loading={isLoading}>
            {children}
        </button>
    ),
    AuthSidePanel: ({ headline }: any) => <aside data-testid="auth-side-panel">{headline}</aside>,
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────
const loadedQuery = <T,>(data: T) => ({ data, isLoading: false });

function setAuthMe(passkeyNudgeDismissed: boolean) {
    mockAuthMeQuery.mockReturnValue(loadedQuery({ id: 1, email: 'a@b.c', passkeyNudgeDismissed }));
}

function setPasskeys(count: number) {
    mockPasskeysListQuery.mockReturnValue(
        loadedQuery(Array.from({ length: count }, (_, i) => ({ id: i + 1 })))
    );
}

describe('PasskeyNudge', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockBrowserSupportsWebAuthn.mockReturnValue(true);
        setAuthMe(false);
        setPasskeys(0);
        mockDismissNudge.mockResolvedValue({ success: true });
        mockInvalidateAuthMe.mockResolvedValue(undefined);
        mockInvalidatePasskeysList.mockResolvedValue(undefined);
    });

    it('renders the nudge when WebAuthn is supported, flag is false, and list is empty', () => {
        render(<PasskeyNudge />);

        expect(screen.getByText('One more thing')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Enable Passkey/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Not now/i })).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('auto-redirects to the trusted-circle nudge when browserSupportsWebAuthn is false', async () => {
        mockBrowserSupportsWebAuthn.mockReturnValue(false);

        render(<PasskeyNudge />);

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/auth/trusted-circle-nudge', { replace: true });
        });
    });

    it('auto-redirects when the user has already dismissed the nudge', async () => {
        setAuthMe(true);

        render(<PasskeyNudge />);

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/auth/trusted-circle-nudge', { replace: true });
        });
    });

    it('auto-redirects when the account already owns a passkey', async () => {
        setPasskeys(1);

        render(<PasskeyNudge />);

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/auth/trusted-circle-nudge', { replace: true });
        });
    });

    it('on "Not now" dismisses the nudge, invalidates caches, and forwards to the trusted-circle nudge', async () => {
        const user = userEvent.setup();
        render(<PasskeyNudge />);

        await user.click(screen.getByRole('button', { name: /Not now/i }));

        await waitFor(() => {
            expect(mockDismissNudge).toHaveBeenCalledTimes(1);
        });
        expect(mockInvalidateAuthMe).toHaveBeenCalled();
        expect(mockInvalidatePasskeysList).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenLastCalledWith('/auth/trusted-circle-nudge', { replace: true });
    });

    it('on "Enable Passkey" runs the full registration + dismiss chain and invalidates caches', async () => {
        const user = userEvent.setup();
        mockGenerateRegOptions.mockResolvedValue({
            options: { challenge: 'abc' },
            challengeId: 'challenge-123',
        });
        mockStartRegistration.mockResolvedValue({ id: 'cred-id', response: {} });
        mockVerifyRegistration.mockResolvedValue({ success: true, passkeyId: 42 });

        render(<PasskeyNudge />);
        await user.click(screen.getByRole('button', { name: /Enable Passkey/i }));

        await waitFor(() => {
            expect(mockDismissNudge).toHaveBeenCalled();
        });
        expect(mockGenerateRegOptions).toHaveBeenCalledWith({ friendlyName: 'StenVault Passkey' });
        expect(mockStartRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'abc' } });
        expect(mockVerifyRegistration).toHaveBeenCalledWith(
            expect.objectContaining({ challengeId: 'challenge-123' }),
        );
        // Both caches must refresh so a subsequent Settings visit sees the new
        // passkey and `auth.me.passkeyNudgeDismissed=true` from the dismiss.
        expect(mockInvalidateAuthMe).toHaveBeenCalled();
        expect(mockInvalidatePasskeysList).toHaveBeenCalled();
        expect(mockToastSuccess).toHaveBeenCalledWith('Passkey enabled');
        expect(mockNavigate).toHaveBeenLastCalledWith('/auth/trusted-circle-nudge', { replace: true });
    });

    it('still completes the enable flow when dismissNudge fails post-registration', async () => {
        // Guards against the ordering bug: if verifyRegistration succeeds but
        // the follow-up flag flip fails, the passkey exists and the `alreadyHasPasskey`
        // gate will suppress the nudge on future visits — so we must not strand
        // the user on this screen or surface the failure as an error.
        const user = userEvent.setup();
        mockGenerateRegOptions.mockResolvedValue({
            options: { challenge: 'abc' },
            challengeId: 'challenge-123',
        });
        mockStartRegistration.mockResolvedValue({ id: 'cred-id', response: {} });
        mockVerifyRegistration.mockResolvedValue({ success: true, passkeyId: 42 });
        mockDismissNudge.mockRejectedValueOnce(new Error('transient network error'));

        render(<PasskeyNudge />);
        await user.click(screen.getByRole('button', { name: /Enable Passkey/i }));

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenLastCalledWith('/auth/trusted-circle-nudge', { replace: true });
        });
        expect(mockToastSuccess).toHaveBeenCalledWith('Passkey enabled');
        expect(mockToastError).not.toHaveBeenCalled();
        // Cache refresh still happens so subsequent visits see the new passkey.
        expect(mockInvalidatePasskeysList).toHaveBeenCalled();
    });

    it('treats NotAllowedError from WebAuthn as a silent cancel — stays on screen, no dismiss', async () => {
        const user = userEvent.setup();
        mockGenerateRegOptions.mockResolvedValue({
            options: { challenge: 'abc' },
            challengeId: 'c1',
        });
        const cancelled = new Error('cancelled');
        (cancelled as any).name = 'NotAllowedError';
        mockStartRegistration.mockRejectedValue(cancelled);

        render(<PasskeyNudge />);
        await user.click(screen.getByRole('button', { name: /Enable Passkey/i }));

        await waitFor(() => {
            expect(mockStartRegistration).toHaveBeenCalled();
        });
        expect(mockDismissNudge).not.toHaveBeenCalled();
        expect(mockToastError).not.toHaveBeenCalled();
        expect(mockToastSuccess).not.toHaveBeenCalled();
        // Still on the nudge card — no forced navigate.
        expect(screen.getByText('One more thing')).toBeInTheDocument();
    });

    it('on MFA_REQUIRED forwards to the trusted-circle nudge, flags remain untouched', async () => {
        const user = userEvent.setup();
        mockGenerateRegOptions.mockRejectedValue({
            data: { code: 'PRECONDITION_FAILED' },
            message: 'MFA_REQUIRED',
        });

        render(<PasskeyNudge />);
        await user.click(screen.getByRole('button', { name: /Enable Passkey/i }));

        await waitFor(() => {
            expect(mockToastError).toHaveBeenCalled();
        });
        expect(mockDismissNudge).not.toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenLastCalledWith('/auth/trusted-circle-nudge', { replace: true });
    });
});
