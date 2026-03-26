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

// ============ Types ============

export interface UseResumableTransfersResult {
    transfers: ResumableTransferInfo[];
    isLoading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
    deleteTransfer: (sessionId: string) => Promise<void>;
    cleanup: () => Promise<number>;
    resumeTransfer: (sessionId: string) => void;
    getStorageInfo: () => Promise<{ used: number; available: number; percentUsed: number }>;
}

// ============ Constants ============

const AUTO_CLEANUP_INTERVAL = 60 * 60 * 1000;
const STORAGE_WARNING_THRESHOLD = 0.8;

// ============ Hook Implementation ============

export function useResumableTransfers(): UseResumableTransfersResult {
    const [transfers, setTransfers] = useState<ResumableTransferInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [, navigate] = useLocation();

    const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

    const refresh = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const storage = getTransferStorage();
            const pending = await storage.listPendingTransfers();

            const resumable = pending
                .filter(t => t.direction === "receive" && t.completedChunks.length < t.totalChunks)
                .map(metadataToInfo);

            resumable.sort((a, b) => b.updatedAt - a.updatedAt);

            setTransfers(resumable);
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setIsLoading(false);
        }
    }, [metadataToInfo]);

    const deleteTransfer = useCallback(async (sessionId: string) => {
        try {
            const storage = getTransferStorage();
            await storage.deleteState(sessionId);

            setTransfers(prev => prev.filter(t => t.sessionId !== sessionId));
        } catch (err) {
            throw err;
        }
    }, []);

    const cleanup = useCallback(async (): Promise<number> => {
        try {
            const storage = getTransferStorage();
            const count = await storage.cleanupExpired();

            await refresh();

            return count;
        } catch {
            return 0;
        }
    }, [refresh]);

    const resumeTransfer = useCallback((sessionId: string) => {
        const transfer = transfers.find(t => t.sessionId === sessionId);

        if (transfer?.shareUrl) {
            const url = new URL(transfer.shareUrl, window.location.origin);
            url.searchParams.set("resume", "true");
            navigate(url.pathname + url.search);
        } else {
            navigate(`/p2p/receive/${sessionId}?resume=true`);
        }
    }, [transfers, navigate]);

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

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        cleanup();

        cleanupIntervalRef.current = setInterval(() => {
            cleanup();
        }, AUTO_CLEANUP_INTERVAL);

        return () => {
            if (cleanupIntervalRef.current) {
                clearInterval(cleanupIntervalRef.current);
            }
        };
    }, [cleanup]);

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

// ============ Utility Functions ============

export async function restoreFileAssembler(sessionId: string): Promise<FileAssembler | null> {
    return FileAssembler.restoreFromState(sessionId);
}

export async function restoreChunkAssembler(sessionId: string): Promise<ChunkAssembler | null> {
    return ChunkAssembler.restoreFromState(sessionId);
}

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

export async function hasResumableState(sessionId: string): Promise<boolean> {
    const storage = getTransferStorage();
    return storage.hasState(sessionId);
}

// Re-exported from centralized location
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
