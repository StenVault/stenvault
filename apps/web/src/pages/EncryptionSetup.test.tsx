/**
 * EncryptionSetup — 3-act ceremony tests.
 *
 * Covers the eight cases that matter after the Phase 5 restructure: the
 * Act 1 title + eyebrow + dots, the Fair-strength submit gate, the absence
 * of the legacy Explainer and red "Why this matters" box, the Act 2 amber
 * save-now education with the photos copy, the copy/download friction gate
 * on the checkbox, and — critically — that Act 3 does NOT schedule a silent
 * 15-second redirect and that its single primary CTA navigates the user to
 * the vault root.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EncryptionSetup from './EncryptionSetup';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSetLocation = vi.fn();
vi.mock('react-router-dom', () => ({
    useNavigate: () => mockSetLocation,
}));

const TEN_CODES = [
    'AAAA2345FGHJ',
    'BBBB2345FGHJ',
    'CCCC2345FGHJ',
    'DDDD2345FGHJ',
    'EEEE2345FGHJ',
    'FFFF2345FGHJ',
    'GGGG2345FGHJ',
    'HHHH2345FGHJ',
    'JJJJ2345FGHJ',
    'KKKK2345FGHJ',
];

const mockSetupMasterKey = vi.fn();

vi.mock('@/hooks/useMasterKey', () => ({
    useMasterKey: () => ({
        setupMasterKey: mockSetupMasterKey,
        isDerivingKey: false,
        isConfigured: false,
        getCachedKey: () => null,
    }),
}));

vi.mock('@/lib/trpc', () => ({
    trpc: {
        devices: {
            registerTrustedDevice: {
                useMutation: () => ({
                    mutateAsync: vi.fn().mockResolvedValue(undefined),
                    isPending: false,
                }),
            },
        },
    },
}));

vi.mock('@/lib/uesManager', () => ({
    generateAndStoreUES: vi.fn().mockResolvedValue({ ues: new Uint8Array(32) }),
    exportUESForServer: vi.fn().mockResolvedValue({ uesEncrypted: '', uesIv: '' }),
}));

vi.mock('@/lib/deviceEntropy', () => ({
    getDeviceFingerprintHash: vi.fn().mockResolvedValue('test-fingerprint'),
    getDeviceName: () => 'Test Device',
    getBrowserInfo: () => 'Test Browser',
    getDevicePlatform: () => 'web',
}));

vi.mock('@stenvault/shared/lib/toast', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('@/lib/debugLogger', () => ({
    devLog: vi.fn(),
    devWarn: vi.fn(),
}));

// ── Test helpers ─────────────────────────────────────────────────────────────

/** A password that scores Fair (2) per getPasswordStrengthUI: length≥12 + mixed case. */
const FAIR_PASSWORD = 'AaBbCcDdEeFf';
/** A password that scores Good (3): Fair + one digit — skips the last-check dialog. */
const GOOD_PASSWORD = 'AaBbCcDdEeFf1';
/** A password that scores Weak (1): length≥12 only, all lowercase, no digit, no special. */
const WEAK_PASSWORD = 'aaaaaaaaaaaa';

/**
 * Drive the component from Act 1 through to Act 2 using a Good-strength password
 * so the Fair-tier last-check dialog never interrupts. Tests that specifically
 * exercise the Fair path use FAIR_PASSWORD directly.
 */
async function driveToAct2(user: ReturnType<typeof userEvent.setup>) {
    mockSetupMasterKey.mockResolvedValueOnce({
        success: true,
        recoveryCodesPlain: TEN_CODES,
    });

    await user.type(screen.getByLabelText(/^encryption password$/i), GOOD_PASSWORD);
    await user.type(screen.getByLabelText(/confirm encryption password/i), GOOD_PASSWORD);
    await user.click(screen.getByRole('button', { name: /seal my files/i }));

    await waitFor(() => {
        expect(screen.getByText(/save these now/i)).toBeInTheDocument();
    });
}

/** Drive Act 2 → Act 3 by clicking Copy + the "I've saved" checkbox + the Enter CTA. */
async function driveAct2ToAct3(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /copy all/i }));

    const checkbox = await screen.findByRole('checkbox', {
        name: /i've saved my recovery codes/i,
    });
    await waitFor(() => expect(checkbox).not.toBeDisabled());
    await user.click(checkbox);

    await user.click(screen.getByRole('button', { name: /enter my vault/i }));

    // Act 3 renders the Shamir upsell heading — wait for it as the transition signal.
    await waitFor(() => {
        expect(screen.getByText(/want a safety net\?/i)).toBeInTheDocument();
    });
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockSetLocation.mockClear();
    mockSetupMasterKey.mockReset();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('EncryptionSetup — Act 1 (Contract)', () => {
    it('renders the title and the Step 2 of 2 · Encryption eyebrow', () => {
        render(<EncryptionSetup />);

        expect(
            screen.getByRole('heading', { name: /set your encryption password/i })
        ).toBeInTheDocument();
        expect(screen.getByText(/step 2 of 2 · encryption/i)).toBeInTheDocument();
    });

    it('does NOT render the legacy AuthExplainer copy or the amber Important box', () => {
        render(<EncryptionSetup />);

        // Explainer three-cell sub-copy from Register should not repeat here.
        expect(screen.queryByText(/proves it's you/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/stored as unreadable noise/i)).not.toBeInTheDocument();

        // The old amber "Important" box is gone — its content moved into the description.
        expect(
            screen.queryByText(/your encryption password cannot be recovered/i)
        ).not.toBeInTheDocument();

        // The old sub-step bars indicator rendered "Step 1 of 3 — Password" at the top.
        // The new eyebrow reads "Step 2 of 2 · Encryption"; anything that says "of 3"
        // is the removed 3-bar indicator sneaking back in.
        expect(screen.queryByText(/step \d of 3/i)).not.toBeInTheDocument();
    });

    it('Seal my files stays disabled until password reaches Fair strength', async () => {
        const user = userEvent.setup();
        render(<EncryptionSetup />);

        const passwordInput = screen.getByLabelText(/^encryption password$/i);
        const confirmInput = screen.getByLabelText(/confirm encryption password/i);
        const sealButton = screen.getByRole('button', { name: /seal my files/i });

        // Weak: 12 chars but all lowercase — score 1.
        await user.type(passwordInput, WEAK_PASSWORD);
        await user.type(confirmInput, WEAK_PASSWORD);
        expect(sealButton).toBeDisabled();

        // Bump to Fair by adding mixed case — score 2.
        await user.clear(passwordInput);
        await user.clear(confirmInput);
        await user.type(passwordInput, FAIR_PASSWORD);
        await user.type(confirmInput, FAIR_PASSWORD);

        await waitFor(() => expect(sealButton).not.toBeDisabled());
    });
});

describe('EncryptionSetup — Act 2 (Keepsake)', () => {
    it('renders the amber Save these now education with the photos copy and NOT the legacy red box', async () => {
        const user = userEvent.setup();
        render(<EncryptionSetup />);

        await driveToAct2(user);

        expect(screen.getByText(/save these now/i)).toBeInTheDocument();
        expect(
            screen.getByText(/photos don't — they sync to places we don't control/i)
        ).toBeInTheDocument();

        // The old red "Why this matters" copy must be gone.
        expect(screen.queryByText(/why this matters/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/only backup/i)).not.toBeInTheDocument();

        // Step 2 of 2 · Recovery eyebrow carries the context in place of indicators.
        expect(screen.getByText(/step 2 of 2 · recovery/i)).toBeInTheDocument();
    });

    it('keeps the "I\'ve saved" checkbox disabled until Copy or Download fires', async () => {
        const user = userEvent.setup();
        render(<EncryptionSetup />);

        await driveToAct2(user);

        const checkbox = screen.getByRole('checkbox', {
            name: /i've saved my recovery codes/i,
        });
        expect(checkbox).toBeDisabled();
        expect(
            screen.getByText(/copy or download before continuing/i)
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /copy all/i }));

        await waitFor(() => expect(checkbox).not.toBeDisabled());
    });
});

describe('EncryptionSetup — Act 3 (Welcome)', () => {
    it('does NOT schedule a silent 15-second redirect after reaching complete', async () => {
        const user = userEvent.setup();
        render(<EncryptionSetup />);

        await driveToAct2(user);
        await driveAct2ToAct3(user);

        // Nothing should have tried to navigate yet — the user is reading Act 3.
        mockSetLocation.mockClear();

        vi.useFakeTimers();
        vi.advanceTimersByTime(20_000);

        expect(mockSetLocation).not.toHaveBeenCalled();
    });

    it('forwards to the trusted-circle nudge only when the user clicks Enter my vault (jsdom has no WebAuthn)', async () => {
        const user = userEvent.setup();
        render(<EncryptionSetup />);

        await driveToAct2(user);
        await driveAct2ToAct3(user);

        // jsdom / happy-dom don't expose WebAuthn, so the finish handler picks
        // the no-WebAuthn branch — which now lands on the Trusted Circle
        // nudge rather than bouncing straight to /home.
        expect(mockSetLocation).not.toHaveBeenCalledWith('/auth/trusted-circle-nudge');

        await user.click(screen.getByRole('button', { name: /enter my vault/i }));

        expect(mockSetLocation).toHaveBeenCalledWith('/auth/trusted-circle-nudge');
    });

    it('renders the Shamir upsell in violet, not amber', async () => {
        const user = userEvent.setup();
        render(<EncryptionSetup />);

        await driveToAct2(user);
        await driveAct2ToAct3(user);

        // Find the upsell box via its heading, then walk up to the bordered container.
        const heading = screen.getByText(/want a safety net\?/i);
        const box = heading.closest('div.rounded-xl');
        expect(box).not.toBeNull();
        expect(box?.className).toMatch(/violet/);
        expect(box?.className).not.toMatch(/amber/);

        // The contextual link into Settings carries the upsell action.
        expect(
            screen.getByRole('button', { name: /set up trusted circle recovery/i })
        ).toBeInTheDocument();
    });
});

describe('EncryptionSetup — Last-check dialog (Fair strength)', () => {
    it('intercepts the Fair-strength submit with the Last check dialog instead of advancing to Act 2', async () => {
        const user = userEvent.setup();
        render(<EncryptionSetup />);

        await user.type(screen.getByLabelText(/^encryption password$/i), FAIR_PASSWORD);
        await user.type(screen.getByLabelText(/confirm encryption password/i), FAIR_PASSWORD);
        await user.click(screen.getByRole('button', { name: /seal my files/i }));

        expect(
            await screen.findByRole('alertdialog', { name: /last check/i })
        ).toBeInTheDocument();
        // Act 2 must not have appeared.
        expect(screen.queryByText(/save these now/i)).not.toBeInTheDocument();
        expect(mockSetupMasterKey).not.toHaveBeenCalled();
    });

    it('closes the dialog and stays in Act 1 when the user picks Let me review', async () => {
        const user = userEvent.setup();
        render(<EncryptionSetup />);

        await user.type(screen.getByLabelText(/^encryption password$/i), FAIR_PASSWORD);
        await user.type(screen.getByLabelText(/confirm encryption password/i), FAIR_PASSWORD);
        await user.click(screen.getByRole('button', { name: /seal my files/i }));

        const reviewButton = await screen.findByRole('button', { name: /let me review/i });
        await user.click(reviewButton);

        await waitFor(() => {
            expect(
                screen.queryByRole('alertdialog', { name: /last check/i })
            ).not.toBeInTheDocument();
        });
        expect(
            screen.getByRole('heading', { name: /set your encryption password/i })
        ).toBeInTheDocument();
        expect(mockSetupMasterKey).not.toHaveBeenCalled();
    });

    it('proceeds to Act 2 when the user confirms inside the dialog', async () => {
        const user = userEvent.setup();
        mockSetupMasterKey.mockResolvedValueOnce({
            success: true,
            recoveryCodesPlain: TEN_CODES,
        });
        render(<EncryptionSetup />);

        await user.type(screen.getByLabelText(/^encryption password$/i), FAIR_PASSWORD);
        await user.type(screen.getByLabelText(/confirm encryption password/i), FAIR_PASSWORD);
        await user.click(screen.getByRole('button', { name: /seal my files/i }));

        // The Seal CTA lives in both Act 1 and the dialog; scope the second
        // click to the dialog so the Act 1 button can't accidentally re-fire.
        const dialog = await screen.findByRole('alertdialog', { name: /last check/i });
        await user.click(within(dialog).getByRole('button', { name: /seal my files/i }));

        await waitFor(() => {
            expect(screen.getByText(/save these now/i)).toBeInTheDocument();
        });
        expect(mockSetupMasterKey).toHaveBeenCalledTimes(1);
    });

    it('skips the dialog entirely when the password scores Good or better', async () => {
        const user = userEvent.setup();
        render(<EncryptionSetup />);

        await driveToAct2(user);

        // driveToAct2 uses GOOD_PASSWORD; the dialog should never have appeared.
        expect(
            screen.queryByRole('alertdialog', { name: /last check/i })
        ).not.toBeInTheDocument();
        expect(mockSetupMasterKey).toHaveBeenCalledTimes(1);
    });
});
