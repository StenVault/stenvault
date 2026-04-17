/**
 * Crypto Platform Abstraction
 *
 * Export types and utilities for platform-agnostic cryptography.
 */

// Types and interfaces
export * from './types';

// Argon2id key derivation
export * from './argon2';

// AES Key Wrap (RFC 3394) for master key management
export * from './keyWrap';

// Hybrid post-quantum key encapsulation (X25519 + ML-KEM-768)
export * from './hybridKem';

// Hybrid post-quantum signatures (Ed25519 + ML-DSA-65)
export * from './hybridSignature';

// CVEF encrypted-file format (v1.1–v1.4)
export * from './cvef';

// Shamir Secret Sharing for master-key recovery
export * from './shamirRecovery';

// Utility functions (platform-agnostic)
export * from './utils';
