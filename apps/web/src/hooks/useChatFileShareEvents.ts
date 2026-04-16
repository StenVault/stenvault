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

/**
 * Hook to handle real-time file share events
 *
 * Automatically invalidates relevant queries when:
 * - A share is revoked (updates SharedFileCard UI)
 * - A file is shared with us (shows notification + updates list)
 */
export function useChatFileShareEvents() {
    const queryClient = useQueryClient();
    const { onShareRevoked, onFileShared, isConnected } = useWebSocket();

    useEffect(() => {
        if (!isConnected) return;

        // Handle share revoked event
        const cleanupRevoked = onShareRevoked((event: ShareRevokedEvent) => {
            // Invalidate share details for this specific share
            queryClient.invalidateQueries({
                queryKey: ["chatFileShare", "getShareDetails", event.shareId],
            });

            // Invalidate list queries to update status
            queryClient.invalidateQueries({
                queryKey: ["chatFileShare", "listSharedWithMe"],
            });

            // Invalidate stats
            queryClient.invalidateQueries({
                queryKey: ["chatFileShare", "getShareStats"],
            });

            // Show toast notification
            toast.info("A file share has been revoked", {
                description: "The owner revoked access to a shared file.",
                duration: 5000,
            });
        });

        // Handle new file shared event
        const cleanupShared = onFileShared((event: FileSharedEvent) => {
            // Invalidate list queries to show new share
            queryClient.invalidateQueries({
                queryKey: ["chatFileShare", "listSharedWithMe"],
            });

            // Invalidate stats
            queryClient.invalidateQueries({
                queryKey: ["chatFileShare", "getShareStats"],
            });

            // Note: Chat messages are fetched via REST (not tRPC), so they're
            // updated via the WebSocket message:new event in ChatMain.tsx

            // Show toast notification
            toast.success("New file shared", {
                description: "You received a shared file",
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
