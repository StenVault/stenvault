/**
 * Preview state machine.
 *
 * A pure reducer governing the file-preview lifecycle. The host hook
 * (`useFileDecryption`) translates props into actions and runs a
 * side-effect handler when the reducer enters `fetchingMetadata`.
 *
 * Invariants:
 * - Illegal `(state, action)` pairs return the previous `state` reference
 *   unchanged — never throws. React can safely bail out of a re-render.
 * - `MODAL_CLOSED`, `FILE_CHANGED`, `FAILED`, `VAULT_LOCKED` are priority
 *   actions that apply from every state (with one exception: `VAULT_LOCKED`
 *   in `ready` still transitions to `awaitingUnlock` — locking the vault
 *   while viewing a file closes the preview).
 */
import type { VaultError } from '@stenvault/shared/errors';

export type PreviewState =
    | { kind: 'idle' }
    | { kind: 'awaitingUnlock' }
    | { kind: 'awaitingSignerKey' }
    | { kind: 'fetchingMetadata' }
    | { kind: 'verifyingSignature' }
    | { kind: 'decrypting'; progress: number }
    | { kind: 'ready'; blobUrl: string }
    | { kind: 'failed'; error: VaultError };

export type PreviewAction =
    | { type: 'MODAL_OPENED' }
    | { type: 'MODAL_CLOSED' }
    | { type: 'VAULT_LOCKED' }
    | { type: 'VAULT_UNLOCKED' }
    | { type: 'SIGNER_KEY_WAITING' }
    | { type: 'SIGNER_KEY_READY' }
    | { type: 'VERIFY_STARTED' }
    | { type: 'SIGNATURE_VERIFIED' }
    | { type: 'URL_RESOLVED' }
    | { type: 'DECRYPT_PROGRESS'; progress: number }
    | { type: 'DECRYPT_SUCCESS'; blobUrl: string }
    | { type: 'FAILED'; error: VaultError }
    | { type: 'FILE_CHANGED' };

export const initialPreviewState: PreviewState = { kind: 'idle' };

export function previewReducer(state: PreviewState, action: PreviewAction): PreviewState {
    switch (action.type) {
        case 'MODAL_CLOSED':
        case 'FILE_CHANGED':
            return state.kind === 'idle' ? state : { kind: 'idle' };

        case 'FAILED':
            return { kind: 'failed', error: action.error };

        case 'VAULT_LOCKED':
            return state.kind === 'awaitingUnlock' ? state : { kind: 'awaitingUnlock' };

        case 'MODAL_OPENED':
            return state.kind === 'idle' ? { kind: 'fetchingMetadata' } : state;

        case 'VAULT_UNLOCKED':
            return state.kind === 'awaitingUnlock' ? { kind: 'fetchingMetadata' } : state;

        case 'SIGNER_KEY_WAITING':
            return state.kind === 'idle' || state.kind === 'awaitingUnlock'
                ? { kind: 'awaitingSignerKey' }
                : state;

        case 'SIGNER_KEY_READY':
            return state.kind === 'awaitingSignerKey' ? { kind: 'fetchingMetadata' } : state;

        case 'VERIFY_STARTED':
            return state.kind === 'fetchingMetadata' ? { kind: 'verifyingSignature' } : state;

        case 'SIGNATURE_VERIFIED':
            return state.kind === 'verifyingSignature'
                ? { kind: 'decrypting', progress: 0 }
                : state;

        case 'URL_RESOLVED':
            return state.kind === 'fetchingMetadata'
                ? { kind: 'decrypting', progress: 0 }
                : state;

        case 'DECRYPT_PROGRESS':
            return state.kind === 'decrypting'
                ? { kind: 'decrypting', progress: action.progress }
                : state;

        case 'DECRYPT_SUCCESS':
            return state.kind === 'decrypting'
                ? { kind: 'ready', blobUrl: action.blobUrl }
                : state;

        default: {
            const _exhaustive: never = action;
            return state;
        }
    }
}
