/**
 * Typed error taxonomy for the vault domain.
 *
 * Public surface:
 * - `ErrorCode` — discriminated string union of every error code
 * - `VaultError` — class thrown by internal modules
 * - `SerializedVaultError` — plain-object shape for Worker boundaries
 *
 * UI consumers should import the translator from `apps/web/src/lib/errorMessages.ts`
 * (added in PR-2) rather than reading `err.message` directly.
 */
export * from './codes';
export * from './VaultError';
