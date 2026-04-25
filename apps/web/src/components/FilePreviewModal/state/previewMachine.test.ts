/**
 * previewMachine — reducer contract tests.
 *
 * Pure unit tests. No React, no async, no mocks.
 */
import { describe, it, expect } from 'vitest';
import { VaultError } from '@stenvault/shared/errors';
import {
    previewReducer,
    initialPreviewState,
    type PreviewState,
    type PreviewAction,
} from './previewMachine';
import { isWaitingForUnlock, isTerminal, canRetry } from './selectors';

function err(): VaultError {
    return new VaultError('FILE_CORRUPT', { layer: 'test' });
}

describe('previewReducer — priority actions', () => {
    const nonTrivialStates: PreviewState[] = [
        { kind: 'awaitingUnlock' },
        { kind: 'awaitingSignerKey' },
        { kind: 'fetchingMetadata' },
        { kind: 'verifyingSignature' },
        { kind: 'decrypting', progress: 42 },
        { kind: 'ready', blobUrl: 'blob:x' },
        { kind: 'failed', error: err() },
    ];

    it('MODAL_CLOSED returns to idle from every state', () => {
        for (const s of nonTrivialStates) {
            expect(previewReducer(s, { type: 'MODAL_CLOSED' })).toEqual({ kind: 'idle' });
        }
    });

    it('FILE_CHANGED returns to idle from every state', () => {
        for (const s of nonTrivialStates) {
            expect(previewReducer(s, { type: 'FILE_CHANGED' })).toEqual({ kind: 'idle' });
        }
    });

    it('FAILED transitions to failed from every state', () => {
        const e = err();
        for (const s of [initialPreviewState, ...nonTrivialStates]) {
            const next = previewReducer(s, { type: 'FAILED', error: e });
            expect(next.kind).toBe('failed');
            expect((next as { kind: 'failed'; error: VaultError }).error).toBe(e);
        }
    });

    it('VAULT_LOCKED transitions to awaitingUnlock from every state', () => {
        for (const s of [initialPreviewState, ...nonTrivialStates]) {
            const next = previewReducer(s, { type: 'VAULT_LOCKED' });
            expect(next.kind).toBe('awaitingUnlock');
        }
    });

    it('VAULT_LOCKED stays referentially stable when already awaitingUnlock', () => {
        const s: PreviewState = { kind: 'awaitingUnlock' };
        expect(previewReducer(s, { type: 'VAULT_LOCKED' })).toBe(s);
    });

    it('MODAL_CLOSED stays referentially stable when already idle', () => {
        expect(previewReducer(initialPreviewState, { type: 'MODAL_CLOSED' })).toBe(initialPreviewState);
    });
});

describe('previewReducer — happy path: unsigned file', () => {
    it('idle → fetchingMetadata → decrypting → ready via MODAL_OPENED / URL_RESOLVED / progress / DECRYPT_SUCCESS', () => {
        let s: PreviewState = initialPreviewState;
        s = previewReducer(s, { type: 'MODAL_OPENED' });
        expect(s).toEqual({ kind: 'fetchingMetadata' });

        s = previewReducer(s, { type: 'URL_RESOLVED' });
        expect(s).toEqual({ kind: 'decrypting', progress: 0 });

        s = previewReducer(s, { type: 'DECRYPT_PROGRESS', progress: 25 });
        expect(s).toEqual({ kind: 'decrypting', progress: 25 });

        s = previewReducer(s, { type: 'DECRYPT_PROGRESS', progress: 80 });
        expect(s).toEqual({ kind: 'decrypting', progress: 80 });

        s = previewReducer(s, { type: 'DECRYPT_SUCCESS', blobUrl: 'blob:abc' });
        expect(s).toEqual({ kind: 'ready', blobUrl: 'blob:abc' });
    });
});

describe('previewReducer — happy path: signed file', () => {
    it('idle → fetchingMetadata → verifyingSignature → decrypting → ready', () => {
        let s: PreviewState = initialPreviewState;
        s = previewReducer(s, { type: 'MODAL_OPENED' });
        s = previewReducer(s, { type: 'VERIFY_STARTED' });
        expect(s).toEqual({ kind: 'verifyingSignature' });

        s = previewReducer(s, { type: 'SIGNATURE_VERIFIED' });
        expect(s).toEqual({ kind: 'decrypting', progress: 0 });

        s = previewReducer(s, { type: 'DECRYPT_PROGRESS', progress: 50 });
        s = previewReducer(s, { type: 'DECRYPT_SUCCESS', blobUrl: 'blob:signed' });
        expect(s).toEqual({ kind: 'ready', blobUrl: 'blob:signed' });
    });
});

describe('previewReducer — lock/signer recovery', () => {
    it('awaitingUnlock + VAULT_UNLOCKED → fetchingMetadata', () => {
        const s: PreviewState = { kind: 'awaitingUnlock' };
        expect(previewReducer(s, { type: 'VAULT_UNLOCKED' })).toEqual({ kind: 'fetchingMetadata' });
    });

    it('awaitingSignerKey + SIGNER_KEY_READY → fetchingMetadata', () => {
        const s: PreviewState = { kind: 'awaitingSignerKey' };
        expect(previewReducer(s, { type: 'SIGNER_KEY_READY' })).toEqual({ kind: 'fetchingMetadata' });
    });

    it('idle + SIGNER_KEY_WAITING → awaitingSignerKey', () => {
        expect(previewReducer(initialPreviewState, { type: 'SIGNER_KEY_WAITING' })).toEqual({
            kind: 'awaitingSignerKey',
        });
    });

    it('awaitingUnlock + SIGNER_KEY_WAITING → awaitingSignerKey', () => {
        const s: PreviewState = { kind: 'awaitingUnlock' };
        expect(previewReducer(s, { type: 'SIGNER_KEY_WAITING' })).toEqual({
            kind: 'awaitingSignerKey',
        });
    });
});

describe('previewReducer — illegal transitions are no-ops', () => {
    it('DECRYPT_SUCCESS from idle → idle (no blob emitted)', () => {
        expect(previewReducer(initialPreviewState, { type: 'DECRYPT_SUCCESS', blobUrl: 'x' })).toBe(
            initialPreviewState,
        );
    });

    it('VERIFY_STARTED from ready → ready', () => {
        const s: PreviewState = { kind: 'ready', blobUrl: 'b' };
        expect(previewReducer(s, { type: 'VERIFY_STARTED' })).toBe(s);
    });

    it('URL_RESOLVED from decrypting → decrypting (unchanged)', () => {
        const s: PreviewState = { kind: 'decrypting', progress: 10 };
        expect(previewReducer(s, { type: 'URL_RESOLVED' })).toBe(s);
    });

    it('SIGNER_KEY_READY from decrypting → decrypting', () => {
        const s: PreviewState = { kind: 'decrypting', progress: 10 };
        expect(previewReducer(s, { type: 'SIGNER_KEY_READY' })).toBe(s);
    });

    it('DECRYPT_PROGRESS from fetchingMetadata → fetchingMetadata', () => {
        const s: PreviewState = { kind: 'fetchingMetadata' };
        expect(previewReducer(s, { type: 'DECRYPT_PROGRESS', progress: 50 })).toBe(s);
    });
});

describe('previewReducer — purity', () => {
    it('same (state, action) pair produces equal output across calls', () => {
        const e = err();
        const cases: Array<[PreviewState, PreviewAction]> = [
            [initialPreviewState, { type: 'MODAL_OPENED' }],
            [{ kind: 'awaitingUnlock' }, { type: 'VAULT_UNLOCKED' }],
            [{ kind: 'fetchingMetadata' }, { type: 'VERIFY_STARTED' }],
            [{ kind: 'verifyingSignature' }, { type: 'SIGNATURE_VERIFIED' }],
            [{ kind: 'decrypting', progress: 5 }, { type: 'DECRYPT_PROGRESS', progress: 75 }],
            [{ kind: 'decrypting', progress: 75 }, { type: 'DECRYPT_SUCCESS', blobUrl: 'x' }],
            [{ kind: 'ready', blobUrl: 'r' }, { type: 'VAULT_LOCKED' }],
            [{ kind: 'failed', error: e }, { type: 'FILE_CHANGED' }],
            [{ kind: 'idle' }, { type: 'SIGNER_KEY_WAITING' }],
            [{ kind: 'awaitingSignerKey' }, { type: 'SIGNER_KEY_READY' }],
        ];
        for (const [s, a] of cases) {
            const out1 = previewReducer(s, a);
            const out2 = previewReducer(s, a);
            expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
        }
    });
});

describe('selectors', () => {
    it('isWaitingForUnlock', () => {
        expect(isWaitingForUnlock({ kind: 'awaitingUnlock' })).toBe(true);
        expect(isWaitingForUnlock({ kind: 'idle' })).toBe(false);
        expect(isWaitingForUnlock({ kind: 'ready', blobUrl: 'x' })).toBe(false);
    });

    it('isTerminal', () => {
        expect(isTerminal({ kind: 'ready', blobUrl: 'x' })).toBe(true);
        expect(isTerminal({ kind: 'failed', error: err() })).toBe(true);
        expect(isTerminal({ kind: 'idle' })).toBe(false);
        expect(isTerminal({ kind: 'decrypting', progress: 10 })).toBe(false);
    });

    it('canRetry', () => {
        expect(canRetry({ kind: 'failed', error: err() })).toBe(true);
        expect(canRetry({ kind: 'ready', blobUrl: 'x' })).toBe(false);
        expect(canRetry({ kind: 'idle' })).toBe(false);
    });
});
