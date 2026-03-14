/**
 * useMobileChat - Hook for Mobile Chat Logic
 *
 * Manages navigation between conversation list and active chat,
 * message handling, WebSocket integration, and E2E encryption state.
 *
 * @updated 2026-02-03 - Migrated from REST to tRPC
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useWebSocket } from "@/hooks/useWebSocket";
import { VIEW_TRANSITION_DELAY_MS } from "../constants";
import type { Connection, MobileChatState, MobileChatActions } from "../types";

export function useMobileChat(): MobileChatState & MobileChatActions {
    // Navigation state
    const [view, setView] = useState<"list" | "conversation">("list");
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

    // Modal state
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showAcceptInviteModal, setShowAcceptInviteModal] = useState(false);

    // Online users tracking
    const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());


    // WebSocket
    const { isConnected, onPresenceUpdate, checkPresence } = useWebSocket();

    const utils = trpc.useUtils();

    // Fetch connections via tRPC
    const { data: connectionsData, isLoading } = trpc.chat.getMyConnections.useQuery(undefined, {
        refetchOnWindowFocus: false,
    });

    // Filter accepted connections and transform
    // useMemo stabilizes the reference: .filter().map() creates a new array every render,
    // causing the useEffect below to loop infinitely without memoization.
    const connections = useMemo(() => (connectionsData?.connections ?? [])
        .filter(conn => conn.status === 'accepted')
        .map(conn => ({
            id: conn.id,
            userId: conn.userId,
            connectedUserId: conn.connectedUserId,
            nickname: conn.nickname,
            status: conn.status,
            createdAt: conn.createdAt instanceof Date ? conn.createdAt : new Date(String(conn.createdAt)),
            updatedAt: conn.updatedAt instanceof Date ? conn.updatedAt : new Date(String(conn.updatedAt)),
            connectedUser: conn.connectedUserEmail ? {
                id: conn.connectedUserId,
                name: conn.connectedUserName,
                email: conn.connectedUserEmail,
            } : undefined,
        })) as Connection[], [connectionsData?.connections]);

    // Refetch function for external use
    const refetchConnections = useCallback(async () => {
        await utils.chat.getMyConnections.invalidate();
    }, [utils]);

    // Check presence of all connections on mount
    useEffect(() => {
        if (connections.length > 0 && isConnected) {
            const userIds = connections.map((conn) => conn.connectedUserId);
            checkPresence(userIds);
        }
    }, [connections, isConnected, checkPresence]);

    // Listen for presence updates with optimization to prevent unnecessary re-renders
    useEffect(() => {
        const unsubscribe = onPresenceUpdate((update) => {
            setOnlineUsers((prev) => {
                const hasUser = prev.has(update.userId);

                // Early return if no change needed
                if (update.isOnline && hasUser) return prev;
                if (!update.isOnline && !hasUser) return prev;

                // Create new Set only if change is needed
                const next = new Set(prev);
                if (update.isOnline) {
                    next.add(update.userId);
                } else {
                    next.delete(update.userId);
                }
                return next;
            });
        });

        return unsubscribe;
    }, [onPresenceUpdate]);

    // Actions
    const selectConversation = useCallback((userId: number) => {
        setSelectedUserId(userId);
        setView("conversation");
    }, []);

    const goBackToList = useCallback(() => {
        const userIdToReset = selectedUserId;
        setView("list");
        // Delay clearing selection for smooth transition
        // Use functional update to avoid race condition if user quickly selects another conversation
        setTimeout(() => {
            setSelectedUserId((current) =>
                current === userIdToReset ? null : current
            );
        }, VIEW_TRANSITION_DELAY_MS);
    }, [selectedUserId]);

    const openInviteModal = useCallback(() => {
        setShowInviteModal(true);
    }, []);

    const closeInviteModal = useCallback(async () => {
        setShowInviteModal(false);
        await refetchConnections();
    }, [refetchConnections]);

    const openAcceptInviteModal = useCallback(() => {
        setShowAcceptInviteModal(true);
    }, []);

    const closeAcceptInviteModal = useCallback(async () => {
        setShowAcceptInviteModal(false);
        await refetchConnections();
    }, [refetchConnections]);

    return {
        // State
        view,
        selectedUserId,
        connections,
        onlineUsers,
        showInviteModal,
        showAcceptInviteModal,
        isConnected,
        isLoading,

        // Actions
        selectConversation,
        goBackToList,
        openInviteModal,
        closeInviteModal,
        openAcceptInviteModal,
        closeAcceptInviteModal,
        refetchConnections: async () => {
            await refetchConnections();
        },
    };
}

export default useMobileChat;
