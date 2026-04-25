/**
 * UI error translator.
 *
 * Turns a caught value (`VaultError`, raw `Error`, or anything else) into
 * curated `{ title, description }` copy for toasts, inline error views,
 * and alert dialogs. Internal modules throw `VaultError` (see
 * `@stenvault/shared/errors`); the UI reads copy from here rather than
 * from `err.message`, which may contain jargon like "Worker" or "WASM"
 * that does not belong in user-facing text.
 *
 * Paired with `./toast.ts` — the wrapper's `description` slot accepts
 * only `UiDescription`, so raw strings cannot leak through.
 */
import type { ErrorCode } from '@stenvault/shared/errors';
import { VaultError } from '@stenvault/shared/errors';
import { debugError } from '@/lib/debugLogger';

declare const uiTitleBrand: unique symbol;
declare const uiDescriptionBrand: unique symbol;

export type UiTitle = string & { readonly [uiTitleBrand]: true };
export type UiDescription = string & { readonly [uiDescriptionBrand]: true };

export interface UiMessage {
    readonly title: UiTitle;
    readonly description: UiDescription;
}

/** Brand a literal for a static toast title (non-error-derived copy). */
export function uiTitle(literal: string): UiTitle {
    return literal as UiTitle;
}

/** Brand a literal for a static toast description (non-error-derived copy). */
export function uiDescription(literal: string): UiDescription {
    return literal as UiDescription;
}

const UNKNOWN_COPY = {
    title: 'Something went wrong',
    description: 'Try again. If it keeps happening, refresh the page.',
} as const;

const MESSAGES: Record<ErrorCode, { title: string; description: string }> = {
    INTEGRITY_FAILED: {
        title: 'This file looks tampered with',
        description: "The integrity check failed. Don't open it — it may have been altered.",
    },
    WRONG_MASTER_PASSWORD: {
        title: "That password didn't work",
        description: 'Check the spelling and try again.',
    },
    SIGNATURE_INVALID: {
        title: "We couldn't verify the signer",
        description: "The signature doesn't match. Treat this file with caution.",
    },
    KEY_UNAVAILABLE: {
        title: 'Vault is locked',
        description: 'Unlock your vault to preview this file.',
    },
    UNSUPPORTED_ENCRYPTION_VERSION: {
        title: 'Unsupported file format',
        description: 'This file was saved in a format this version of the app cannot open.',
    },
    FILE_CORRUPT: {
        title: "This file didn't open",
        description: 'Something is off with the data. If you have a backup, try that copy.',
    },
    FILE_TOO_LARGE: {
        title: 'File is too large',
        description: 'It exceeds what the browser can handle. Try the desktop or mobile app.',
    },
    MISSING_METADATA: {
        title: 'This file is incomplete',
        description: 'Some data we need to open it is missing.',
    },
    INFRA_WORKER_FAILED: UNKNOWN_COPY,
    INFRA_WASM_FAILED: UNKNOWN_COPY,
    INFRA_NETWORK: {
        title: "You're offline",
        description: 'Check your connection and try again.',
    },
    INFRA_TIMEOUT: {
        title: 'That took too long',
        description: 'The operation timed out. Try again in a moment.',
    },
    INFRA_SW_UNAVAILABLE: {
        title: "Streaming isn't ready",
        description: 'Refresh the page and try again.',
    },
    UNKNOWN: UNKNOWN_COPY,
};

/**
 * Translate a caught value into user-facing copy.
 *
 * - `VaultError` with a known `code` → curated copy for that code
 * - `VaultError` with an unknown code (e.g. from a newer sender rehydrated
 *   via `VaultError.fromJSON`) → `UNKNOWN` fallback, no throw
 * - Any other value (plain `Error`, string, null, etc.) → `UNKNOWN` fallback,
 *   logged via `debugError` so we can diagnose untyped throws in dev
 */
export function toUserMessage(err: unknown): UiMessage {
    if (VaultError.isVaultError(err)) {
        const copy = MESSAGES[err.code] ?? UNKNOWN_COPY;
        return {
            title: copy.title as UiTitle,
            description: copy.description as UiDescription,
        };
    }
    debugError('[toUserMessage]', 'Untyped error reached UI boundary', err);
    return {
        title: UNKNOWN_COPY.title as UiTitle,
        description: UNKNOWN_COPY.description as UiDescription,
    };
}
