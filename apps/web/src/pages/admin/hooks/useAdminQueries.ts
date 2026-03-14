/**
 * Admin Panel - Custom Hooks for Queries and Mutations
 */
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState } from "react";

export interface LimitForm {
    storageQuota: number; // GB
    maxFileSize: number; // MB
    maxShares: number;
    hasCustomQuotas: boolean;
}

export function useAdminQueries() {
    // System Stats
    const { data: stats, isLoading: statsLoading, refetch: refetchStats } =
        trpc.admin.getSystemStats.useQuery(undefined, {
            refetchInterval: 30000,
        });

    // System Health
    const { data: health, isLoading: healthLoading } =
        trpc.admin.getSystemHealth.useQuery(undefined, {
            refetchInterval: 60000,
        });

    // Recent Activity
    const { data: recentActivity, isLoading: activityLoading } =
        trpc.admin.getRecentActivity.useQuery(undefined, {
            refetchInterval: 30000,
        });

    // Cache Stats
    const { data: cacheStats, isLoading: cacheLoading, refetch: refetchCache } =
        trpc.admin.getCacheStats.useQuery(undefined, {
            refetchInterval: 60000,
        });

    // Metrics
    const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } =
        trpc.admin.getMetrics.useQuery(undefined, {
            refetchInterval: 10000,
        });

    return {
        stats, statsLoading, refetchStats,
        health, healthLoading,
        recentActivity, activityLoading,
        cacheStats, cacheLoading, refetchCache,
        metrics, metricsLoading, refetchMetrics,
    };
}

export function useHistoricalMetrics(hours: number = 24) {
    return trpc.admin.getHistoricalMetrics.useQuery({ hours }, {
        refetchInterval: 5 * 60 * 1000, // Refresh every 5 mins
    });
}

export function useAuditLogs() {
    const [page, setPage] = useState(0);
    const limit = 20;

    const { data, isLoading, refetch } = trpc.admin.getAuditLogs.useQuery({
        limit,
        offset: page * limit,
    });

    return {
        logs: data?.logs || [],
        total: data?.total || 0,
        isLoading,
        page,
        setPage,
        limit,
        refetch
    };
}

export function useUsersQuery(searchQuery: string, roleFilter: "all" | "user" | "admin") {
    return trpc.admin.getUsers.useQuery({
        limit: 50,
        offset: 0,
        search: searchQuery || undefined,
        role: roleFilter,
    });
}

export function useAdminMutations(callbacks?: {
    onUserUpdate?: () => void;
    onStatsUpdate?: () => void;
    onCacheUpdate?: () => void;
}) {
    // Update User Limits
    const updateLimitsMutation = trpc.admin.updateUserLimits.useMutation({
        onSuccess: () => {
            toast.success("User limits updated");
            callbacks?.onUserUpdate?.();
        },
        onError: (err) => toast.error(err.message),
    });

    // Delete User
    const deleteUserMutation = trpc.admin.deleteUser.useMutation({
        onSuccess: () => {
            toast.success("User deleted successfully");
            callbacks?.onUserUpdate?.();
            callbacks?.onStatsUpdate?.();
        },
        onError: (err) => toast.error(err.message),
    });

    // Reset Rate Limit
    const resetRateLimitMutation = trpc.admin.resetUserRateLimit.useMutation({
        onSuccess: () => {
            toast.success("Rate limits reset for user");
        },
        onError: (err) => toast.error(err.message),
    });

    // Update User Role
    const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
        onSuccess: () => {
            toast.success("User role updated successfully");
            callbacks?.onUserUpdate?.();
            callbacks?.onStatsUpdate?.();
        },
        onError: (err) => toast.error(err.message),
    });

    // Flush All Caches
    const flushCachesMutation = trpc.admin.flushAllCaches.useMutation({
        onSuccess: (data) => {
            toast.success(`Flushed ${data.keysDeleted} cache keys`);
            callbacks?.onCacheUpdate?.();
        },
        onError: (err) => toast.error(err.message),
    });

    // Invalidate User Caches
    const invalidateUserCachesMutation = trpc.admin.invalidateUserCaches.useMutation({
        onSuccess: (data) => {
            toast.success(`Invalidated ${data.keysDeleted} cache keys for user`);
        },
        onError: (err) => toast.error(err.message),
    });

    return {
        updateLimitsMutation,
        deleteUserMutation,
        resetRateLimitMutation,
        updateRoleMutation,
        flushCachesMutation,
        invalidateUserCachesMutation,
    };
}
