/**
 * Query Client Configuration
 * 
 * Centralized React Query configuration and utilities.
 * Following the same pattern as stenvault-mobile.
 * 
 * @created 2026-01-17
 * @phase React Query Centralization
 */

import { QueryClient } from "@tanstack/react-query";
import { trpc } from "./trpc";

// ============ Query Client ============

/**
 * Centralized QueryClient with optimized defaults
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes (was cacheTime)
            retry: 2,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
        },
        mutations: {
            retry: 1,
        },
    },
});

// ============ Query Keys ============

/**
 * Centralized query keys for cache management
 * Enables targeted invalidation and prefetching
 */
export const queryKeys = {
    // Files & Folders
    files: {
        all: ["files"] as const,
        list: (folderId?: number) => [...queryKeys.files.all, "list", folderId] as const,
        stats: () => [...queryKeys.files.all, "stats"] as const,
        recent: () => [...queryKeys.files.all, "recent"] as const,
    },
    folders: {
        all: ["folders"] as const,
        list: () => [...queryKeys.folders.all, "list"] as const,
        tree: () => [...queryKeys.folders.all, "tree"] as const,
    },

    // Shares
    shares: {
        all: ["shares"] as const,
        list: () => [...queryKeys.shares.all, "list"] as const,
        stats: () => [...queryKeys.shares.all, "stats"] as const,
    },

    // Auth & User
    auth: {
        me: ["auth", "me"] as const,
    },

    // Settings
    settings: {
        all: ["settings"] as const,
        health: () => [...queryKeys.settings.all, "health"] as const,
    },

    // P2P
    p2p: {
        all: ["p2p"] as const,
        sessions: () => [...queryKeys.p2p.all, "sessions"] as const,
        pending: () => [...queryKeys.p2p.all, "pending"] as const,
        config: () => [...queryKeys.p2p.all, "config"] as const,
    },

    // Organizations
    organizations: {
        all: ["organizations"] as const,
        list: () => [...queryKeys.organizations.all, "list"] as const,
        members: (orgId: number) => [...queryKeys.organizations.all, "members", orgId] as const,
    },

    // Stripe
    stripe: {
        all: ["stripe"] as const,
        subscription: () => [...queryKeys.stripe.all, "subscription"] as const,
        pricing: () => [...queryKeys.stripe.all, "pricing"] as const,
    },
} as const;

// ============ Invalidation Helpers ============

/**
 * Helper functions to invalidate specific cache sections
 * Use after mutations to refresh stale data
 */
export const invalidateQueries = {
    files: {
        all: () => queryClient.invalidateQueries({ queryKey: queryKeys.files.all }),
        list: (folderId?: number) =>
            queryClient.invalidateQueries({ queryKey: queryKeys.files.list(folderId) }),
        stats: () => queryClient.invalidateQueries({ queryKey: queryKeys.files.stats() }),
    },
    folders: {
        all: () => queryClient.invalidateQueries({ queryKey: queryKeys.folders.all }),
        list: () => queryClient.invalidateQueries({ queryKey: queryKeys.folders.list() }),
    },
    shares: {
        all: () => queryClient.invalidateQueries({ queryKey: queryKeys.shares.all }),
        list: () => queryClient.invalidateQueries({ queryKey: queryKeys.shares.list() }),
    },
    auth: {
        me: () => queryClient.invalidateQueries({ queryKey: queryKeys.auth.me }),
    },
    p2p: {
        all: () => queryClient.invalidateQueries({ queryKey: queryKeys.p2p.all }),
        sessions: () => queryClient.invalidateQueries({ queryKey: queryKeys.p2p.sessions() }),
    },
    organizations: {
        all: () => queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all }),
        list: () => queryClient.invalidateQueries({ queryKey: queryKeys.organizations.list() }),
    },
    stripe: {
        all: () => queryClient.invalidateQueries({ queryKey: queryKeys.stripe.all }),
        subscription: () => queryClient.invalidateQueries({ queryKey: queryKeys.stripe.subscription() }),
    },
};

// ============ tRPC Utils Export ============

/**
 * Get tRPC utils for cache manipulation
 * Use inside components: const utils = useTRPCUtils();
 */
export const useTRPCUtils = () => trpc.useUtils();
