/**
 * Crypto Platform Abstraction
 *
 * Export types and utilities for platform-agnostic cryptography.
 */

// Types and interfaces
export * from './types';

// Argon2id key derivation (Phase 0 Sovereign)
export * from './argon2';

// AES Key Wrap (RFC 3394) for master key management
export * from './keyWrap';

// Hybrid KEM (X25519 + ML-KEM-768) for post-quantum encryption (Phase 1 Sovereign)
export * from './hybridKem';

// Hybrid Signatures (Ed25519 + ML-DSA-65) for post-quantum signing (Phase 3.4 Sovereign)
export * from './hybridSignature';

// CVEF v1.1/v1.2/v1.3 file format (Phase 0/1/3.4 Sovereign)
export * from './cvef';

// Shamir Secret Sharing for master key recovery (Phase 3.1 Sovereign)
export * from './shamirRecovery';

// Utility functions (platform-agnostic)
export * from './utils';
