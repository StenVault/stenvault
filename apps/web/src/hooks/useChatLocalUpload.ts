/**
 * Chat Local Upload Hook
 *
 * Handles uploading local files to Vault and auto-sharing in chat.
 * This unifies the file upload flow so all chat files go through Vault.
 *
 * Flow:
 * 1. Find or create "Chat Files" folder in Vault
 * 2. Generate random encryption key
 * 3. Encrypt file with AES-256-GCM
 * 4. Upload to Vault
 * 5. Store encryption key locally
 * 6. Auto-share to chat recipient via chatFileShare
 *
 * @module hooks/useChatLocalUpload
 */

import { useCallback, useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useChatFileShare, type ShareFileOptions } from "./useChatFileShare";
import { arrayBufferToBase64, toArrayBuffer } from "@/lib/platform";
import { setSecureItem } from "@/lib/secureStorage";
import { toast } from "sonner";

// Folder name for chat uploads
const CHAT_FILES_FOLDER_NAME = "Chat Files";

// Storage key prefix for file encryption keys
const FILE_KEY_STORAGE_PREFIX = "file:key:";

// Encryption constants
const AES_KEY_LENGTH = 256;
const GCM_IV_LENGTH = 12;
const SALT_LENGTH = 32;

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
 * Generate a random encryption key for file encryption
 */
async function generateFileKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: "AES-GCM", length: AES_KEY_LENGTH },
        true, // extractable for storage
        ["encrypt", "decrypt"]
    );
}

/**
 * Generate random bytes
 */
function generateRandomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Encrypt file data with AES-256-GCM
 */
async function encryptFileData(
    data: ArrayBuffer,
    key: CryptoKey
): Promise<{ encryptedData: ArrayBuffer; iv: string; salt: string }> {
    const iv = generateRandomBytes(GCM_IV_LENGTH);
    const salt = generateRandomBytes(SALT_LENGTH);

    const encryptedData = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: toArrayBuffer(iv) },
        key,
        data
    );

    return {
        encryptedData,
        iv: arrayBufferToBase64(toArrayBuffer(iv)),
        salt: arrayBufferToBase64(toArrayBuffer(salt)),
    };
}

/**
 * Export CryptoKey to raw bytes for storage
 */
async function exportKeyToBytes(key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey("raw", key);
}

/**
 * Hook for uploading local files to Vault and sharing in chat
 */
export function useChatLocalUpload() {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const chatFilesFolderIdRef = useRef<number | null>(null);

    const { shareFile, hasKeys } = useChatFileShare();
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
     * Store the file encryption key for later sharing
     */
    const storeFileEncryptionKey = useCallback(
        async (fileId: number, keyBytes: ArrayBuffer): Promise<void> => {
            const keyBase64 = arrayBufferToBase64(keyBytes);
            await setSecureItem(
                `${FILE_KEY_STORAGE_PREFIX}${fileId}`,
                keyBase64
            );
        },
        []
    );

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

                // 2. Read file content
                const fileBuffer = await file.arrayBuffer();
                setProgress(10);
                onProgress?.(10);

                // 3. Generate random encryption key
                const fileKey = await generateFileKey();
                setProgress(15);
                onProgress?.(15);

                // 4. Encrypt the file
                const { encryptedData, iv, salt } = await encryptFileData(
                    fileBuffer,
                    fileKey
                );
                setProgress(30);
                onProgress?.(30);

                // 5. Get upload URL from Vault
                const { uploadUrl, fileId } = await getUploadUrlMutation.mutateAsync({
                    filename: file.name,
                    contentType: file.type || "application/octet-stream",
                    size: encryptedData.byteLength,
                    folderId,
                });
                setProgress(35);
                onProgress?.(35);

                // 6. Upload encrypted file to R2
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

                // 7. Confirm upload with encryption metadata
                await confirmUploadMutation.mutateAsync({
                    fileId,
                    encryptionIv: iv,
                    encryptionSalt: salt,
                    encryptionVersion: 4,
                });
                setProgress(80);
                onProgress?.(80);

                // 8. Store encryption key for sharing
                const keyBytes = await exportKeyToBytes(fileKey);
                await storeFileEncryptionKey(fileId, keyBytes);
                setProgress(85);
                onProgress?.(85);

                // 9. Auto-share to recipient
                const shareOptions: ShareFileOptions = {
                    fileId,
                    recipientUserId,
                    permission,
                    expiresIn,
                    maxDownloads,
                    messageContent: messageContent || `Sent ${file.name}`,
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
            getUploadUrlMutation,
            confirmUploadMutation,
            storeFileEncryptionKey,
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
