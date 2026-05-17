/**
 * internalReducer — reducer contract tests.
 *
 * Pure unit tests for the internal work-pipeline reducer. The external
 * gating states (idle/awaitingUnlock/awaitingSignerKey) are derived in
 * `useFileDecryption` from props + internal state and tested there.
 */
import { describe, it, expect } from 'vitest';
import { VaultError } from '@stenvault/shared/errors';
import {
    internalReducer,
    initialInternalState,
    type InternalState,
    type InternalAction,
} from './previewMachine';
import { isWaitingForUnlock, isTerminal, canRetry } from './selectors';

function err(): VaultError {
    return new VaultError('FILE_CORRUPT', { layer: 'test' });
}

describe('internalReducer — reset and failure are priority', () => {
    const nonIdleStates: InternalState[] = [
        { kind: 'fetchingMetadata' },
        { kind: 'verifyingSignature' },
        { kind: 'decrypting', progress: 42 },
        { kind: 'ready', blobUrl: 'blob:x' },
        { kind: 'failed', error: err() },
    ];

    it('RESET returns to idle from every state', () => {
        for (const s of nonIdleStates) {
            expect(internalReducer(s, { type: 'RESET' })).toEqual({ kind: 'idle' });
        }
    });

    it('FAILED transitions to failed from every state', () => {
        const e = err();
        for (const s of [initialInternalState, ...nonIdleStates]) {
            const next = internalReducer(s, { type: 'FAILED', error: e });
            expect(next.kind).toBe('failed');
            expect((next as { kind: 'failed'; error: VaultError }).error).toBe(e);
        }
    });

    it('RESET stays referentially stable when already idle', () => {
        expect(internalReducer(initialInternalState, { type: 'RESET' })).toBe(initialInternalState);
    });
});

describe('internalReducer — happy path: unsigned file', () => {
    it('idle → fetchingMetadata → decrypting → ready', () => {
        let s: InternalState = initialInternalState;
        s = internalReducer(s, { type: 'FETCH_STARTED' });
        expect(s).toEqual({ kind: 'fetchingMetadata' });

        s = internalReducer(s, { type: 'URL_RESOLVED' });
        expect(s).toEqual({ kind: 'decrypting', progress: 0 });

        s = internalReducer(s, { type: 'DECRYPT_PROGRESS', progress: 25 });
        expect(s).toEqual({ kind: 'decrypting', progress: 25 });

        s = internalReducer(s, { type: 'DECRYPT_PROGRESS', progress: 80 });
        expect(s).toEqual({ kind: 'decrypting', progress: 80 });

        s = internalReducer(s, { type: 'DECRYPT_SUCCESS', blobUrl: 'blob:abc' });
        expect(s).toEqual({ kind: 'ready', blobUrl: 'blob:abc' });
    });
});

describe('internalReducer — happy path: signed file', () => {
    it('idle → fetchingMetadata → verifyingSignature → decrypting → ready', () => {
        let s: InternalState = initialInternalState;
        s = internalReducer(s, { type: 'FETCH_STARTED' });
        s = internalReducer(s, { type: 'VERIFY_STARTED' });
        expect(s).toEqual({ kind: 'verifyingSignature' });

        s = internalReducer(s, { type: 'SIGNATURE_VERIFIED' });
        expect(s).toEqual({ kind: 'decrypting', progress: 0 });

        s = internalReducer(s, { type: 'DECRYPT_PROGRESS', progress: 50 });
        s = internalReducer(s, { type: 'DECRYPT_SUCCESS', blobUrl: 'blob:signed' });
        expect(s).toEqual({ kind: 'ready', blobUrl: 'blob:signed' });
    });
});

describe('internalReducer — illegal transitions are no-ops', () => {
    it('DECRYPT_SUCCESS from idle → idle (no blob emitted)', () => {
        expect(internalReducer(initialInternalState, { type: 'DECRYPT_SUCCESS', blobUrl: 'x' })).toBe(
            initialInternalState,
        );
    });

    it('VERIFY_STARTED from ready → ready', () => {
        const s: InternalState = { kind: 'ready', blobUrl: 'b' };
        expect(internalReducer(s, { type: 'VERIFY_STARTED' })).toBe(s);
    });

    it('URL_RESOLVED from decrypting → decrypting (unchanged)', () => {
        const s: InternalState = { kind: 'decrypting', progress: 10 };
        expect(internalReducer(s, { type: 'URL_RESOLVED' })).toBe(s);
    });

    it('DECRYPT_PROGRESS from fetchingMetadata → fetchingMetadata', () => {
        const s: InternalState = { kind: 'fetchingMetadata' };
        expect(internalReducer(s, { type: 'DECRYPT_PROGRESS', progress: 50 })).toBe(s);
    });

    it('FETCH_STARTED from non-idle is a no-op', () => {
        const s: InternalState = { kind: 'decrypting', progress: 10 };
        expect(internalReducer(s, { type: 'FETCH_STARTED' })).toBe(s);
    });
});

describe('internalReducer — purity', () => {
    it('same (state, action) pair produces equal output across calls', () => {
        const e = err();
        const cases: Array<[InternalState, InternalAction]> = [
            [initialInternalState, { type: 'FETCH_STARTED' }],
            [{ kind: 'fetchingMetadata' }, { type: 'VERIFY_STARTED' }],
            [{ kind: 'verifyingSignature' }, { type: 'SIGNATURE_VERIFIED' }],
            [{ kind: 'decrypting', progress: 5 }, { type: 'DECRYPT_PROGRESS', progress: 75 }],
            [{ kind: 'decrypting', progress: 75 }, { type: 'DECRYPT_SUCCESS', blobUrl: 'x' }],
            [{ kind: 'ready', blobUrl: 'r' }, { type: 'RESET' }],
            [{ kind: 'failed', error: e }, { type: 'RESET' }],
        ];
        for (const [s, a] of cases) {
            const out1 = internalReducer(s, a);
            const out2 = internalReducer(s, a);
            expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
        }
    });
});

describe('selectors — operate on the external PreviewState union', () => {
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
