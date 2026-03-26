/**
 * useTimestamp Hook
 *
 * Provides access to OpenTimestamps blockchain proof of existence features.
 * Handles submitting files for timestamping, checking status, verification,
 * and downloading proof files.
 */

import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { downloadBase64File } from "@/lib/platform";
import type {
    TimestampStatus,
    FileTimestampInfo,
    TimestampVerification,
} from "@stenvault/shared";

interface UseTimestampOptions {
    fileId?: number;
    onStatusChange?: (status: TimestampStatus | null) => void;
}

interface UseTimestampReturn {
    timestampInfo: FileTimestampInfo | null;
    isLoading: boolean;
    isEnabled: boolean;
    submitTimestamp: () => Promise<void>;
    verifyTimestamp: () => Promise<TimestampVerification | null>;
    downloadProof: () => Promise<void>;
    downloadLegalPdf: () => Promise<void>;
    retryTimestamp: () => Promise<void>;
    isPending: boolean;
}

export function useTimestamp(options: UseTimestampOptions = {}): UseTimestampReturn {
    const { fileId, onStatusChange } = options;
    const utils = trpc.useUtils();

    const { data: enabledData } = trpc.timestamp.isEnabled.useQuery(undefined, {
        staleTime: 5 * 60 * 1000,
    });
    const isEnabled = enabledData?.enabled ?? false;

    const {
        data: statusData,
        isLoading,
        refetch: refetchStatus,
    } = trpc.timestamp.getStatus.useQuery(
        { fileId: fileId! },
        {
            enabled: !!fileId && isEnabled,
            staleTime: 30 * 1000,
            refetchInterval: (query) => {
                const data = query.state.data;
                // Poll every minute while waiting for blockchain confirmation
                if (data?.status === "pending" || data?.status === "confirming") {
                    return 60 * 1000;
                }
                return false;
            },
        }
    );

    const submitMutation = trpc.timestamp.submit.useMutation({
        onSuccess: (result) => {
            toast.success(result.message);
            onStatusChange?.(result.status);
            refetchStatus();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to submit timestamp");
        },
    });

    const retryMutation = trpc.timestamp.retry.useMutation({
        onSuccess: (result) => {
            toast.success(result.message);
            onStatusChange?.("pending");
            refetchStatus();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to retry timestamp");
        },
    });

    const legalPdfMutation = trpc.timestamp.generateLegalPdf.useMutation({
        onError: (error) => {
            toast.error(error.message || "Failed to generate PDF");
        },
    });

    const submitTimestamp = useCallback(async () => {
        if (!fileId) {
            toast.error("No file selected");
            return;
        }
        if (!isEnabled) {
            toast.error("Timestamping service is disabled");
            return;
        }
        await submitMutation.mutateAsync({ fileId });
    }, [fileId, isEnabled, submitMutation]);

    const verifyTimestamp = useCallback(async (): Promise<TimestampVerification | null> => {
        if (!fileId) {
            toast.error("No file selected");
            return null;
        }
        try {
            const result = await utils.timestamp.verify.fetch({ fileId });
            if (result.verified) {
                toast.success("Timestamp verified on Bitcoin blockchain");
            }
            return result as TimestampVerification;
        } catch (error) {
            const message = error instanceof Error ? error.message : "Verification failed";
            toast.error(message);
            return null;
        }
    }, [fileId, utils]);

    const downloadProof = useCallback(async () => {
        if (!fileId) {
            toast.error("No file selected");
            return;
        }
        try {
            const result = await utils.timestamp.downloadProof.fetch({ fileId });

            const downloadResult = await downloadBase64File(
                result.proof,
                result.filename,
                "application/octet-stream"
            );

            if (downloadResult.success) {
                toast.success(`Downloaded ${result.filename}`);
            } else {
                toast.error(downloadResult.error || "Failed to download proof");
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to download proof";
            toast.error(message);
        }
    }, [fileId, utils]);

    const downloadLegalPdf = useCallback(async () => {
        if (!fileId) {
            toast.error("No file selected");
            return;
        }
        try {
            const result = await legalPdfMutation.mutateAsync({ fileId });

            const downloadResult = await downloadBase64File(
                result.pdf,
                result.filename,
                result.mimeType
            );

            if (downloadResult.success) {
                toast.success(`Downloaded ${result.filename}`);
            } else {
                toast.error(downloadResult.error || "Failed to download PDF");
            }
        } catch {
            // Error already handled by mutation onError
        }
    }, [fileId, legalPdfMutation]);

    const retryTimestamp = useCallback(async () => {
        if (!fileId) {
            toast.error("No file selected");
            return;
        }
        await retryMutation.mutateAsync({ fileId });
    }, [fileId, retryMutation]);

    const timestampInfo: FileTimestampInfo | null = statusData
        ? {
              hasTimestamp: statusData.hasTimestamp,
              status: statusData.status,
              submittedAt: statusData.submittedAt,
              confirmedAt: statusData.confirmedAt,
              bitcoinBlockHeight: statusData.bitcoinBlockHeight,
              bitcoinTimestamp: statusData.bitcoinTimestamp,
              contentHash: statusData.contentHash,
          }
        : null;

    return {
        timestampInfo,
        isLoading,
        isEnabled,
        submitTimestamp,
        verifyTimestamp,
        downloadProof,
        downloadLegalPdf,
        retryTimestamp,
        isPending: submitMutation.isPending || retryMutation.isPending || legalPdfMutation.isPending,
    };
}

export function useBatchTimestampStatus(fileIds: number[]) {
    const { data: enabledData } = trpc.timestamp.isEnabled.useQuery(undefined, {
        staleTime: 5 * 60 * 1000,
    });
    const isEnabled = enabledData?.enabled ?? false;

    const { data, isLoading } = trpc.timestamp.batchStatus.useQuery(
        { fileIds },
        {
            enabled: isEnabled && fileIds.length > 0,
            staleTime: 30 * 1000,
        }
    );

    const statusMap = new Map<number, TimestampStatus | null>();
    if (data) {
        for (const item of data) {
            statusMap.set(item.fileId, item.status);
        }
    }

    return {
        isEnabled,
        isLoading,
        getStatus: (fileId: number) => statusMap.get(fileId) ?? null,
        statusMap,
    };
}
