/**
 * Typed error classes for crypto operations.
 * Allows downstream code to distinguish vault-locked vs wrong-key vs corrupted-file.
 */

/** Master key cache expired mid-operation — retryable after vault unlock */
export class VaultLockedError extends Error {
    readonly retryable = true;
    constructor(message = 'Vault is locked. Please unlock to continue.') {
        super(message);
        this.name = 'VaultLockedError';
    }
}

/** AES-GCM authentication tag mismatch — wrong key or tampered ciphertext */
export class DecryptionKeyError extends Error {
    readonly retryable = false;
    constructor(message = 'Decryption failed — invalid key or corrupted file.') {
        super(message);
        this.name = 'DecryptionKeyError';
    }
}

/** Integrity manifest check failed — file data has been tampered with */
export class FileCorruptedError extends Error {
    readonly retryable = false;
    constructor(message = 'File integrity verification failed — file may be corrupted.') {
        super(message);
        this.name = 'FileCorruptedError';
    }
}
