/**
 * useOfflineTransferDownload Hook
 * 
 * Manages downloading chunks from an offline P2P transfer session.
 * Handles parallel downloads, progress tracking, and file assembly.
 * 
 * @module hooks/useOfflineTransferDownload
 */
import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { FileAssembler, base64ToArrayBuffer, type AssemblyProgress } from "@/lib/p2p";
import { devWarn } from '@/lib/debugLogger';

/**
 * Manifest returned from claimOfflineSession
 */
export interface OfflineManifest {
    fileName: string;
    fileSize: number;
    fileType: string;
    totalChunks: number;
    chunks: { index: number; hash: string }[];
}

/**
 * Download state
 */
export type DownloadStatus = "idle" | "downloading" | "assembling" | "completed" | "failed";

/**
 * Hook return type
 */
export interface UseOfflineTransferDownloadResult {
    status: DownloadStatus;
    progress: AssemblyProgress | null;
    error: string | null;
    downloadedFile: Blob | null;

    startDownload: (sessionId: string, manifest: OfflineManifest) => Promise<void>;
    downloadFile: () => void;
    reset: () => void;
}

/**
 * Configuration options
 */
interface DownloadConfig {
    /** Number of parallel downloads (default: 3) */
    parallelDownloads?: number;
    /** Retry attempts per chunk (default: 3) */
    retryAttempts?: number;
    /** Delay between retries in ms (default: 1000) */
    retryDelay?: number;
}

const DEFAULT_CONFIG: Required<DownloadConfig> = {
    parallelDownloads: 3,
    retryAttempts: 3,
    retryDelay: 1000,
};

/**
 * Hook for downloading offline transfer chunks
 * 
 * @param config - Optional configuration
 * @returns Download state and controls
 */
export function useOfflineTransferDownload(
    config: DownloadConfig = {}
): UseOfflineTransferDownloadResult {
    const { parallelDownloads, retryAttempts, retryDelay } = { ...DEFAULT_CONFIG, ...config };

    const [status, setStatus] = useState<DownloadStatus>("idle");
    const [progress, setProgress] = useState<AssemblyProgress | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [downloadedFile, setDownloadedFile] = useState<Blob | null>(null);

    const assemblerRef = useRef<FileAssembler | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const trpcUtils = trpc.useUtils();

    /**
     * Download a single chunk with retries
     */
    const downloadChunkWithRetry = useCallback(async (
        sessionId: string,
        chunkIndex: number,
        expectedHash?: string
    ): Promise<ArrayBuffer> => {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < retryAttempts; attempt++) {
            try {
                const result = await trpcUtils.p2p.downloadChunk.fetch({
                    sessionId,
                    chunkIndex,
                });

                // Verify hash if provided
                if (expectedHash && result.hash !== expectedHash) {
                    throw new Error(`Hash mismatch for chunk ${chunkIndex}`);
                }

                // Convert base64 to ArrayBuffer
                return base64ToArrayBuffer(result.encryptedData);
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                devWarn(`[OfflineDownload] Chunk ${chunkIndex} attempt ${attempt + 1} failed:`, lastError.message);

                if (attempt < retryAttempts - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }

        throw lastError || new Error(`Failed to download chunk ${chunkIndex}`);
    }, [trpcUtils, retryAttempts, retryDelay]);

    /**
     * Download all chunks with parallel processing
     */
    const startDownload = useCallback(async (
        sessionId: string,
        manifest: OfflineManifest
    ): Promise<void> => {
        // Initialize
        setStatus("downloading");
        setError(null);
        setDownloadedFile(null);

        // Create abort controller for cancellation
        abortControllerRef.current = new AbortController();

        // Create assembler
        const assembler = new FileAssembler({
            fileName: manifest.fileName,
            fileSize: manifest.fileSize,
            mimeType: manifest.fileType,
            totalChunks: manifest.totalChunks,
            chunkHashes: manifest.chunks.map(c => c.hash),
        });
        assemblerRef.current = assembler;

        // Update initial progress
        setProgress(assembler.getProgress());

        try {
            // Create chunk indices to download
            const chunkIndices = Array.from({ length: manifest.totalChunks }, (_, i) => i);

            // Process chunks in parallel batches
            while (chunkIndices.length > 0) {
                // Check for abort
                if (abortControllerRef.current?.signal.aborted) {
                    throw new Error("Download cancelled");
                }

                // Get next batch
                const batch = chunkIndices.splice(0, parallelDownloads);

                // Download batch in parallel
                const chunkPromises = batch.map(async (index) => {
                    const expectedHash = manifest.chunks.find(c => c.index === index)?.hash;
                    const data = await downloadChunkWithRetry(sessionId, index, expectedHash);
                    return { index, data };
                });

                const results = await Promise.all(chunkPromises);

                // Add chunks to assembler
                for (const { index, data } of results) {
                    const hash = manifest.chunks.find(c => c.index === index)?.hash;
                    assembler.addChunk({ index, data, hash });
                }

                // Update progress
                setProgress(assembler.getProgress());
            }

            // Assemble file
            setStatus("assembling");
            const blob = assembler.assemble();
            setDownloadedFile(blob);
            setStatus("completed");

        } catch (err) {
            const message = err instanceof Error ? err.message : "Download failed";
            setError(message);
            setStatus("failed");
            console.error("[OfflineDownload] Error:", err);
        }
    }, [parallelDownloads, downloadChunkWithRetry]);

    /**
     * Trigger browser download of the assembled file
     */
    const downloadFile = useCallback(() => {
        if (!downloadedFile || !assemblerRef.current) {
            console.error("[OfflineDownload] No file to download");
            return;
        }

        const manifest = assemblerRef.current.getManifest();
        const url = URL.createObjectURL(downloadedFile);
        const a = document.createElement("a");
        a.href = url;
        a.download = manifest.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, [downloadedFile]);

    /**
     * Reset the hook state
     */
    const reset = useCallback(() => {
        // Abort any ongoing download
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        // Reset assembler
        if (assemblerRef.current) {
            assemblerRef.current.reset();
            assemblerRef.current = null;
        }

        // Reset state
        setStatus("idle");
        setProgress(null);
        setError(null);
        setDownloadedFile(null);
    }, []);

    return {
        status,
        progress,
        error,
        downloadedFile,
        startDownload,
        downloadFile,
        reset,
    };
}
