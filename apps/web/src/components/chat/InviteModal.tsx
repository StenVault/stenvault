import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, Mail, Clock, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { format } from "date-fns";

interface InviteModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function InviteModal({ isOpen, onClose }: InviteModalProps) {
    const [email, setEmail] = useState("");
    const [expiresInHours, setExpiresInHours] = useState("24");
    const [generatedInvite, setGeneratedInvite] = useState<{
        inviteCode: string;
        toEmail: string;
        expiresAt: Date;
    } | null>(null);
    const [copiedCode, setCopiedCode] = useState(false);
    const [isRevoking, setIsRevoking] = useState<number | null>(null);

    const utils = trpc.useUtils();

    const { data: invitesData } = trpc.chat.getMySentInvites.useQuery(
        { status: "pending" },
        { enabled: isOpen }
    );
    const existingInvites = invitesData?.invites ?? [];

    const createInviteMutation = trpc.chat.createInvite.useMutation({
        onSuccess: (data) => {
            if (data.invite) {
                setGeneratedInvite({
                    inviteCode: data.invite.inviteCode,
                    toEmail: data.invite.toEmail,
                    expiresAt: new Date(data.invite.expiresAt),
                });
                utils.chat.getMySentInvites.invalidate();
                toast.success("Invite created successfully!");
            }
        },
        onError: () => {
            toast.error("Failed to create invite");
        },
    });

    const revokeInviteMutation = trpc.chat.revokeInvite.useMutation({
        onSuccess: () => {
            utils.chat.getMySentInvites.invalidate();
            toast.success("Invite revoked");
            setIsRevoking(null);
        },
        onError: () => {
            toast.error("Failed to revoke invite");
            setIsRevoking(null);
        },
    });

    const handleCreateInvite = async () => {
        if (!email) {
            toast.error("Please enter an email address");
            return;
        }

        createInviteMutation.mutate({
            toEmail: email,
            expiresInHours: parseInt(expiresInHours),
        });
    };

    const handleCopyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(true);
        toast.success("Invite code copied to clipboard");
        setTimeout(() => setCopiedCode(false), 2000);
    };

    const handleRevoke = async (inviteId: number) => {
        setIsRevoking(inviteId);
        revokeInviteMutation.mutate({ inviteId });
    };

    const isCreating = createInviteMutation.isPending;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Create Chat Invite</DialogTitle>
                    <DialogDescription>
                        Send a secure invite link to start a private conversation
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {!generatedInvite ? (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="friend@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="expires">Expires In</Label>
                                <Select value={expiresInHours} onValueChange={setExpiresInHours}>
                                    <SelectTrigger id="expires">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">1 hour</SelectItem>
                                        <SelectItem value="6">6 hours</SelectItem>
                                        <SelectItem value="24">24 hours</SelectItem>
                                        <SelectItem value="72">3 days</SelectItem>
                                        <SelectItem value="168">7 days</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <Button
                                onClick={handleCreateInvite}
                                disabled={isCreating}
                                className="w-full"
                            >
                                {isCreating ? "Creating..." : "Create Invite"}
                            </Button>
                        </>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-4 bg-accent rounded-lg space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Invite Code</span>
                                    <Badge variant="outline" className="text-xs">
                                        <Clock className="h-3 w-3 mr-1" />
                                        Expires {format(new Date(generatedInvite.expiresAt), "MMM d, HH:mm")}
                                    </Badge>
                                </div>

                                <div className="flex items-center gap-2">
                                    <code className="flex-1 p-2 bg-background rounded text-sm font-mono">
                                        {generatedInvite.inviteCode}
                                    </code>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleCopyCode(generatedInvite.inviteCode)}
                                    >
                                        {copiedCode ? (
                                            <Check className="h-4 w-4" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>

                                <p className="text-xs text-muted-foreground">
                                    To: {generatedInvite.toEmail}
                                </p>
                            </div>

                            <Button
                                variant="outline"
                                onClick={() => {
                                    setGeneratedInvite(null);
                                    setEmail("");
                                }}
                                className="w-full"
                            >
                                Create Another Invite
                            </Button>
                        </div>
                    )}

                    {existingInvites && existingInvites.length > 0 && (
                        <div className="space-y-2">
                            <Label>Pending Invites</Label>
                            <ScrollArea className="h-[200px] rounded-md border p-2">
                                <div className="space-y-2">
                                    {existingInvites.map((invite) => (
                                        <div
                                            key={invite.id}
                                            className="flex items-center justify-between p-2 bg-accent rounded-lg"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{invite.toEmail}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Expires {format(new Date(invite.expiresAt), "MMM d, HH:mm")}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleCopyCode(invite.inviteCode)}
                                                >
                                                    <Copy className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleRevoke(invite.id)}
                                                >
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
