/**
 * MobileChat - Mobile-optimized Chat Page
 * 
 * Two-view navigation:
 * 1. Conversations List - Shows all chat connections
 * 2. Active Chat - Message thread with selected user
 * 
 * Features:
 * - Smooth slide transitions between views
 * - Pull-to-refresh on conversation list
 * - E2E encryption indicator
 * - Online status indicators
 * - Native-feeling gestures
 */

import { motion, AnimatePresence } from "framer-motion";
import {
    MessageCircle,
    Plus,
    UserPlus,
    Shield,
    Wifi,
    WifiOff,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTheme } from "@/contexts/ThemeContext";
import { hapticTap } from "@/lib/haptics";
import {
    PageTransition,
    PullToRefresh,
    EmptyState,
    LoadingState,
} from "@/components/mobile-v2";
import { InviteModal } from "@/components/chat/InviteModal";
import { AcceptInviteModal } from "@/components/chat/AcceptInviteModal";
import { useMobileChat } from "./hooks/useMobileChat";
import { MobileChatConversation } from "./MobileChatConversation";
import {
    TRANSITION_DURATION,
    TRANSITION_EASE,
    SLIDE_VARIANTS,
    ITEM_STAGGER_DELAY,
    AVATAR_SIZE,
    ONLINE_INDICATOR_SIZE,
    MAX_UNREAD_DISPLAY,
} from "./constants";
import type {
    Connection,
    ConversationsListProps,
    ConversationItemProps,
    ActionButtonProps,
} from "./types";

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export function MobileChat() {
    const {
        view,
        selectedUserId,
        connections,
        onlineUsers,
        showInviteModal,
        showAcceptInviteModal,
        isConnected,
        isLoading,
        selectConversation,
        goBackToList,
        openInviteModal,
        closeInviteModal,
        openAcceptInviteModal,
        closeAcceptInviteModal,
        refetchConnections,
    } = useMobileChat();

    return (
        <PageTransition>
            <div style={{ height: "100%", position: "relative", overflow: "hidden" }}>
                {/* Conversations List View */}
                <AnimatePresence mode="wait">
                    {view === "list" && (
                        <motion.div
                            key="list"
                            initial={SLIDE_VARIANTS.list.initial}
                            exit={SLIDE_VARIANTS.list.exit}
                            transition={{ duration: TRANSITION_DURATION, ease: TRANSITION_EASE }}
                            style={{ height: "100%" }}
                        >
                            <ConversationsList
                                connections={connections}
                                onlineUsers={onlineUsers}
                                isConnected={isConnected}
                                isLoading={isLoading}
                                onSelectConversation={selectConversation}
                                onRefresh={refetchConnections}
                                onInvite={openInviteModal}
                                onAcceptInvite={openAcceptInviteModal}
                            />
                        </motion.div>
                    )}

                    {view === "conversation" && selectedUserId && (
                        <motion.div
                            key="conversation"
                            initial={SLIDE_VARIANTS.conversation.initial}
                            animate={SLIDE_VARIANTS.conversation.animate}
                            exit={SLIDE_VARIANTS.conversation.exit}
                            transition={{ duration: TRANSITION_DURATION, ease: TRANSITION_EASE }}
                            style={{ height: "100%" }}
                        >
                            <MobileChatConversation
                                userId={selectedUserId}
                                onBack={goBackToList}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Modals */}
                {showInviteModal && (
                    <InviteModal isOpen={showInviteModal} onClose={closeInviteModal} />
                )}
                {showAcceptInviteModal && (
                    <AcceptInviteModal isOpen={showAcceptInviteModal} onClose={closeAcceptInviteModal} />
                )}
            </div>
        </PageTransition>
    );
}

// ─────────────────────────────────────────────────────────────
// CONVERSATIONS LIST
// ─────────────────────────────────────────────────────────────

function ConversationsList({
    connections,
    onlineUsers,
    isConnected,
    isLoading,
    onSelectConversation,
    onRefresh,
    onInvite,
    onAcceptInvite,
}: ConversationsListProps) {
    const { theme } = useTheme();

    return (
        <PullToRefresh onRefresh={onRefresh}>
            <div style={{ minHeight: "100%", paddingBottom: 80 }}>
                {/* Header */}
                <div
                    style={{
                        padding: "20px 16px 12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <div>
                        <h1
                            style={{
                                fontSize: 24,
                                fontWeight: 700,
                                color: "var(--foreground)",
                                margin: 0,
                            }}
                        >
                            Messages
                        </h1>
                        <p
                            style={{
                                fontSize: 13,
                                color: "var(--muted-foreground)",
                                margin: "4px 0 0",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                            }}
                        >
                            <Shield size={14} />
                            Secure messaging
                        </p>
                    </div>

                    {/* Connection Status */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "6px 10px",
                            borderRadius: 20,
                            backgroundColor: isConnected
                                ? `${theme.semantic.success}15`
                                : `${theme.semantic.error}15`,
                        }}
                    >
                        {isConnected ? (
                            <Wifi size={14} style={{ color: theme.semantic.success }} />
                        ) : (
                            <WifiOff size={14} style={{ color: theme.semantic.error }} />
                        )}
                        <span
                            style={{
                                fontSize: 11,
                                fontWeight: 500,
                                color: isConnected ? theme.semantic.success : theme.semantic.error,
                            }}
                        >
                            {isConnected ? "Online" : "Offline"}
                        </span>
                    </div>
                </div>

                {/* Action Buttons */}
                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        padding: "0 16px 16px",
                    }}
                >
                    <ActionButton
                        icon={Plus}
                        label="New Invite"
                        onClick={onInvite}
                        primary
                    />
                    <ActionButton
                        icon={UserPlus}
                        label="Accept Code"
                        onClick={onAcceptInvite}
                    />
                </div>

                {/* Content */}
                {isLoading ? (
                    <LoadingState skeleton skeletonCount={5} />
                ) : connections.length === 0 ? (
                    <EmptyState
                        icon={MessageCircle}
                        title="No conversations yet"
                        description="Start by inviting someone or accepting an invite code"
                        action={{
                            label: "Create Invite",
                            onClick: onInvite,
                        }}
                    />
                ) : (
                    <div style={{ padding: "0 16px" }}>
                        {connections.map((connection, index) => (
                            <ConversationItem
                                key={connection.id}
                                connection={connection}
                                isOnline={onlineUsers.has(connection.connectedUserId)}
                                onClick={() => {
                                    hapticTap();
                                    onSelectConversation(connection.connectedUserId);
                                }}
                                delay={index * ITEM_STAGGER_DELAY}
                            />
                        ))}
                    </div>
                )}
            </div>
        </PullToRefresh>
    );
}

// ─────────────────────────────────────────────────────────────
// CONVERSATION ITEM
// ─────────────────────────────────────────────────────────────

function ConversationItem({ connection, isOnline, onClick, delay = 0 }: ConversationItemProps) {
    const { theme } = useTheme();
    const displayName = connection.nickname || connection.connectedUser?.name || "Unknown";
    const initials = displayName.charAt(0).toUpperCase();
    const lastMessage = connection.lastMessage;
    const hasUnread = (connection.unreadCount ?? 0) > 0;

    return (
        <motion.button
            onClick={onClick}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.2 }}
            whileTap={{ scale: 0.98, backgroundColor: "var(--muted)" }}
            aria-label={`Chat with ${displayName}${hasUnread ? `, ${connection.unreadCount} unread messages` : ''}`}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: 12,
                marginBottom: 4,
                backgroundColor: "transparent",
                border: "none",
                borderRadius: 12,
                cursor: "pointer",
                textAlign: "left",
            }}
        >
            {/* Avatar */}
            <div style={{ position: "relative", flexShrink: 0 }}>
                <div
                    style={{
                        width: AVATAR_SIZE.list,
                        height: AVATAR_SIZE.list,
                        borderRadius: 14,
                        backgroundColor: `${theme.brand.primary}15`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        fontWeight: 600,
                        color: theme.brand.primary,
                    }}
                >
                    {initials}
                </div>
                {/* Online Indicator */}
                {isOnline && (
                    <div
                        style={{
                            position: "absolute",
                            bottom: 0,
                            right: 0,
                            width: ONLINE_INDICATOR_SIZE.list,
                            height: ONLINE_INDICATOR_SIZE.list,
                            borderRadius: "50%",
                            backgroundColor: theme.semantic.success,
                            border: "2px solid var(--background)",
                        }}
                    />
                )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: "hidden" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 2,
                    }}
                >
                    <span
                        style={{
                            fontSize: 15,
                            fontWeight: hasUnread ? 600 : 500,
                            color: "var(--foreground)",
                        }}
                    >
                        {displayName}
                    </span>
                    {lastMessage && (
                        <span
                            style={{
                                fontSize: 11,
                                color: "var(--muted-foreground)",
                            }}
                        >
                            {formatDistanceToNow(new Date(lastMessage.createdAt), { addSuffix: false })}
                        </span>
                    )}
                </div>
                <p
                    style={{
                        fontSize: 13,
                        color: hasUnread ? "var(--foreground)" : "var(--muted-foreground)",
                        fontWeight: hasUnread ? 500 : 400,
                        margin: 0,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {lastMessage?.content || "No messages yet"}
                </p>
            </div>

            {/* Unread Badge */}
            {hasUnread && (
                <div
                    style={{
                        minWidth: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: theme.brand.primary,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 6px",
                    }}
                >
                    <span
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#FFFFFF",
                        }}
                    >
                        {(connection.unreadCount ?? 0) > MAX_UNREAD_DISPLAY ? `${MAX_UNREAD_DISPLAY}+` : (connection.unreadCount ?? 0)}
                    </span>
                </div>
            )}
        </motion.button>
    );
}

// ─────────────────────────────────────────────────────────────
// ACTION BUTTON
// ─────────────────────────────────────────────────────────────

function ActionButton({ icon: Icon, label, onClick, primary }: ActionButtonProps) {
    const { theme } = useTheme();

    return (
        <motion.button
            onClick={() => {
                hapticTap();
                onClick();
            }}
            whileTap={{ scale: 0.97 }}
            aria-label={label}
            style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "12px 16px",
                borderRadius: 12,
                border: primary ? "none" : "1px solid var(--border)",
                backgroundColor: primary ? theme.brand.primary : "transparent",
                color: primary ? "#FFFFFF" : "var(--foreground)",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
            }}
        >
            <Icon size={18} />
            {label}
        </motion.button>
    );
}

export default MobileChat;
