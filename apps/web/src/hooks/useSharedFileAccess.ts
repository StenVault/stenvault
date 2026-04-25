/**
 * Shared File Access Hook
 *
 * Hook for accessing files shared with you in chat.
 * Handles the complete decryption flow:
 * 1. Get share details from API
 * 2. Get sender's hybrid public key (for kemCiphertext-based shares)
 * 3. Decrypt file key using hybrid KEM
 * 4. Download and decrypt file
 *
 * @module hooks/useSharedFileAccess
 */

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { useMasterKey } from "./useMasterKey";
import {
    decryptFileKeyFromPeer,
    importFileKey,
} from "@/lib/chatFileCrypto";
import { base64ToArrayBuffer, toArrayBuffer } from "@/lib/platform";
import {
    parseCVEFHeader,
    isCVEFMetadataV1_4,
} from "@stenvault/shared/platform/crypto";
import { decryptChunkedToStream, deriveManifestHmacKey } from "@/lib/hybridFile";
import { toast } from "@/lib/toast";

export interface ShareDetails {
    id: number;
    fileId: number;
    ownerUserId: number;
    ownerName: string | null;
    encryptedFileKey: string;
    keyIv: string;
    keyDerivationSalt: string | null;
    kemCiphertext: string | null;
    permission: "view" | "download";
    maxDownloads: number | null;
    downloadCount: number;
    expiresAt: Date | null;
    status: "active" | "revoked" | "expired";
    createdAt: Date;
    file: {
        id: number;
        filename: string;
        mimeType: string | null;
        size: number;
        fileType: string;
        encryptionIv: string | null;
        encryptionSalt: string | null;
        encryptionVersion: number | null;
    };
}

/**
 * Hook for accessing shared files
 */
export function useSharedFileAccess() {
    const queryClient = useQueryClient();
    const { hasHybridKeyPair, isUnlocked, getUnlockedHybridSecretKey } = useMasterKey();
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const utils = trpc.useUtils();

    // Mutation for getting file access (increments download count)
    const getFileAccessMutation = trpc.chatFileShare.getFileAccess.useMutation();

    /**
     * Get share details
     */
    const useShareDetails = (shareId: number | undefined) => {
        return trpc.chatFileShare.getShareDetails.useQuery(
            { shareId: shareId! },
            { enabled: !!shareId }
        );
    };

    /**
     * Download and decrypt a shared file
     */
    const downloadSharedFile = useCallback(
        async (shareId: number): Promise<{ blob: Blob; filename: string }> => {
            setIsDownloading(true);
            setDownloadProgress(0);

            try {
                // 1. Check if vault is unlocked with hybrid keys
                if (!hasHybridKeyPair || !isUnlocked) {
                    throw new Error("Vault must be unlocked to access shared files");
                }

                // 2. Get our hybrid secret key
                const hybridSecretKey = await getUnlockedHybridSecretKey();
                if (!hybridSecretKey) {
                    throw new Error("Failed to get hybrid secret key");
                }

                // 3. Get share details
                const shareDetails = await utils.chatFileShare.getShareDetails.fetch({
                    shareId,
                });

                if (!shareDetails.success) {
                    throw new Error("Failed to get share details");
                }

                const share = shareDetails.share;
                setDownloadProgress(10);

                // 4. Validate share encryption parameters
                if (!share.keyDerivationSalt) {
                    throw new Error(
                        "Share is missing encryption salt. The share may be corrupted or created with an older version."
                    );
                }

                // 5. Decrypt file key using hybrid KEM
                // kemCiphertext is required for hybrid-encrypted shares
                if (!share.kemCiphertext) {
                    throw new Error("Share is missing KEM ciphertext. Cannot decrypt.");
                }

                const fileKeyBytes = await decryptFileKeyFromPeer({
                    encryptedFileKey: share.encryptedFileKey,
                    iv: share.keyIv,
                    salt: share.keyDerivationSalt,
                    kemCiphertext: share.kemCiphertext,
                    myHybridSecretKey: hybridSecretKey,
                });

                const fileKey = await importFileKey(fileKeyBytes);
                setDownloadProgress(30);

                // 6. Get download URL from API
                const accessResult = await getFileAccessMutation.mutateAsync({
                    shareId,
                });

                if (!accessResult.success) {
                    throw new Error("Failed to get file access");
                }

                setDownloadProgress(40);

                // 7. Download encrypted file
                const response = await fetch(accessResult.downloadUrl);
                if (!response.ok) {
                    throw new Error("Failed to download file");
                }

                const encryptedData = await response.arrayBuffer();
                setDownloadProgress(70);

                // 8. Decrypt file
                let decryptedBlob: Blob;
                const fileInfo = accessResult.file;
                const encVersion = fileInfo.encryptionVersion ?? 4;
                const mimeType = fileInfo.mimeType || "application/octet-stream";

                // Chat file shares are always V4 — reject anything else to prevent downgrade attacks
                if (encVersion !== 4) {
                    throw new Error('Chat file shares require V4 encryption. Received version: ' + encVersion);
                }

                // V4 CVEF: parse header, handle both chunked and single-pass
                const dataView = new Uint8Array(encryptedData);
                const { metadata, dataOffset, headerBytes } = parseCVEFHeader(dataView);
                const iv = new Uint8Array(base64ToArrayBuffer(metadata.iv));
                const aad = isCVEFMetadataV1_4(metadata) ? headerBytes : undefined;

                if (metadata.chunked) {
                    // Chunked V4 (files >50MB): stream-decrypt each chunk
                    const fileKeyRaw = new Uint8Array(fileKeyBytes);
                    const hmacKey = await deriveManifestHmacKey(fileKeyRaw);
                    const ciphertextData = dataView.slice(dataOffset);
                    const stream = decryptChunkedToStream(
                        ciphertextData,
                        fileKey,
                        iv,
                        metadata.chunked.count,
                        undefined,
                        hmacKey,
                        aad,
                    );
                    decryptedBlob = await new Response(stream).blob();
                    decryptedBlob = new Blob([decryptedBlob], { type: mimeType });
                    fileKeyRaw.fill(0);
                } else {
                    // Single-pass V4 (files <=50MB)
                    const decryptedData = await window.crypto.subtle.decrypt(
                        {
                            name: "AES-GCM",
                            iv: iv.buffer as ArrayBuffer,
                            ...(aad ? { additionalData: toArrayBuffer(aad) } : {}),
                        },
                        fileKey,
                        encryptedData.slice(dataOffset),
                    );
                    decryptedBlob = new Blob([decryptedData], { type: mimeType });
                }

                setDownloadProgress(100);

                // Optimistically update download count in cache
                queryClient.setQueryData(
                    [["chatFileShare", "getShareDetails"], { input: { shareId }, type: "query" }],
                    (oldData: { success: true; share: ShareDetails } | undefined) => {
                        if (!oldData) return oldData;
                        return {
                            ...oldData,
                            share: {
                                ...oldData.share,
                                downloadCount: oldData.share.downloadCount + 1,
                            },
                        };
                    }
                );

                return {
                    blob: decryptedBlob,
                    filename: fileInfo.filename,
                };
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "Failed to download file";
                toast.error(message);
                throw error;
            } finally {
                setIsDownloading(false);
            }
        },
        [hasHybridKeyPair, isUnlocked, getUnlockedHybridSecretKey, queryClient, utils, getFileAccessMutation]
    );

    /**
     * Download shared file and trigger browser download
     */
    const downloadAndSave = useCallback(
        async (shareId: number) => {
            try {
                const { blob, filename } = await downloadSharedFile(shareId);

                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                toast.success("File downloaded successfully!");
            } catch {
                // Error already handled in downloadSharedFile
            }
        },
        [downloadSharedFile]
    );

    /**
     * Preview shared file (for supported types)
     */
    const previewSharedFile = useCallback(
        async (shareId: number): Promise<{ url: string; revoke: () => void }> => {
            const { blob } = await downloadSharedFile(shareId);
            const url = URL.createObjectURL(blob);
            return { url, revoke: () => URL.revokeObjectURL(url) };
        },
        [downloadSharedFile]
    );

    return {
        // State
        isDownloading,
        downloadProgress,
        hasKeys: hasHybridKeyPair,

        // Actions
        downloadSharedFile,
        downloadAndSave,
        previewSharedFile,

        // Queries
        useShareDetails,
    };
}
