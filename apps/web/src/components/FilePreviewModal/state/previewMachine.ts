/**
 * Preview state shapes for the file-preview hook.
 *
 * The hook maintains two slices:
 *
 *  - **External** (`PreviewState`) — what UI consumers see. Derived purely
 *    from inputs in the hook (isOpen, isUnlocked, sigKeyReady, encryptionVersion,
 *    skipBlobDecryption, internal). Pure derivation means the external state
 *    cannot get "stuck" because some imperative dispatch was missed in an
 *    early-return branch — that was the original bug class.
 *
 *  - **Internal** (`InternalState`) — only the sequential async work pipeline
 *    (fetch → verify → decrypt → ready/failed). Vault-lock and signer-gate
 *    transitions are NOT here; they live in the derivation.
 *
 * Invariants:
 *  - Illegal (state, action) pairs return the previous reference unchanged.
 */
import type { VaultError } from '@stenvault/shared/errors';

/**
 * External state union — the kinds consumers receive via `DecryptionState['kind']`.
 * Derived in the hook from props + internal state. Not produced by a reducer.
 */
export type PreviewState =
    | { kind: 'idle' }
    | { kind: 'awaitingUnlock' }
    | { kind: 'awaitingSignerKey' }
    | { kind: 'fetchingMetadata' }
    | { kind: 'verifyingSignature' }
    | { kind: 'decrypting'; progress: number }
    | { kind: 'ready'; blobUrl: string }
    | { kind: 'failed'; error: VaultError };

/**
 * Internal reducer state — only the async work pipeline.
 */
export type InternalState =
    | { kind: 'idle' }
    | { kind: 'fetchingMetadata' }
    | { kind: 'verifyingSignature' }
    | { kind: 'decrypting'; progress: number }
    | { kind: 'ready'; blobUrl: string }
    | { kind: 'failed'; error: VaultError };

export type InternalAction =
    | { type: 'RESET' }
    | { type: 'FETCH_STARTED' }
    | { type: 'VERIFY_STARTED' }
    | { type: 'SIGNATURE_VERIFIED' }
    | { type: 'URL_RESOLVED' }
    | { type: 'DECRYPT_PROGRESS'; progress: number }
    | { type: 'DECRYPT_SUCCESS'; blobUrl: string }
    | { type: 'FAILED'; error: VaultError };

export const initialInternalState: InternalState = { kind: 'idle' };

export function internalReducer(state: InternalState, action: InternalAction): InternalState {
    switch (action.type) {
        case 'RESET':
            return state.kind === 'idle' ? state : { kind: 'idle' };

        case 'FAILED':
            return { kind: 'failed', error: action.error };

        case 'FETCH_STARTED':
            return state.kind === 'idle' ? { kind: 'fetchingMetadata' } : state;

        case 'VERIFY_STARTED':
            return state.kind === 'fetchingMetadata' ? { kind: 'verifyingSignature' } : state;

        case 'SIGNATURE_VERIFIED':
            return state.kind === 'verifyingSignature' ? { kind: 'decrypting', progress: 0 } : state;

        case 'URL_RESOLVED':
            return state.kind === 'fetchingMetadata' ? { kind: 'decrypting', progress: 0 } : state;

        case 'DECRYPT_PROGRESS':
            return state.kind === 'decrypting' ? { kind: 'decrypting', progress: action.progress } : state;

        case 'DECRYPT_SUCCESS':
            return state.kind === 'decrypting' ? { kind: 'ready', blobUrl: action.blobUrl } : state;

        default: {
            const _exhaustive: never = action;
            return state;
        }
    }
}
