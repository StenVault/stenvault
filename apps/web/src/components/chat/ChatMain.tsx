import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Menu,
    Phone,
    Video,
    MoreVertical,
    Info,
    UserX,
    Search,
    MessageSquarePlus,
    Loader2,
    Shield,
    Lock,
} from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useCryptoStore } from "@/stores/cryptoStore";
import { useE2ECrypto } from "@/hooks/useE2ECrypto";
import { useMasterKey } from "@/hooks/useMasterKey";
import { ChatInputArea } from "./ChatInputArea";
import { VaultUnlockModal } from "@/components/VaultUnlockModal";
import { MessageBubble } from "./MessageBubble";
import { format, isToday, isYesterday } from "date-fns";
import { enGB } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
    base64ToUint8Array,
    deserializeHybridPublicKey,
} from "@/lib/platform";
import type { HybridPublicKeySerialized } from "@/lib/platform";

// Types for chat message and connection from tRPC
interface ChatMessage {
    id: number;
    fromUserId: number;
    toUserId: number;
    messageType: 'text' | 'file' | 'image' | 'video' | 'vault_file';
    content?: string | null;
    fileKey?: string | null;
    filename?: string | null;
    fileSize?: number | null;
    iv?: string | null;
    salt?: string | null;
    isEncrypted: boolean;
    keyVersion?: number | null;
    kemCiphertext?: string | null;
    isRead: boolean;
    isDeleted: boolean;
    createdAt: Date | string;
    chatFileShareId?: number | null;
}

interface ChatConnection {
    id: number;
    userId: number;
    connectedUserId: number;
    nickname?: string | null;
    status: 'pending' | 'accepted' | 'blocked';
    createdAt: Date | string;
    updatedAt: Date | string;
    connectedUserEmail?: string | null;
    connectedUserName?: string | null;
}

interface ChatMainProps {
    selectedUserId: number | null;
    onOpenMenu: () => void;
    onCreateInvite: () => void;
}

/**
 * Chat Main - Main chat area
 *
 * Features:
 * - Header with user info and actions
 * - Auto-scrolling message list
 * - Floating input with animations
 * - Typing indicator
 * - Hybrid PQC E2E encryption
 */
export function ChatMain({ selectedUserId, onOpenMenu, onCreateInvite }: ChatMainProps) {
    // Empty state when no chat is selected
    if (!selectedUserId) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-6 max-w-md px-4">
                    {/* Decorative illustration */}
                    <div className="relative w-32 h-32 mx-auto">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-400 to-purple-400 rounded-full opacity-20 animate-pulse" />
                        <div className="absolute inset-4 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full opacity-40 animate-pulse animation-delay-300" />
                        <div className="absolute inset-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full flex items-center justify-center">
                            <Search className="w-12 h-12 text-white" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                            Select a conversation
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400">
                            Choose a conversation from the sidebar to start messaging
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <Button
                            size="lg"
                            onClick={onOpenMenu}
                            className="lg:hidden bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg"
                        >
                            <Menu className="h-5 w-5 mr-2" />
                            Open Conversations
                        </Button>

                        <Button
                            size="lg"
                            onClick={onCreateInvite}
                            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg"
                            aria-label="Create new chat invite"
                        >
                            <MessageSquarePlus className="h-5 w-5 mr-2" />
                            Create Invite
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return <ActiveChat userId={selectedUserId} onOpenMenu={onOpenMenu} />;
}

/**
 * Active Chat - Chat with messages
 */
interface ActiveChatProps {
    userId: number;
    onOpenMenu: () => void;
}

function ActiveChat({ userId, onOpenMenu }: ActiveChatProps) {
    const [isTyping, setIsTyping] = useState(false);
    const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [beforeId, setBeforeId] = useState<number | undefined>(undefined);
    const [unlockModalOpen, setUnlockModalOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const previousScrollHeight = useRef(0);
    // PERF FIX: Debounce message refetch to prevent N+1 queries
    const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingMessageIdsRef = useRef<Set<number>>(new Set());
    // Cache plaintext of sent messages (encrypted for recipient, sender can't decrypt)
    const sentPlaintextCache = useRef<Map<number, string>>(new Map());
    const pendingPlaintext = useRef("");

    const { cacheHybridPublicKey, getCachedHybridPublicKey } = useCryptoStore();
    const { encryptMessage } = useE2ECrypto();
    const { isUnlocked, isConfigured } = useMasterKey();
    const {
        sendMessage: sendWsMessage,
        sendTyping,
        onNewMessage,
        onTyping,
    } = useWebSocket();

    const utils = trpc.useUtils();

    // Fetch connection details via tRPC
    const { data: connectionsData } = trpc.chat.getMyConnections.useQuery();
    const connection = connectionsData?.connections?.find(c => c.connectedUserId === userId) as ChatConnection | undefined ?? null;

    // Fetch messages via tRPC
    const { data: messagesData, isLoading: isLoadingMessages, refetch: refetchMessages } = trpc.chat.getMessages.useQuery(
        { withUserId: userId, limit: 50, beforeId },
        { enabled: !!userId }
    );

    // Sync messages from tRPC to local state
    // Merges cached plaintexts for own sent messages (encrypted for recipient, not sender)
    useEffect(() => {
        if (messagesData?.messages) {
            const transformed = messagesData.messages.map(msg => {
                // For own sent messages, inject cached plaintext so they display correctly
                const cachedPlaintext = sentPlaintextCache.current.get(msg.id);
                if (cachedPlaintext && msg.fromUserId !== userId) {
                    return {
                        ...msg,
                        createdAt: msg.createdAt,
                        content: cachedPlaintext,
                        isEncrypted: false,
                    };
                }
                return {
                    ...msg,
                    createdAt: msg.createdAt,
                };
            }) as ChatMessage[];
            if (beforeId) {
                // Prepend older messages
                setLocalMessages(prev => [...transformed, ...prev]);
            } else {
                // Replace all
                setLocalMessages(transformed);
            }
            setHasMoreMessages(messagesData.messages.length === 50);
        }
    }, [messagesData, beforeId, userId]);

    const messages = localMessages;

    // Wrapper function for refetch (compatible with existing code)
    const fetchMessages = useCallback(() => {
        setBeforeId(undefined);
        refetchMessages();
    }, [refetchMessages]);

    // Load more messages (infinite scroll)
    const loadMoreMessages = useCallback(async () => {
        if (isLoadingMore || !hasMoreMessages || messages.length === 0) return;

        const oldestMessageId = messages[0]?.id;
        if (!oldestMessageId) return;

        // Save scroll position before loading
        if (messagesContainerRef.current) {
            previousScrollHeight.current = messagesContainerRef.current.scrollHeight;
        }

        setIsLoadingMore(true);
        setBeforeId(oldestMessageId);
        // The query will auto-refetch with new beforeId and update via useEffect
        setTimeout(() => setIsLoadingMore(false), 500);
    }, [messages, isLoadingMore, hasMoreMessages]);

    // Fetch peer's hybrid public key via tRPC
    const { data: peerHybridKeyData } = trpc.chat.getPeerHybridPublicKey.useQuery(
        { userId },
        { enabled: !!userId }
    );

    // Cache peer hybrid public key when fetched
    useEffect(() => {
        if (peerHybridKeyData?.hybridPublicKey) {
            const { x25519PublicKey, mlkem768PublicKey, keyVersion } = peerHybridKeyData.hybridPublicKey;
            cacheHybridPublicKey(userId, x25519PublicKey, mlkem768PublicKey, keyVersion);
        }
    }, [peerHybridKeyData, userId, cacheHybridPublicKey]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current && !isLoadingMore) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isLoadingMore]);

    // Restore scroll position after loading more messages
    useEffect(() => {
        if (isLoadingMore === false && messagesContainerRef.current && previousScrollHeight.current > 0) {
            const newScrollHeight = messagesContainerRef.current.scrollHeight;
            const scrollDiff = newScrollHeight - previousScrollHeight.current;
            messagesContainerRef.current.scrollTop = scrollDiff;
            previousScrollHeight.current = 0;
        }
    }, [isLoadingMore]);

    // Detect scroll to top for infinite scroll
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        if (target.scrollTop < 100 && !isLoadingMore && hasMoreMessages) {
            loadMoreMessages();
        }
    }, [isLoadingMore, hasMoreMessages, loadMoreMessages]);

    // Listen for new messages via WebSocket with debouncing
    // PERF FIX: Instead of fetching all 50 messages for each incoming message,
    // we debounce the fetch to batch multiple rapid messages into a single request
    useEffect(() => {
        const cleanup = onNewMessage((message) => {
            if (message.fromUserId === userId || message.toUserId === userId) {
                // Track pending message IDs for debugging
                pendingMessageIdsRef.current.add(message.messageId);

                // Clear existing debounce timer
                if (fetchDebounceRef.current) {
                    clearTimeout(fetchDebounceRef.current);
                }

                // Debounce: wait 300ms before fetching to batch rapid messages
                fetchDebounceRef.current = setTimeout(() => {
                    setBeforeId(undefined);
                    utils.chat.getMessages.invalidate({ withUserId: userId });
                    pendingMessageIdsRef.current.clear();
                }, 300);
            }
        });

        // Cleanup debounce timer on unmount
        return () => {
            cleanup?.();
            if (fetchDebounceRef.current) {
                clearTimeout(fetchDebounceRef.current);
            }
        };
    }, [onNewMessage, userId, utils]);

    // Listen for typing indicators
    useEffect(() => {
        onTyping((indicator) => {
            if (indicator.fromUserId === userId) {
                setIsTyping(indicator.isTyping);
            }
        });
    }, [onTyping, userId]);

    // Send message mutation via tRPC
    const sendMessageMutation = trpc.chat.sendMessage.useMutation({
        onSuccess: (data, variables) => {
            const messageId = data.messageId;
            // Cache plaintext for this message (sender can't decrypt their own messages)
            if (pendingPlaintext.current) {
                sentPlaintextCache.current.set(messageId, pendingPlaintext.current);
            }

            // Send via WebSocket for real-time delivery
            sendWsMessage({
                toUserId: userId,
                messageId,
                content: variables.content || "",
                messageType: variables.messageType || "text",
                isEncrypted: variables.isEncrypted ?? false,
                iv: variables.iv,
            });

            // PERF FIX: Add message to state optimistically
            // Use cached plaintext for display (ciphertext can't be decrypted by sender)
            const newMessage: ChatMessage = {
                id: messageId,
                fromUserId: 0,
                toUserId: userId,
                messageType: variables.messageType || "text",
                content: pendingPlaintext.current || variables.content,
                fileKey: variables.fileKey,
                filename: variables.filename,
                fileSize: variables.fileSize,
                iv: variables.iv,
                salt: variables.salt,
                isEncrypted: false,
                keyVersion: variables.keyVersion ?? 1,
                kemCiphertext: variables.kemCiphertext,
                isRead: false,
                isDeleted: false,
                createdAt: new Date().toISOString(),
            };
            setLocalMessages(prev => [...prev, newMessage]);
        },
        onError: () => {
            toast.error("Failed to send message");
        },
    });

    // Handle send message (text only - files go through useChatLocalUpload)
    const handleSendMessage = async (content: string) => {
        try {
            // Get peer's hybrid public key (from cache or fresh fetch)
            const cachedKey = getCachedHybridPublicKey(userId);
            if (!cachedKey) {
                toast.error("Recipient's encryption key not available. Try again shortly.");
                return;
            }

            if (!isUnlocked) {
                toast.error("Vault must be unlocked to send encrypted messages.");
                return;
            }

            // Cache plaintext before encryption (sender can't decrypt their own messages)
            pendingPlaintext.current = content;

            // Deserialize to HybridPublicKey (Uint8Array form)
            const recipientHybridPubKey = deserializeHybridPublicKey({
                classical: cachedKey.x25519PublicKey,
                postQuantum: cachedKey.mlkem768PublicKey,
                algorithm: 'x25519-ml-kem-768',
            } as HybridPublicKeySerialized);

            // Encrypt with hybrid KEM
            const { ciphertext, iv, salt, kemCiphertext } = await encryptMessage(
                content,
                recipientHybridPubKey
            );

            // Send encrypted message
            sendMessageMutation.mutate({
                toUserId: userId,
                messageType: "text",
                content: ciphertext,
                iv,
                salt,
                kemCiphertext,
                isEncrypted: true,
                keyVersion: cachedKey.keyVersion,
            });
        } catch (error) {
            console.error("Failed to encrypt/send message:", error);
            toast.error("Failed to send encrypted message");
        }
    };

    // Handle typing indicator
    const handleTyping = (typing: boolean) => {
        sendTyping(userId, typing);

        if (typing) {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            typingTimeoutRef.current = setTimeout(() => {
                sendTyping(userId, false);
            }, 3000);
        }
    };

    const userName = connection?.nickname || connection?.connectedUserName || connection?.connectedUserEmail || "Unknown";
    const initials = userName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

    // Group messages by date
    type MessageType = {
        id: number;
        createdAt: Date | string;
        fromUserId: number;
        toUserId: number;
        content: string | null;
        messageType: "text" | "file" | "image" | "video" | "vault_file";
        isEncrypted: boolean;
        iv?: string | null;
        salt?: string | null;
        kemCiphertext?: string | null;
        isRead: boolean;
        fileKey?: string | null;
        filename?: string | null;
        fileSize?: number | null;
        chatFileShareId?: number | null;
    };

    const groupedMessages = messages.reduce((groups: Record<string, MessageType[]>, message) => {
        const date = format(new Date(message.createdAt), "yyyy-MM-dd");
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(message as MessageType);
        return groups;
    }, {} as Record<string, MessageType[]>);

    // Vault locked: show overlay blocking the chat
    const vaultLocked = isConfigured && !isUnlocked;

    return (
        <div className="h-full flex flex-col relative">
            {/* Vault Lock Overlay */}
            {vaultLocked && (
                <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-background/80">
                    <div className="text-center p-8 max-w-md">
                        <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                            <Shield className="h-8 w-8 text-amber-500" />
                        </div>
                        <h2 className="text-xl font-semibold mb-2">Vault Locked</h2>
                        <p className="text-muted-foreground mb-6">
                            Unlock your vault to send and read encrypted messages.
                        </p>
                        <Button
                            onClick={() => setUnlockModalOpen(true)}
                            size="lg"
                            className="gap-2"
                        >
                            <Lock className="h-4 w-4" />
                            Unlock Vault
                        </Button>
                    </div>
                </div>
            )}

            {/* Vault Unlock Modal (inline) */}
            <VaultUnlockModal
                isOpen={unlockModalOpen}
                onUnlock={() => setUnlockModalOpen(false)}
                onClose={() => setUnlockModalOpen(false)}
            />

            {/* Header - Premium design */}
            <header className="relative z-10 px-6 py-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm">
                <div className="flex items-center justify-between">
                    {/* User info */}
                    <div className="flex items-center gap-4">
                        {/* Mobile menu button */}
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={onOpenMenu}
                            className="lg:hidden"
                            aria-label="Open menu"
                        >
                            <Menu className="h-5 w-5" />
                        </Button>

                        {/* Avatar with online status */}
                        <div className="relative">
                            <Avatar className="h-11 w-11 border-2 border-white dark:border-slate-800 shadow-md">
                                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-semibold">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>
                            <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-slate-900 rounded-full" />
                        </div>

                        {/* Name and status */}
                        <div>
                            <h2 className="font-semibold text-slate-900 dark:text-white">
                                {userName}
                            </h2>
                            {isTyping ? (
                                <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium animate-pulse">
                                    typing...
                                </p>
                            ) : (
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Online
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {/* Call buttons */}
                        <Button
                            size="icon"
                            variant="ghost"
                            className="hidden sm:inline-flex hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label="Voice call"
                        >
                            <Phone className="h-5 w-5" />
                        </Button>

                        <Button
                            size="icon"
                            variant="ghost"
                            className="hidden sm:inline-flex hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label="Video call"
                        >
                            <Video className="h-5 w-5" />
                        </Button>

                        {/* More options */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="More options">
                                    <MoreVertical className="h-5 w-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem>
                                    <Info className="h-4 w-4 mr-2" />
                                    View Info
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                    <Search className="h-4 w-4 mr-2" />
                                    Search Chat
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-red-600 dark:text-red-400">
                                    <UserX className="h-4 w-4 mr-2" />
                                    Block User
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </header>

            {/* Messages Area */}
            <ScrollArea
                className="flex-1 p-4"
                onScrollCapture={handleScroll}
            >
                <div ref={messagesContainerRef} className="space-y-6">
                    {/* Loading more indicator */}
                    {isLoadingMore && (
                        <div className="flex justify-center py-4">
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Loading earlier messages...</span>
                            </div>
                        </div>
                    )}

                    {/* End of messages indicator */}
                    {!hasMoreMessages && messages.length > 0 && (
                        <div className="flex justify-center py-4">
                            <div className="text-xs text-slate-400">
                                • Start of conversation •
                            </div>
                        </div>
                    )}
                    {Object.entries(groupedMessages || {}).map(([date, dateMessages]) => {
                        const messageDate = new Date(date);
                        let dateLabel = format(messageDate, "d MMMM yyyy", { locale: enGB });

                        if (isToday(messageDate)) {
                            dateLabel = "Today";
                        } else if (isYesterday(messageDate)) {
                            dateLabel = "Yesterday";
                        }

                        return (
                            <div key={date} className="space-y-4">
                                {/* Date Divider */}
                                <div className="flex items-center justify-center my-6">
                                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent" />
                                    <Badge
                                        variant="outline"
                                        className="mx-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 px-3 py-1 shadow-sm"
                                    >
                                        {dateLabel}
                                    </Badge>
                                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent" />
                                </div>

                                {/* Messages for this date */}
                                <div className="space-y-3">
                                    {(dateMessages as MessageType[]).map((message: MessageType) => {
                                        const msgIsOwn = message.fromUserId !== userId;
                                        return (
                                            <MessageBubble
                                                key={message.id}
                                                message={message as any}
                                                isOwn={msgIsOwn}
                                                senderName={message.fromUserId === userId ? userName : undefined}
                                                sentPlaintext={msgIsOwn ? sentPlaintextCache.current.get(message.id) : undefined}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    <div ref={scrollRef} />
                </div>
            </ScrollArea>

            {/* Input Area - Floating design */}
            <div className="relative z-10 px-4 pb-4 pt-2 bg-gradient-to-t from-white dark:from-slate-900 via-white/50 dark:via-slate-900/50 to-transparent">
                <ChatInputArea
                    onSendMessage={handleSendMessage}
                    onTypingChange={handleTyping}
                    recipientUserId={userId}
                    recipientName={userName}
                />
            </div>
        </div>
    );
}
