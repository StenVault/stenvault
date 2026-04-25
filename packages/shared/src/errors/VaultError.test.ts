/**
 * VaultError tests — construction, wrap idempotency, serialization.
 */

import { describe, it, expect } from 'vitest';
import { VaultError, type SerializedVaultError } from './VaultError';
import type { ErrorCode } from './codes';

describe('VaultError construction', () => {
    it('sets code as default message when no message is provided', () => {
        const err = new VaultError('INFRA_TIMEOUT');
        expect(err.message).toBe('INFRA_TIMEOUT');
        expect(err.code).toBe('INFRA_TIMEOUT');
    });

    it('defaults context to an empty frozen object', () => {
        const err = new VaultError('UNKNOWN');
        expect(err.context).toEqual({});
        expect(Object.isFrozen(err.context)).toBe(true);
    });

    it('preserves and freezes the context payload', () => {
        const err = new VaultError('INFRA_WORKER_FAILED', {
            op: 'decrypt',
            fileId: 42,
        });
        expect(err.context).toEqual({ op: 'decrypt', fileId: 42 });
        expect(Object.isFrozen(err.context)).toBe(true);
        // Mutation must throw in strict mode / be silently ignored
        expect(() => {
            (err.context as Record<string, unknown>).op = 'tampered';
        }).toThrow();
        expect(err.context.op).toBe('decrypt');
    });

    it('freezes even when the caller passes an already-frozen object', () => {
        const input = Object.freeze({ op: 'encrypt' });
        const err = new VaultError('INFRA_TIMEOUT', input);
        // We spread internally, so our copy is frozen independently
        expect(Object.isFrozen(err.context)).toBe(true);
        expect(err.context).toEqual({ op: 'encrypt' });
    });

    it('attaches a cause when provided via options', () => {
        const root = new TypeError('underlying');
        const err = new VaultError('INFRA_NETWORK', undefined, { cause: root });
        expect(err.cause).toBe(root);
    });

    it('sets name to "VaultError" (not the base "Error")', () => {
        const err = new VaultError('UNKNOWN');
        expect(err.name).toBe('VaultError');
    });

    it('satisfies instanceof for both VaultError and Error', () => {
        const err = new VaultError('FILE_CORRUPT');
        expect(err).toBeInstanceOf(VaultError);
        expect(err).toBeInstanceOf(Error);
    });

    it('captures a stack trace', () => {
        const err = new VaultError('UNKNOWN');
        expect(typeof err.stack).toBe('string');
        expect(err.stack).toContain('VaultError');
    });
});

describe('VaultError.wrap', () => {
    it('returns the same instance when wrapping an existing VaultError', () => {
        const original = new VaultError('INTEGRITY_FAILED', { layer: 'manifest' });
        const wrapped = VaultError.wrap(original, 'INFRA_WORKER_FAILED');
        expect(wrapped).toBe(original);
        // Original code wins — do not silently override
        expect(wrapped.code).toBe('INTEGRITY_FAILED');
    });

    it('wraps a plain Error with cause preserved', () => {
        const root = new Error('fetch failed');
        const wrapped = VaultError.wrap(root, 'INFRA_NETWORK', { url: '/api' });
        expect(wrapped).toBeInstanceOf(VaultError);
        expect(wrapped.code).toBe('INFRA_NETWORK');
        expect(wrapped.cause).toBe(root);
        expect(wrapped.context).toEqual({ url: '/api' });
    });

    it('wraps a DOMException with cause preserved', () => {
        const root = new DOMException('Aborted', 'AbortError');
        const wrapped = VaultError.wrap(root, 'INFRA_TIMEOUT');
        expect(wrapped).toBeInstanceOf(VaultError);
        expect(wrapped.cause).toBe(root);
    });

    it('wraps non-Error values (null, undefined, string, number)', () => {
        const cases: unknown[] = [null, undefined, 'oops', 404, { shape: 'plain' }];
        for (const input of cases) {
            const wrapped = VaultError.wrap(input, 'UNKNOWN');
            expect(wrapped).toBeInstanceOf(VaultError);
            expect(wrapped.code).toBe('UNKNOWN');
            expect(wrapped.cause).toBe(input);
        }
    });

    it('is idempotent across multiple wraps', () => {
        const original = new VaultError('WRONG_MASTER_PASSWORD');
        const once = VaultError.wrap(original, 'UNKNOWN');
        const twice = VaultError.wrap(once, 'INFRA_NETWORK');
        expect(twice).toBe(original);
    });
});

describe('VaultError.isVaultError', () => {
    it('returns true for VaultError instances', () => {
        expect(VaultError.isVaultError(new VaultError('UNKNOWN'))).toBe(true);
    });

    it('returns false for plain Error and non-Error values', () => {
        expect(VaultError.isVaultError(new Error('x'))).toBe(false);
        expect(VaultError.isVaultError(null)).toBe(false);
        expect(VaultError.isVaultError(undefined)).toBe(false);
        expect(VaultError.isVaultError('x')).toBe(false);
        expect(VaultError.isVaultError({ code: 'UNKNOWN' })).toBe(false);
    });

    it('narrows the type in TypeScript', () => {
        const value: unknown = new VaultError('INFRA_TIMEOUT', { op: 'test' });
        if (VaultError.isVaultError(value)) {
            // Compile-time check — if this builds, the narrowing works.
            const code: ErrorCode = value.code;
            expect(code).toBe('INFRA_TIMEOUT');
        } else {
            throw new Error('narrowing failed');
        }
    });
});

describe('VaultError.toJSON / fromJSON (Worker boundary serialization)', () => {
    it('toJSON produces a plain object with the expected shape', () => {
        const err = new VaultError('INFRA_WORKER_FAILED', { workerType: 'pqc' });
        const json = err.toJSON();
        expect(json).toEqual({
            __vaultError: true,
            code: 'INFRA_WORKER_FAILED',
            context: { workerType: 'pqc' },
            message: 'INFRA_WORKER_FAILED',
        });
    });

    it('fromJSON round-trips code, context, and custom message', () => {
        const original = new VaultError('INTEGRITY_FAILED', { layer: 'chunk' });
        const json = original.toJSON();
        const rehydrated = VaultError.fromJSON(json);
        expect(rehydrated).not.toBeNull();
        expect(rehydrated!.code).toBe('INTEGRITY_FAILED');
        expect(rehydrated!.context).toEqual({ layer: 'chunk' });
        expect(rehydrated!).toBeInstanceOf(VaultError);
    });

    it('fromJSON survives a structuredClone round-trip (postMessage simulation)', () => {
        const original = new VaultError('INFRA_TIMEOUT', { op: 'decrypt', ms: 30000 });
        const cloned = structuredClone(original.toJSON());
        const rehydrated = VaultError.fromJSON(cloned);
        expect(rehydrated).not.toBeNull();
        expect(rehydrated!.code).toBe('INFRA_TIMEOUT');
        expect(rehydrated!.context).toEqual({ op: 'decrypt', ms: 30000 });
    });

    it('fromJSON survives a JSON round-trip', () => {
        const original = new VaultError('SIGNATURE_INVALID', { reason: 'pq_mismatch' });
        const roundTripped = JSON.parse(JSON.stringify(original.toJSON())) as SerializedVaultError;
        const rehydrated = VaultError.fromJSON(roundTripped);
        expect(rehydrated).not.toBeNull();
        expect(rehydrated!.code).toBe('SIGNATURE_INVALID');
        expect(rehydrated!.context).toEqual({ reason: 'pq_mismatch' });
    });

    it('fromJSON returns null for malformed inputs', () => {
        const inputs: unknown[] = [
            null,
            undefined,
            'not an object',
            42,
            {},
            { code: 'UNKNOWN' },                            // missing __vaultError
            { __vaultError: false, code: 'UNKNOWN' },       // wrong flag
            { __vaultError: true },                         // missing code
            { __vaultError: true, code: 42 },               // code not string
        ];
        for (const input of inputs) {
            expect(VaultError.fromJSON(input)).toBeNull();
        }
    });

    it('fromJSON tolerates unknown codes (forward compatibility)', () => {
        const fromFuture: unknown = {
            __vaultError: true,
            code: 'FUTURE_CODE_NOT_YET_DEFINED',
            context: {},
            message: 'FUTURE_CODE_NOT_YET_DEFINED',
        };
        const rehydrated = VaultError.fromJSON(fromFuture);
        expect(rehydrated).not.toBeNull();
        // Preserved as-is — caller's translator is responsible for mapping to UNKNOWN
        expect(rehydrated!.code).toBe('FUTURE_CODE_NOT_YET_DEFINED');
    });
});

describe('VaultError — structured clone of the class instance (documented limitation)', () => {
    it('structuredClone drops code and context; senders must use toJSON()', () => {
        const err = new VaultError('INFRA_WORKER_FAILED', { op: 'pqc' });
        const cloned = structuredClone(err) as unknown;
        // Documents the actual runtime behavior: code/context do not survive.
        // This test is a sanity guard — if a future browser/runtime starts
        // preserving own properties, we'd want to notice and re-evaluate
        // whether toJSON/fromJSON is still necessary.
        expect((cloned as { code?: unknown }).code).toBeUndefined();
        expect((cloned as { context?: unknown }).context).toBeUndefined();
    });
});
