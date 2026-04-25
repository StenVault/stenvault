/**
 * VaultError — typed error boundary for internal modules.
 *
 * Internal crypto, worker, and network modules throw `VaultError` with a
 * stable `code`. The UI layer (apps/web) translates codes into curated
 * copy via `toUserMessage(err)` (added in PR-2). Consumers never read
 * `err.message` directly — raw messages may contain internal jargon
 * ("Worker", "WASM", "CVEF") that does not belong in user copy.
 *
 * Structured clone (Worker postMessage) note: the HTML structured clone
 * algorithm preserves the `Error` shape (name, message) but drops custom
 * own properties like `code` and `context`, and loses subclass identity on
 * the receiver. Workers should serialize via `toJSON()` before posting
 * and rehydrate via `VaultError.fromJSON()` on receive.
 */
import type { ErrorCode } from './codes';

/** Plain-object shape of a serialized `VaultError`. Safe for structured clone + JSON. */
export interface SerializedVaultError {
    readonly __vaultError: true;
    readonly code: ErrorCode;
    readonly context: Readonly<Record<string, unknown>>;
    readonly message: string;
}

export class VaultError extends Error {
    public readonly code: ErrorCode;
    public readonly context: Readonly<Record<string, unknown>>;

    constructor(
        code: ErrorCode,
        context?: Record<string, unknown>,
        options?: { cause?: unknown },
    ) {
        // `code` doubles as the default message — useful in debug logs and
        // when the error falls through to a generic handler. Never user-visible.
        super(code, options);

        // ES2022 sets `name` on the base Error; subclass name must be set explicitly.
        this.name = 'VaultError';

        this.code = code;
        // Freeze so a downstream catcher cannot mutate the diagnostic context
        // between throw and log. Spread guards against callers freezing their own input.
        this.context = Object.freeze({ ...(context ?? {}) });

        // Preserve prototype chain after transpile — without this, `instanceof VaultError`
        // can fail in older targets. Harmless in ES2022 but consistent across build configs.
        Object.setPrototypeOf(this, new.target.prototype);
    }

    /**
     * Serialize to a plain object safe for `structuredClone` and `JSON.stringify`.
     * Use this when sending an error across a Worker boundary.
     */
    toJSON(): SerializedVaultError {
        return {
            __vaultError: true,
            code: this.code,
            context: this.context,
            message: this.message,
        };
    }

    /**
     * Idempotent wrapper. If `err` is already a `VaultError`, returns it
     * unchanged (the original code wins — do not silently override). Otherwise
     * constructs a new `VaultError` with `err` preserved as `cause`.
     */
    static wrap(
        err: unknown,
        code: ErrorCode,
        context?: Record<string, unknown>,
    ): VaultError {
        if (err instanceof VaultError) return err;
        return new VaultError(code, context, { cause: err });
    }

    /** Runtime type guard — strict `instanceof` check. */
    static isVaultError(value: unknown): value is VaultError {
        return value instanceof VaultError;
    }

    /**
     * Rehydrate a `VaultError` from its `SerializedVaultError` shape
     * (e.g. after `structuredClone` or `JSON.parse`). Returns `null` if
     * the input is not a recognised serialization.
     *
     * The `code` is NOT validated against the current `ErrorCode` union —
     * a newer sender might ship an unknown code. Callers should treat
     * unknown codes as `UNKNOWN` via their translator.
     */
    static fromJSON(value: unknown): VaultError | null {
        if (
            typeof value !== 'object' ||
            value === null ||
            !('__vaultError' in value) ||
            (value as { __vaultError: unknown }).__vaultError !== true ||
            !('code' in value) ||
            typeof (value as { code: unknown }).code !== 'string'
        ) {
            return null;
        }

        const o = value as {
            code: string;
            context?: Record<string, unknown>;
            message?: unknown;
        };

        const err = new VaultError(
            o.code as ErrorCode,
            o.context && typeof o.context === 'object' ? o.context : undefined,
        );

        // Preserve a custom message if the sender had one different from the code.
        if (typeof o.message === 'string' && o.message !== o.code) {
            Object.defineProperty(err, 'message', {
                value: o.message,
                writable: false,
                configurable: true,
            });
        }

        return err;
    }
}
