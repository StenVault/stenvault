/**
 * Chat File Share Events Hook
 *
 * Listens to Socket.IO events for file share updates and
 * automatically invalidates React Query caches to update UI.
 *
 * Events handled:
 * - chat:share-revoked - When a share is revoked by owner
 * - chat:file-shared - When someone shares a file with us
 *
 * @module hooks/useChatFileShareEvents
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket, ShareRevokedEvent, FileSharedEvent } from "./useWebSocket";
import { toast } from "sonner";

export function useChatFileShareEvents() {
    const queryClient = useQueryClient();
    const { onShareRevoked, onFileShared, isConnected } = useWebSocket();

    useEffect(() => {
        if (!isConnected) return;

        const cleanupRevoked = onShareRevoked((event: ShareRevokedEvent) => {
            queryClient.invalidateQueries({
                queryKey: ["chatFileShare", "getShareDetails", event.shareId],
            });
            queryClient.invalidateQueries({
                queryKey: ["chatFileShare", "listSharedWithMe"],
            });
            queryClient.invalidateQueries({
                queryKey: ["chatFileShare", "getShareStats"],
            });

            toast.info("A file share has been revoked", {
                description: "The owner revoked access to a shared file.",
                duration: 5000,
            });
        });

        const cleanupShared = onFileShared((event: FileSharedEvent) => {
            queryClient.invalidateQueries({
                queryKey: ["chatFileShare", "listSharedWithMe"],
            });
            queryClient.invalidateQueries({
                queryKey: ["chatFileShare", "getShareStats"],
            });

            // Chat messages are updated via the WebSocket message:new event in ChatMain.tsx,
            // not here — they use REST, not tRPC.

            toast.success("New file shared", {
                description: `Received file: ${event.filename}`,
                duration: 5000,
            });
        });

        return () => {
            cleanupRevoked();
            cleanupShared();
        };
    }, [isConnected, onShareRevoked, onFileShared, queryClient]);

    return { isConnected };
}
