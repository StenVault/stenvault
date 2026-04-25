/**
 * Start Chat Modal
 *
 * One-click search and invite modal for Signal-style chat discovery.
 * Users can search by name or email and send invite with one click.
 *
 * @created 2026-01-17
 * @updated 2026-02-03 - Migrated from REST to tRPC
 */

import { useState } from "react";
import { Search, Loader2, UserPlus, X } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@stenvault/shared/ui/dialog";
import { Input } from "@stenvault/shared/ui/input";
import { Button } from "@stenvault/shared/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@stenvault/shared/lib/toast";
import { trpc } from "@/lib/trpc";
import { useDebounce } from "@/hooks/useDebounce";

// Type for discovered user from tRPC
interface DiscoveredUser {
    id: number;
    name: string | null;
    email: string;
}

interface StartChatModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function StartChatModal({ open, onOpenChange }: StartChatModalProps) {
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search, 300);

    const utils = trpc.useUtils();

    // Search users query via tRPC (users.search)
    const { data: searchData, isLoading } = trpc.users.search.useQuery(
        { query: debouncedSearch },
        {
            enabled: debouncedSearch.length >= 2,
            staleTime: 30000, // Cache for 30 seconds
        }
    );
    const searchResults = searchData?.users ?? [];

    // Send invite mutation via tRPC (chat.autoInvite)
    const sendInviteMutation = trpc.chat.autoInvite.useMutation({
        onSuccess: (result) => {
            if (result.success) {
                toast.success("Chat invite sent!");
                onOpenChange(false);
                setSearch("");
                // Refresh sent invites list
                utils.chat.getMySentInvites.invalidate();
            }
        },
        onError: (error) => {
            toast.error(error.message || "Failed to send invite");
        },
    });

    const handleStartChat = (user: DiscoveredUser) => {
        sendInviteMutation.mutate({ targetUserId: user.id });
    };

    const handleClose = () => {
        setSearch("");
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5" />
                        Start New Chat
                    </DialogTitle>
                </DialogHeader>

                {/* Search Input */}
                <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                        placeholder="Search by name or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10"
                        autoFocus
                        aria-label="Search users by name or email"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch("")}
                            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                            aria-label="Clear search"
                            type="button"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Results */}
                <div
                    className="space-y-2 max-h-96 overflow-y-auto"
                    role="region"
                    aria-label="Search results"
                    aria-busy={isLoading}
                >
                    {/* Loading state */}
                    {isLoading && (
                        <div className="flex justify-center py-8" role="status" aria-label="Loading results">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    )}

                    {/* User results */}
                    {!isLoading && searchResults && searchResults.length > 0 && (
                        <ul className="space-y-1" role="list" aria-label="Found users">
                            {searchResults.map((user) => (
                                <li
                                    key={user.id}
                                    className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-10 w-10">
                                            <AvatarFallback className="bg-primary/10 text-primary">
                                                {user.name?.[0]?.toUpperCase() ||
                                                    user.email[0]?.toUpperCase() ||
                                                    "?"}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <p className="font-medium truncate">
                                                {user.name || "Unknown"}
                                            </p>
                                            <p className="text-sm text-muted-foreground truncate">
                                                {user.email}
                                            </p>
                                        </div>
                                    </div>

                                    <Button
                                        size="sm"
                                        onClick={() => handleStartChat(user)}
                                        disabled={sendInviteMutation.isPending}
                                        aria-label={`Start chat with ${user.name || user.email}`}
                                    >
                                        {sendInviteMutation.isPending ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <>
                                                <UserPlus className="h-4 w-4 mr-2" aria-hidden="true" />
                                                Start Chat
                                            </>
                                        )}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* No results */}
                    {!isLoading &&
                        searchResults?.length === 0 &&
                        debouncedSearch.length >= 2 && (
                            <div className="text-center py-8">
                                <p className="text-muted-foreground">
                                    No users found matching "{debouncedSearch}"
                                </p>
                            </div>
                        )}

                    {/* Initial state */}
                    {!isLoading && debouncedSearch.length < 2 && (
                        <div className="text-center py-8">
                            <p className="text-muted-foreground text-sm">
                                Type at least 2 characters to search for users
                            </p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default StartChatModal;
