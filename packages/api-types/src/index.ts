/**
 * @cloudvault/api-types
 *
 * Type-only exports from the CloudVault API.
 * These types are automatically kept in sync with the backend.
 *
 * USAGE:
 * - Web: import type { AppRouter } from '@cloudvault/api-types'
 * - Mobile: Use the sync script to generate local type files
 *
 * IMPORTANT: This package contains ONLY types, no runtime code.
 *
 * @version 1.0.0
 * @created 2026-01-08
 */

// Re-export the AppRouter type for type-safe tRPC client usage
// NOTE: In the public open-source repo, this is replaced with './generated-router'
export type { AppRouter } from './generated-router';

export * from './p2p';

export * from './chat';

export * from './files';

export * from './auth';

export * from './encryption';
