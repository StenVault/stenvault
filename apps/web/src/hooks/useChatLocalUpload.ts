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

const CHAT_FILES_FOLDER_NAME = "Chat Files";
const FILE_KEY_STORAGE_PREFIX = "file:key:";
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

async function generateFileKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: "AES-GCM", length: AES_KEY_LENGTH },
        true, // extractable — needed for storage and re-encryption during sharing
        ["encrypt", "decrypt"]
    );
}

function generateRandomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
}

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

async function exportKeyToBytes(key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey("raw", key);
}

export function useChatLocalUpload() {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const chatFilesFolderIdRef = useRef<number | null>(null);

    const { shareFile, hasKeys } = useChatFileShare();
    const utils = trpc.useUtils();

    const createFolderMutation = trpc.folders.create.useMutation();
    const getUploadUrlMutation = trpc.files.getUploadUrl.useMutation();
    const confirmUploadMutation = trpc.files.confirmUpload.useMutation();

    const getOrCreateChatFilesFolder = useCallback(async (): Promise<number> => {
        if (chatFilesFolderIdRef.current) {
            return chatFilesFolderIdRef.current;
        }

        const rootFolders = await utils.folders.list.fetch({ parentId: null });

        const chatFilesFolder = rootFolders.find(
            (f) => f.name === CHAT_FILES_FOLDER_NAME
        );

        if (chatFilesFolder) {
            chatFilesFolderIdRef.current = chatFilesFolder.id;
            return chatFilesFolder.id;
        }

        const newFolder = await createFolderMutation.mutateAsync({
            name: CHAT_FILES_FOLDER_NAME,
            parentId: null,
        });

        chatFilesFolderIdRef.current = newFolder.id;
        return newFolder.id;
    }, [utils.folders.list, createFolderMutation]);

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

            if (!hasKeys) {
                throw new Error(
                    "E2E keys not initialized. Please set up chat encryption first."
                );
            }

            const MAX_CHAT_FILE_SIZE = 100 * 1024 * 1024;
            if (file.size > MAX_CHAT_FILE_SIZE) {
                throw new Error(
                    `File size exceeds chat limit of ${MAX_CHAT_FILE_SIZE / 1024 / 1024}MB`
                );
            }

            setIsUploading(true);
            setProgress(0);

            try {
                const folderId = await getOrCreateChatFilesFolder();
                setProgress(5);
                onProgress?.(5);

                const fileBuffer = await file.arrayBuffer();
                setProgress(10);
                onProgress?.(10);

                const fileKey = await generateFileKey();
                setProgress(15);
                onProgress?.(15);

                const { encryptedData, iv, salt } = await encryptFileData(
                    fileBuffer,
                    fileKey
                );
                setProgress(30);
                onProgress?.(30);

                const { uploadUrl, fileId } = await getUploadUrlMutation.mutateAsync({
                    filename: file.name,
                    contentType: file.type || "application/octet-stream",
                    size: encryptedData.byteLength,
                    folderId,
                });
                setProgress(35);
                onProgress?.(35);

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

                await confirmUploadMutation.mutateAsync({
                    fileId,
                    encryptionIv: iv,
                    encryptionSalt: salt,
                    encryptionVersion: 4,
                });
                setProgress(80);
                onProgress?.(80);

                const keyBytes = await exportKeyToBytes(fileKey);
                await storeFileEncryptionKey(fileId, keyBytes);
                setProgress(85);
                onProgress?.(85);

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
