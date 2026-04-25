/**
 * VaultStatusFooter — pure-function tests for `summarisePosture`.
 *
 * The summariser is the entire decision logic of the footer: which dot,
 * which label, which target. Component rendering is exercised by E2E +
 * SettingsHome.test.tsx; here we only test the contract.
 */

import { describe, it, expect } from 'vitest';
import { summarisePosture, type PostureInputs } from './VaultStatusFooter';

const allOk: PostureInputs = {
    twoFa: true,
    trustedCircle: true,
    signatureKeys: true,
    encryptionConfigured: true,
    recoveryCodesSeen: true,
};

const merge = (overrides: Partial<PostureInputs>): PostureInputs => ({
    ...allOk,
    ...overrides,
});

describe('summarisePosture', () => {
    it('reports "Strong / All clear" when everything is configured', () => {
        const result = summarisePosture(allOk);
        expect(result.state).toBe('strong');
        expect(result.label).toBe('Strong');
        expect(result.detail).toBe('All clear');
        expect(result.pendingCount).toBe(0);
    });

    it('reports "Critical" when encryption is configured but recovery codes are not saved AND no Trusted Circle', () => {
        const result = summarisePosture(
            merge({ recoveryCodesSeen: false, trustedCircle: false }),
        );
        expect(result.state).toBe('critical');
        expect(result.label).toBe('Critical');
        expect(result.detail).toContain('Recovery codes not saved');
        expect(result.target).toBe('/settings/sign-in-and-recovery');
    });

    it('does NOT report critical if Trusted Circle is configured (recovery path exists)', () => {
        const result = summarisePosture(
            merge({ recoveryCodesSeen: false, trustedCircle: true }),
        );
        expect(result.state).not.toBe('critical');
    });

    it('does NOT report critical before encryption is configured (no master key to lose)', () => {
        const result = summarisePosture(
            merge({
                encryptionConfigured: false,
                recoveryCodesSeen: false,
                trustedCircle: false,
            }),
        );
        expect(result.state).not.toBe('critical');
    });

    it('critical outranks 2FA-off (irreversible loss > reversible takeover risk)', () => {
        const result = summarisePosture(
            merge({
                twoFa: false,
                recoveryCodesSeen: false,
                trustedCircle: false,
            }),
        );
        expect(result.state).toBe('critical');
    });

    it('reports "Needs attention" when 2FA is off but recovery is in place', () => {
        const result = summarisePosture(merge({ twoFa: false }));
        expect(result.state).toBe('needs-attention');
        expect(result.label).toBe('Needs attention');
        expect(result.target).toBe('/settings/sign-in-and-recovery');
    });

    it('reports "Good · 1 check left" when only signature keys are missing', () => {
        const result = summarisePosture(merge({ signatureKeys: false }));
        expect(result.state).toBe('good');
        expect(result.detail).toBe('1 check left');
        expect(result.target).toBe('/settings/encryption');
        expect(result.pendingCount).toBe(1);
    });

    it('reports "Good · 1 check left" when only Trusted Circle is missing (recovery codes saved keeps it non-critical)', () => {
        const result = summarisePosture(
            merge({ trustedCircle: false, recoveryCodesSeen: true }),
        );
        expect(result.state).toBe('good');
        expect(result.detail).toBe('1 check left');
        expect(result.target).toBe('/settings/encryption');
    });

    it('reports "Good · 2 checks left" when both optional gaps are open and recovery is acknowledged', () => {
        const result = summarisePosture(
            merge({
                trustedCircle: false,
                signatureKeys: false,
                recoveryCodesSeen: true,
            }),
        );
        expect(result.state).toBe('good');
        expect(result.detail).toBe('2 checks left');
        expect(result.pendingCount).toBe(2);
    });

    it('points the action at the first open optional issue (Trusted Circle before signature keys)', () => {
        const result = summarisePosture(
            merge({
                trustedCircle: false,
                signatureKeys: false,
                recoveryCodesSeen: true,
            }),
        );
        expect(result.target).toBe('/settings/encryption');
    });
});
