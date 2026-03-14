/**
 * Query Hooks Index
 * 
 * Centralized React Query hooks for data fetching.
 * These wrap tRPC queries with consistent configuration.
 * 
 * @created 2026-01-17
 * @phase React Query Centralization
 * 
 * Benefits:
 * - Consistent cache configuration
 * - Auto-invalidation on mutations
 * - Reusable across components
 * - Easier testing
 */

export { useFilesQuery, useStorageStatsQuery, useFoldersQuery } from './useFilesQuery';
export { useSharesQuery, useShareStatsQuery } from './useSharesQuery';
