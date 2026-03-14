/**
 * useResumableTransfers Hook
 * 
 * Manages resumable P2P transfers with IndexedDB persistence.
 * Provides functionality to:
 * - List incomplete transfers
 * - Resume interrupted transfers
 * - Delete stale transfer state
 * - Auto-cleanup expired transfers
 * 
 * @module hooks/p2p/useResumableTransfers
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import type { ResumableTransferInfo } from "@/components/p2p/types";
import { getTransferStorage, type TransferStateMetadata } from "@/lib/p2p";
import { FileAssembler } from "@/lib/p2p";
import { ChunkAssembler } from "@/lib/p2pChunkedTransfer";


export interface UseResumableTransfersResult {
    /** List of incomplete transfers that can be resumed */
    transfers: ResumableTransferInfo[];
    /** Whether transfers are loading */
    isLoading: boolean;
    /** Error if any */
    error: Error | null;
    /** Refresh the list of transfers */
    refresh: () => Promise<void>;
    /** Delete a specific transfer state */
    deleteTransfer: (sessionId: string) => Promise<void>;
    /** Delete all completed or expired transfers */
    cleanup: () => Promise<number>;
    /** Navigate to resume a specific transfer */
    resumeTransfer: (sessionId: string) => void;
    /** Get storage usage info */
    getStorageInfo: () => Promise<{ used: number; available: number; percentUsed: number }>;
}


/** Interval for auto-cleanup (1 hour) */
const AUTO_CLEANUP_INTERVAL = 60 * 60 * 1000;

/** Storage warning threshold (80%) */
const STORAGE_WARNING_THRESHOLD = 0.8;


/**
 * Hook for managing resumable P2P transfers
 */
export function useResumableTransfers(): UseResumableTransfersResult {
    const [transfers, setTransfers] = useState<ResumableTransferInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [, navigate] = useLocation();

    // Refs for cleanup interval
    const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);

    /**
     * Convert storage metadata to ResumableTransferInfo
     */
    const metadataToInfo = useCallback((meta: TransferStateMetadata): ResumableTransferInfo => {
        const progress = meta.totalChunks > 0
            ? Math.round((meta.completedChunks.length / meta.totalChunks) * 100)
            : 0;

        return {
            sessionId: meta.sessionId,
            fileName: meta.fileName,
            fileSize: meta.fileSize,
            mimeType: meta.mimeType,
            progress,
            bytesTransferred: meta.bytesTransferred,
            totalBytes: meta.fileSize,
            completedChunks: meta.completedChunks.length,
            totalChunks: meta.totalChunks,
            protocol: meta.protocol,
            isE2E: meta.isE2E,
            shareUrl: meta.shareUrl,
            createdAt: meta.createdAt,
            updatedAt: meta.updatedAt,
            expiresAt: meta.expiresAt,
        };
    }, []);

    /**
     * Load all resumable transfers from IndexedDB
     */
    const refresh = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const storage = getTransferStorage();
            const pending = await storage.listPendingTransfers();

            // Filter to only receive-direction, incomplete transfers
            const resumable = pending
                .filter(t => t.direction === "receive" && t.completedChunks.length < t.totalChunks)
                .map(metadataToInfo);

            // Sort by most recently updated
            resumable.sort((a, b) => b.updatedAt - a.updatedAt);

            setTransfers(resumable);
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setIsLoading(false);
        }
    }, [metadataToInfo]);

    /**
     * Delete a specific transfer state
     */
    const deleteTransfer = useCallback(async (sessionId: string) => {
        try {
            const storage = getTransferStorage();
            await storage.deleteState(sessionId);

            // Update local state
            setTransfers(prev => prev.filter(t => t.sessionId !== sessionId));
        } catch (err) {
            throw err;
        }
    }, []);

    /**
     * Cleanup expired transfers
     */
    const cleanup = useCallback(async (): Promise<number> => {
        try {
            const storage = getTransferStorage();
            const count = await storage.cleanupExpired();

            // Refresh list after cleanup
            await refresh();

            return count;
        } catch {
            return 0;
        }
    }, [refresh]);

    /**
     * Navigate to resume a specific transfer
     * Uses the shareUrl if available, otherwise generates a resume URL
     */
    const resumeTransfer = useCallback((sessionId: string) => {
        const transfer = transfers.find(t => t.sessionId === sessionId);

        if (transfer?.shareUrl) {
            // Use original share URL with resume flag
            const url = new URL(transfer.shareUrl, window.location.origin);
            url.searchParams.set("resume", "true");
            navigate(url.pathname + url.search);
        } else {
            // Fallback to direct resume URL
            navigate(`/p2p/receive/${sessionId}?resume=true`);
        }
    }, [transfers, navigate]);

    /**
     * Get storage usage info
     */
    const getStorageInfo = useCallback(async () => {
        const storage = getTransferStorage();
        const info = await storage.getStorageInfo();

        const percentUsed = info.available > 0
            ? info.used / info.available
            : 0;

        return {
            used: info.used,
            available: info.available,
            percentUsed,
        };
    }, []);

    // Initial load
    useEffect(() => {
        refresh();
    }, [refresh]);

    // Auto-cleanup on mount and periodically
    useEffect(() => {
        // Initial cleanup
        cleanup();

        // Periodic cleanup
        cleanupIntervalRef.current = setInterval(() => {
            cleanup();
        }, AUTO_CLEANUP_INTERVAL);

        return () => {
            if (cleanupIntervalRef.current) {
                clearInterval(cleanupIntervalRef.current);
            }
        };
    }, [cleanup]);

    // Check storage usage and warn if high
    useEffect(() => {
        getStorageInfo();
    }, [getStorageInfo, transfers]);

    return {
        transfers,
        isLoading,
        error,
        refresh,
        deleteTransfer,
        cleanup,
        resumeTransfer,
        getStorageInfo,
    };
}


/**
 * Restore a FileAssembler from saved state
 * Used when resuming a simple protocol transfer
 */
export async function restoreFileAssembler(sessionId: string): Promise<FileAssembler | null> {
    return FileAssembler.restoreFromState(sessionId);
}

/**
 * Restore a ChunkAssembler from saved state
 * Used when resuming a chunked protocol transfer
 */
export async function restoreChunkAssembler(sessionId: string): Promise<ChunkAssembler | null> {
    return ChunkAssembler.restoreFromState(sessionId);
}

/**
 * Get list of all resumable transfers (both protocols)
 */
export async function getAllResumableTransfers(): Promise<ResumableTransferInfo[]> {
    const storage = getTransferStorage();
    const pending = await storage.listPendingTransfers();

    return pending
        .filter(t => t.direction === "receive" && t.completedChunks.length < t.totalChunks)
        .map(meta => ({
            sessionId: meta.sessionId,
            fileName: meta.fileName,
            fileSize: meta.fileSize,
            mimeType: meta.mimeType,
            progress: meta.totalChunks > 0
                ? Math.round((meta.completedChunks.length / meta.totalChunks) * 100)
                : 0,
            bytesTransferred: meta.bytesTransferred,
            totalBytes: meta.fileSize,
            completedChunks: meta.completedChunks.length,
            totalChunks: meta.totalChunks,
            protocol: meta.protocol,
            isE2E: meta.isE2E,
            shareUrl: meta.shareUrl,
            createdAt: meta.createdAt,
            updatedAt: meta.updatedAt,
            expiresAt: meta.expiresAt,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Check if a session has resumable state
 */
export async function hasResumableState(sessionId: string): Promise<boolean> {
    const storage = getTransferStorage();
    return storage.hasState(sessionId);
}

/**
 * Format bytes to human readable string
 * Re-exported from centralized location
 */
export { formatBytes } from "@/utils/formatters";

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}
