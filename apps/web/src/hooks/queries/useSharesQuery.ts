/**
 * Shares Query Hooks
 * 
 * Centralized queries for share operations.
 * 
 * @created 2026-01-17
 * @phase React Query Centralization
 */

import { trpc } from '@/lib/trpc';

/**
 * Query user's shares
 */
export function useSharesQuery(options?: { includeExpired?: boolean; includeRevoked?: boolean }) {
    return trpc.shares.listMyShares.useQuery(
        options,
        {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: true,
        }
    );
}

/**
 * Query share statistics
 */
export function useShareStatsQuery() {
    return trpc.shares.getShareStats.useQuery(undefined, {
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
    });
}
