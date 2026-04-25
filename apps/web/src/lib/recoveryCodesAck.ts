/**
 * Per-device acknowledgement that the user has saved their recovery codes.
 *
 * Server only stores HMAC hashes of recovery codes — once codes are generated,
 * the plain text exists only in the browser tab that generated them. We need a
 * UX signal for "did the user export those codes somewhere durable on THIS
 * device" so the Settings UI can stop falsely affirming "10 / 10 remaining" as
 * if it were a green-light state.
 *
 * Trade-off: per-device localStorage produces a false positive when the user
 * saved codes on another device or wiped browser storage. We accept that — over-
 * warning about an irreversible loss is cheaper than under-warning. Server-side
 * tracking is the long-term home (see refactor backlog).
 */
const RECOVERY_CODES_ACKED_KEY = 'recovery_codes_acked_v1';

export function markRecoveryCodesAcknowledged(): void {
    try {
        localStorage.setItem(RECOVERY_CODES_ACKED_KEY, new Date().toISOString());
    } catch {
        // Storage unavailable (private mode quota / disabled) — silent no-op:
        // worst case the user sees a "not saved" warning they can dismiss by
        // re-saving, which is the safer side of this trade-off.
    }
}

export function hasAcknowledgedRecoveryCodes(): boolean {
    try {
        return localStorage.getItem(RECOVERY_CODES_ACKED_KEY) !== null;
    } catch {
        return false;
    }
}

export function clearRecoveryCodesAck(): void {
    try {
        localStorage.removeItem(RECOVERY_CODES_ACKED_KEY);
    } catch {
        // ignore
    }
}
