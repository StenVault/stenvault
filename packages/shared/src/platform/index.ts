/**
 * Platform Abstraction Layer
 *
 * Provides platform-agnostic interfaces for:
 * - Crypto: Encryption, key generation, hashing
 * - Download: File download abstractions
 *
 * Each platform (web, mobile) provides its own implementations
 * of these interfaces, allowing business logic to be shared.
 */

// Crypto abstraction
export * from './crypto';

// Download abstraction
export * from './download';
