/**
 * Platform Abstraction Layer
 *
 * Provides platform-agnostic interfaces for:
 * - Crypto: Encryption, key generation, hashing
 * - HSM: Hardware Security Module integration
 * - Download: File download abstractions
 *
 * Each platform (web, mobile) provides its own implementations
 * of these interfaces, allowing business logic to be shared.
 */

// Crypto abstraction
export * from './crypto';

// HSM (Hardware Security Module) abstraction

// Download abstraction
export * from './download';
