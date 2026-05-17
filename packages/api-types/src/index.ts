/**
 * @stenvault/api-types
 *
 * Type-only exports for the StenVault tRPC client.
 * This package contains no runtime code.
 */

// tRPC AppRouter type for type-safe client usage.
// In the public repo this resolves to a bundled .d.ts; in the private
// monorepo it resolves to the live router source.
export type { AppRouter } from './generated-router';

export * from './files';

export * from './auth';

export * from './encryption';
