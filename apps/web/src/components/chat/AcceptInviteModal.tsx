import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@stenvault/shared/ui/dialog";
import { Button } from "@stenvault/shared/ui/button";
import { Input } from "@stenvault/shared/ui/input";
import { Label } from "@stenvault/shared/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@stenvault/shared/ui/scroll-area";
import {
    KeyRound,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Check,
    X,
    UserPlus,
    Clock,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "@stenvault/shared/lib/toast";
import { cn } from "@stenvault/shared/utils";

// Type for pending invite from tRPC
interface PendingInvite {
    id: number;
    inviteCode: string;
    from: {
        id: number;
        email: string | null;
        name: string | null;
    };
    createdAt: Date;
    expiresAt: Date;
}

interface AcceptInviteModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Format time ago
function formatTimeAgo(dateInput: string | Date): string {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
}

/**
 * Accept Invite Modal Component
 *
 * Shows pending invites list + fallback for manual code entry.
 * Signal-style UX: See who wants to chat and accept/decline.
 */
export function AcceptInviteModal({ isOpen, onClose }: AcceptInviteModalProps) {
    const [inviteCode, setInviteCode] = useState("");
    const [isSuccess, setIsSuccess] = useState(false);
    const [isPending, setIsPending] = useState(false);
    const [showManualEntry, setShowManualEntry] = useState(false);

    const utils = trpc.useUtils();

    // Fetch pending invites via tRPC
    const { data: pendingInvitesData, isLoading: isLoadingInvites } = trpc.chat.getMyPendingInvites.useQuery(undefined, {
        enabled: isOpen,
        refetchInterval: 10000, // Refresh every 10s while modal is open
        staleTime: 5000,
    });
    const pendingInvites = pendingInvitesData?.invites ?? [];

    // Accept invite mutation
    const acceptMutation = trpc.chat.acceptInvite.useMutation({
        onSuccess: () => {
            setIsSuccess(true);
            toast.success("Invite accepted! You can start chatting.");
            utils.chat.getMyPendingInvites.invalidate();
            utils.chat.getMyConnections.invalidate();

            setTimeout(() => {
                handleClose();
            }, 1500);
        },
        onError: () => {
            toast.error("Failed to accept invite");
        },
    });

    // Decline invite mutation (revoke from recipient's perspective)
    const declineMutation = trpc.chat.revokeInvite.useMutation({
        onSuccess: () => {
            toast.success("Invite declined");
            utils.chat.getMyPendingInvites.invalidate();
        },
        onError: () => {
            toast.error("Failed to decline invite");
        },
    });

    const handleClose = () => {
        onClose();
        setIsSuccess(false);
        setInviteCode("");
        setShowManualEntry(false);
    };

    // Handle manual code accept
    const handleManualAccept = async () => {
        if (!inviteCode.trim()) {
            toast.error("Enter an invite code");
            return;
        }

        setIsPending(true);
        try {
            await acceptMutation.mutateAsync({ inviteCode: inviteCode.trim() });
            setIsSuccess(true);
            toast.success("Invite accepted!");
            utils.chat.getMyPendingInvites.invalidate();
            utils.chat.getMyConnections.invalidate();

            setTimeout(() => {
                handleClose();
            }, 1500);
        } catch {
            toast.error("Invalid or expired code");
        } finally {
            setIsPending(false);
        }
    };

    // Handle paste
    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setInviteCode(text.trim());
        } catch {
            toast.error("Failed to read clipboard");
        }
    };

    const hasPendingInvites = pendingInvites && pendingInvites.length > 0;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-[480px] max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5 text-primary" />
                        Chat Invites
                    </DialogTitle>
                    <DialogDescription>
                        {hasPendingInvites
                            ? `You have ${pendingInvites.length} pending invite${pendingInvites.length > 1 ? "s" : ""}`
                            : "Accept invites to start secure conversations"}
                    </DialogDescription>
                </DialogHeader>

                {isSuccess ? (
                    /* Success State */
                    <div
                        className="flex flex-col items-center justify-center py-12 space-y-4"
                        role="status"
                        aria-live="polite"
                    >
                        <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
                            <CheckCircle2 className="h-8 w-8 text-green-500" />
                        </div>
                        <div className="text-center space-y-1">
                            <h3 className="font-semibold">Connection Established!</h3>
                            <p className="text-sm text-muted-foreground">
                                You can now chat securely
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-hidden flex flex-col gap-4">
                        {/* Pending Invites List */}
                        {isLoadingInvites ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : hasPendingInvites ? (
                            <ScrollArea className="flex-1 max-h-[300px] -mx-2 px-2">
                                <div className="space-y-2">
                                    {pendingInvites.map((invite) => (
                                        <InviteCard
                                            key={invite.id}
                                            invite={invite}
                                            onAccept={() => acceptMutation.mutate({ inviteCode: invite.inviteCode })}
                                            onDecline={() => declineMutation.mutate({ inviteId: invite.id })}
                                            isAccepting={acceptMutation.isPending}
                                            isDeclining={declineMutation.isPending}
                                        />
                                    ))}
                                </div>
                            </ScrollArea>
                        ) : (
                            <div className="text-center py-8 space-y-2">
                                <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
                                    <Clock className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    No pending invites
                                </p>
                            </div>
                        )}

                        {/* Separator + Manual Entry Toggle */}
                        <div className="space-y-3">
                            <div className="relative">
                                <Separator />
                                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
                                    or
                                </span>
                            </div>

                            {!showManualEntry ? (
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => setShowManualEntry(true)}
                                >
                                    <KeyRound className="h-4 w-4 mr-2" />
                                    I have an invite code
                                </Button>
                            ) : (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="space-y-2">
                                        <Label htmlFor="invite-code">Invite Code</Label>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="invite-code"
                                                    placeholder="Paste the code here..."
                                                    value={inviteCode}
                                                    onChange={(e) => setInviteCode(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") handleManualAccept();
                                                    }}
                                                    className="pl-10 font-mono text-sm"
                                                />
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={handlePaste}
                                                title="Paste"
                                            >
                                                <KeyRound className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <Button
                                            variant="ghost"
                                            className="flex-1"
                                            onClick={() => {
                                                setShowManualEntry(false);
                                                setInviteCode("");
                                            }}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            className="flex-1"
                                            onClick={handleManualAccept}
                                            disabled={!inviteCode.trim() || isPending}
                                        >
                                            {isPending ? (
                                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            ) : (
                                                <Check className="h-4 w-4 mr-2" />
                                            )}
                                            Accept
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Info Alert */}
                        <Alert className="bg-muted/50">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                                By accepting, an E2E encrypted connection will be established between
                                you and the sender.
                            </AlertDescription>
                        </Alert>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

/**
 * Individual Invite Card
 */
interface InviteCardProps {
    invite: PendingInvite;
    onAccept: () => void;
    onDecline: () => void;
    isAccepting: boolean;
    isDeclining: boolean;
}

function InviteCard({ invite, onAccept, onDecline, isAccepting, isDeclining }: InviteCardProps) {
    const name = invite.from.name || invite.from.email || "Unknown";
    const initials = name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

    const isDisabled = isAccepting || isDeclining;

    return (
        <div
            className={cn(
                "flex items-center gap-3 p-3 rounded-lg",
                "bg-muted/50 hover:bg-muted/70 transition-colors",
                "border border-transparent hover:border-primary/10"
            )}
        >
            <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {initials}
                </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{name}</p>
                <p className="text-xs text-muted-foreground">
                    wants to chat • {formatTimeAgo(invite.createdAt)}
                </p>
            </div>

            <div className="flex gap-1.5">
                <Button
                    size="sm"
                    variant="default"
                    onClick={onAccept}
                    disabled={isDisabled}
                    className="h-8 px-3"
                >
                    {isAccepting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <>
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Accept
                        </>
                    )}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onDecline}
                    disabled={isDisabled}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                >
                    {isDeclining ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <X className="h-3.5 w-3.5" />
                    )}
                </Button>
            </div>
        </div>
    );
}
