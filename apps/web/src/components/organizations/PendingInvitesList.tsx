/**
 * Pending Invites List
 *
 * Shows organization invites that haven't been accepted yet.
 * Admins and owners can cancel pending invites.
 */

import { Mail, X, Clock, Loader2 } from "lucide-react";
import { toast } from "@stenvault/shared/lib/toast";
import { Button } from "@stenvault/shared/ui/button";
import { Badge } from "@stenvault/shared/ui/badge";
import { useOrganizationInvites, useOrganizationMutations } from "@/hooks/organizations/useOrganizations";
import { cn } from "@stenvault/shared/utils";

interface PendingInvitesListProps {
    organizationId: number;
    canManage: boolean;
}

function formatRelativeDate(date: Date): string {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return "Expired";
    if (days === 1) return "1 day left";
    return `${days} days left`;
}

export function PendingInvitesList({ organizationId, canManage }: PendingInvitesListProps) {
    const { data: invites, isLoading } = useOrganizationInvites(organizationId);
    const { cancelInvite } = useOrganizationMutations();

    const handleCancel = async (inviteId: number, email: string) => {
        try {
            await cancelInvite.mutateAsync({ inviteId });
            toast.success(`Invite to ${email} cancelled`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to cancel invite";
            toast.error(msg);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!invites || invites.length === 0) return null;

    return (
        <div className="space-y-2 mt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Pending Invites ({invites.length})
            </p>
            {invites.map((invite) => (
                <div
                    key={invite.id}
                    className={cn(
                        "flex items-center gap-3 p-3 rounded-lg",
                        "border border-dashed border-border/50",
                        "text-sm"
                    )}
                >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{invite.email}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span>{formatRelativeDate(new Date(invite.expiresAt))}</span>
                        </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                        {invite.role}
                    </Badge>
                    {canManage && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleCancel(invite.id, invite.email)}
                            disabled={cancelInvite.isPending}
                        >
                            <X className="w-3.5 h-3.5" />
                        </Button>
                    )}
                </div>
            ))}
        </div>
    );
}
