/**
 * Crypto Error Classes Tests
 *
 * Verifies typed error classes are properly constructed and distinguishable
 * via instanceof checks — used by download error handlers.
 */

import { describe, it, expect } from 'vitest';
import { VaultLockedError, DecryptionKeyError, FileCorruptedError } from './cryptoErrors';

describe('Crypto Error Classes', () => {
    describe('VaultLockedError', () => {
        it('should be an instance of Error', () => {
            const err = new VaultLockedError();
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(VaultLockedError);
        });

        it('should have correct name', () => {
            expect(new VaultLockedError().name).toBe('VaultLockedError');
        });

        it('should have default message', () => {
            expect(new VaultLockedError().message).toContain('Vault is locked');
        });

        it('should accept custom message', () => {
            const err = new VaultLockedError('Custom vault message');
            expect(err.message).toBe('Custom vault message');
        });

        it('should be retryable', () => {
            expect(new VaultLockedError().retryable).toBe(true);
        });
    });

    describe('DecryptionKeyError', () => {
        it('should be an instance of Error', () => {
            const err = new DecryptionKeyError();
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(DecryptionKeyError);
        });

        it('should have correct name', () => {
            expect(new DecryptionKeyError().name).toBe('DecryptionKeyError');
        });

        it('should have default message', () => {
            expect(new DecryptionKeyError().message).toContain('Decryption failed');
        });

        it('should not be retryable', () => {
            expect(new DecryptionKeyError().retryable).toBe(false);
        });

        it('should not be instanceof VaultLockedError', () => {
            const err = new DecryptionKeyError();
            expect(err).not.toBeInstanceOf(VaultLockedError);
        });
    });

    describe('FileCorruptedError', () => {
        it('should be an instance of Error', () => {
            const err = new FileCorruptedError();
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(FileCorruptedError);
        });

        it('should have correct name', () => {
            expect(new FileCorruptedError().name).toBe('FileCorruptedError');
        });

        it('should have default message', () => {
            expect(new FileCorruptedError().message).toContain('integrity verification failed');
        });

        it('should not be retryable', () => {
            expect(new FileCorruptedError().retryable).toBe(false);
        });

        it('should not be instanceof DecryptionKeyError', () => {
            const err = new FileCorruptedError();
            expect(err).not.toBeInstanceOf(DecryptionKeyError);
        });
    });

    describe('Cross-type discrimination', () => {
        it('should distinguish all three types via instanceof', () => {
            const errors = [
                new VaultLockedError(),
                new DecryptionKeyError(),
                new FileCorruptedError(),
            ];

            expect(errors[0]).toBeInstanceOf(VaultLockedError);
            expect(errors[0]).not.toBeInstanceOf(DecryptionKeyError);
            expect(errors[0]).not.toBeInstanceOf(FileCorruptedError);

            expect(errors[1]).toBeInstanceOf(DecryptionKeyError);
            expect(errors[1]).not.toBeInstanceOf(VaultLockedError);
            expect(errors[1]).not.toBeInstanceOf(FileCorruptedError);

            expect(errors[2]).toBeInstanceOf(FileCorruptedError);
            expect(errors[2]).not.toBeInstanceOf(VaultLockedError);
            expect(errors[2]).not.toBeInstanceOf(DecryptionKeyError);
        });

        it('should all be catchable as Error', () => {
            const errors = [
                new VaultLockedError(),
                new DecryptionKeyError(),
                new FileCorruptedError(),
            ];
            for (const err of errors) {
                expect(err).toBeInstanceOf(Error);
            }
        });
    });
});
