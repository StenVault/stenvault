/**
 * Chat Local Upload Hook
 *
 * Handles uploading local files to Vault and auto-sharing in chat.
 * This unifies the file upload flow so all chat files go through Vault.
 *
 * Flow:
 * 1. Find or create "Chat Files" folder in Vault
 * 2. Encrypt file with V4 CVEF (X25519 + ML-KEM-768 hybrid PQC)
 * 3. Upload to Vault
 * 4. Auto-share to chat recipient via chatFileShare
 *
 * @module hooks/useChatLocalUpload
 */

import { useCallback, useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useChatFileShare, type ShareFileOptions } from "./useChatFileShare";
import { useMasterKey } from "@/hooks/useMasterKey";
import { encryptFilename } from "@/lib/fileCrypto";
import { encryptFileV4 } from "@/lib/fileEncryptor";
import { toast } from "sonner";

// Folder name for chat uploads
const CHAT_FILES_FOLDER_NAME = "Chat Files";

export interface ChatLocalUploadOptions {
    file: File;
    recipientUserId: number;
    permission?: "view" | "download";
    expiresIn?: "1h" | "24h" | "7d" | "30d" | "never";
    maxDownloads?: number;
    messageContent?: string;
    onProgress?: (progress: number) => void;
}

export interface ChatLocalUploadResult {
    fileId: number;
    shareId: number;
    messageId: number;
}

/**
 * Hook for uploading local files to Vault and sharing in chat
 */
export function useChatLocalUpload() {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const chatFilesFolderIdRef = useRef<number | null>(null);

    const { shareFile, hasKeys } = useChatFileShare();
    const { deriveFilenameKey, getHybridPublicKey } = useMasterKey();
    const utils = trpc.useUtils();

    // Mutations
    const createFolderMutation = trpc.folders.create.useMutation();
    const getUploadUrlMutation = trpc.files.getUploadUrl.useMutation();
    const confirmUploadMutation = trpc.files.confirmUpload.useMutation();

    /**
     * Find or create the "Chat Files" folder
     */
    const getOrCreateChatFilesFolder = useCallback(async (): Promise<number> => {
        // Check cache first
        if (chatFilesFolderIdRef.current) {
            return chatFilesFolderIdRef.current;
        }

        // Fetch root folders to find "Chat Files"
        const rootFolders = await utils.folders.list.fetch({ parentId: null });

        const chatFilesFolder = rootFolders.find(
            (f) => f.name === CHAT_FILES_FOLDER_NAME
        );

        if (chatFilesFolder) {
            chatFilesFolderIdRef.current = chatFilesFolder.id;
            return chatFilesFolder.id;
        }

        // Create the folder if it doesn't exist
        const newFolder = await createFolderMutation.mutateAsync({
            name: CHAT_FILES_FOLDER_NAME,
            parentId: null,
        });

        chatFilesFolderIdRef.current = newFolder.id;
        return newFolder.id;
    }, [utils.folders.list, createFolderMutation]);

    /**
     * Upload a local file to Vault and share in chat
     */
    const uploadAndShare = useCallback(
        async (options: ChatLocalUploadOptions): Promise<ChatLocalUploadResult> => {
            const {
                file,
                recipientUserId,
                permission = "download",
                expiresIn = "7d",
                maxDownloads,
                messageContent,
                onProgress,
            } = options;

            // Validate E2E keys
            if (!hasKeys) {
                throw new Error(
                    "E2E keys not initialized. Please set up chat encryption first."
                );
            }

            // Validate file size (100MB limit for chat)
            const MAX_CHAT_FILE_SIZE = 100 * 1024 * 1024;
            if (file.size > MAX_CHAT_FILE_SIZE) {
                throw new Error(
                    `File size exceeds chat limit of ${MAX_CHAT_FILE_SIZE / 1024 / 1024}MB`
                );
            }

            setIsUploading(true);
            setProgress(0);

            try {
                // 1. Get or create "Chat Files" folder
                const folderId = await getOrCreateChatFilesFolder();
                setProgress(5);
                onProgress?.(5);

                // 2. Encrypt file with V4 CVEF (hybrid PQC)
                const hybridPublicKey = await getHybridPublicKey();
                setProgress(10);
                onProgress?.(10);

                const hybridResult = await encryptFileV4(file, hybridPublicKey);
                const encryptedData = await hybridResult.blob.arrayBuffer();
                setProgress(30);
                onProgress?.(30);

                // 3. Encrypt filename (zero-knowledge: server never sees plaintext name or extension)
                const filenameKey = await deriveFilenameKey();
                const { encryptedFilename, iv: filenameIv } = await encryptFilename(file.name, filenameKey);

                // 4. Get upload URL from Vault
                const { uploadUrl, fileId } = await getUploadUrlMutation.mutateAsync({
                    filename: 'encrypted',
                    contentType: 'application/octet-stream',
                    size: encryptedData.byteLength,
                    folderId,
                    encryptedFilename,
                    filenameIv,
                    plaintextExtension: '',
                    originalMimeType: file.type || undefined,
                });
                setProgress(35);
                onProgress?.(35);

                // 5. Upload encrypted file to R2
                const uploadResponse = await fetch(uploadUrl, {
                    method: "PUT",
                    body: encryptedData,
                    headers: {
                        "Content-Type": "application/octet-stream",
                    },
                });

                if (!uploadResponse.ok) {
                    throw new Error(`Upload failed: ${uploadResponse.statusText}`);
                }
                setProgress(70);
                onProgress?.(70);

                // 6. Confirm upload with V4 encryption metadata
                await confirmUploadMutation.mutateAsync({
                    fileId,
                    encryptionIv: hybridResult.metadata.iv,
                    encryptionSalt: '',
                    encryptionVersion: 4,
                });
                setProgress(85);
                onProgress?.(85);

                // 7. Auto-share to recipient
                const shareOptions: ShareFileOptions = {
                    fileId,
                    recipientUserId,
                    permission,
                    expiresIn,
                    maxDownloads,
                    messageContent: messageContent || 'Sent a file',
                };

                const shareResult = await shareFile(shareOptions);
                setProgress(100);
                onProgress?.(100);

                // Invalidate folder cache to show new file
                utils.folders.list.invalidate();

                return {
                    fileId,
                    shareId: shareResult.shareId,
                    messageId: shareResult.messageId,
                };
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "Failed to upload file";
                toast.error(message);
                throw error;
            } finally {
                setIsUploading(false);
                setProgress(0);
            }
        },
        [
            hasKeys,
            getOrCreateChatFilesFolder,
            getHybridPublicKey,
            deriveFilenameKey,
            getUploadUrlMutation,
            confirmUploadMutation,
            shareFile,
            utils.folders.list,
        ]
    );

    return {
        uploadAndShare,
        isUploading,
        progress,
        hasKeys,
    };
}
