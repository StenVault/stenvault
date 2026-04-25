/**
 * Organization Danger Zone
 *
 * Leave (non-owners) and delete (owners) actions with confirmation dialogs.
 * Separated per Rule 5 — single responsibility, <200 lines.
 */

import { useState } from "react";
import { LogOut, Trash2 } from "lucide-react";
import { toast } from "@stenvault/shared/lib/toast";
import { Button } from "@stenvault/shared/ui/button";
import { Input } from "@stenvault/shared/ui/input";
import { AuroraCard, AuroraCardContent } from "@stenvault/shared/ui/aurora-card";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@stenvault/shared/ui/alert-dialog";
import { useOrganizationMutations } from "@/hooks/organizations/useOrganizations";
import { useOrganizationContext } from "@/contexts/OrganizationContext";

interface OrgDangerZoneProps {
    orgId: number;
    orgName: string;
    role: "owner" | "admin" | "member";
    onLeft: () => void;
}

export function OrgDangerZone({ orgId, orgName, role, onLeft }: OrgDangerZoneProps) {
    const { deleteOrg, leaveOrg } = useOrganizationMutations();
    const { refreshOrganizations, switchToPersonal } = useOrganizationContext();
    const isOwner = role === "owner";

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");

    const handleDelete = async () => {
        try {
            await deleteOrg.mutateAsync({ organizationId: orgId });
            await switchToPersonal();
            refreshOrganizations();
            onLeft();
            toast.success("Organization deleted");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to delete";
            toast.error(msg);
        }
    };

    const handleLeave = async () => {
        try {
            await leaveOrg.mutateAsync({ organizationId: orgId });
            await switchToPersonal();
            refreshOrganizations();
            onLeft();
            toast.success("You left the organization");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to leave";
            toast.error(msg);
        }
    };

    return (
        <>
            <AuroraCard variant="glass">
                <AuroraCardContent className="p-6 space-y-4">
                    {!isOwner && (
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium">Leave organization</p>
                                <p className="text-xs text-muted-foreground">
                                    You will lose access to all shared files.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowLeaveConfirm(true)}
                            >
                                <LogOut className="w-4 h-4 mr-2" />
                                Leave
                            </Button>
                        </div>
                    )}
                    {isOwner && (
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-destructive">Delete organization</p>
                                <p className="text-xs text-muted-foreground">
                                    Permanently deletes the organization, all files, and member access.
                                </p>
                            </div>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => { setDeleteConfirmText(""); setShowDeleteConfirm(true); }}
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                            </Button>
                        </div>
                    )}
                </AuroraCardContent>
            </AuroraCard>

            {/* Leave Confirmation */}
            <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Leave {orgName}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            You will lose access to all files and data in this organization.
                            You will need a new invite to rejoin.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleLeave} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Leave
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete Confirmation — requires typing org name */}
            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {orgName}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the organization, all its files, and revoke
                            access for all members. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-2">
                        <p className="text-sm text-muted-foreground mb-2">
                            Type <span className="font-mono font-semibold text-foreground">{orgName}</span> to confirm:
                        </p>
                        <Input
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder={orgName}
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleteConfirmText !== orgName || deleteOrg.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteOrg.isPending ? "Deleting..." : "Delete permanently"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
