/**
 * Shamir Recovery Section Component
 *
 * Allows users to set up and manage Shamir Secret Sharing for master key recovery.
 * Supports server, email, trusted contacts, and external (QR) share distribution.
 *
 * @module components/settings/ShamirRecoverySection
 */

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@stenvault/shared/ui/button";
import { AuroraCard } from "@stenvault/shared/ui/aurora-card";
import { cn } from "@stenvault/shared/utils";
import {
    Loader2,
    Shield,
    ShieldCheck,
    ShieldAlert,
    AlertTriangle,
    QrCode,
    Key,
    Users,
    Mail,
    Server,
    Info,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "@stenvault/shared/lib/toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShamirSetupDialog } from "./ShamirSetupDialog";
import { ShamirRevokeDialog } from "./ShamirRevokeDialog";
import { ShamirExternalSharesDialog } from "./ShamirExternalSharesDialog";

export function ShamirRecoverySection() {
    // Status queries
    const {
        data: status,
        isLoading: statusLoading,
        refetch: refetchStatus,
    } = trpc.shamirRecovery.getStatus.useQuery();

    const { data: encryptionStatus } =
        trpc.encryption.getMasterKeyStatus.useQuery();

    // Dialog open states
    const [setupOpen, setSetupOpen] = useState(false);
    const [revokeOpen, setRevokeOpen] = useState(false);
    const [viewExternalOpen, setViewExternalOpen] = useState(false);

    const hasEncryptionSetup = encryptionStatus?.isConfigured ?? false;

    // Auto-open setup when the URL carries ?setup=shamir. This is the
    // hand-off from ChangeEncryptionPasswordDialog after a rotation that
    // invalidated the existing Shamir config. We clear the query param on
    // arrival so a reload or navigation doesn't re-open the dialog.
    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get("setup") !== "shamir") return;
        if (!hasEncryptionSetup) return;
        if (status?.isConfigured) return; // already configured, nothing to set up

        setSetupOpen(true);
        params.delete("setup");
        const nextSearch = params.toString();
        navigate(
            { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : "" },
            { replace: true },
        );
    }, [location.search, location.pathname, hasEncryptionSetup, status?.isConfigured, navigate]);

    const handleSetupClick = () => {
        if (!hasEncryptionSetup) {
            toast.error("Please set up your encryption password first");
            return;
        }
        setSetupOpen(true);
    };

    const handleSetupClose = () => {
        setSetupOpen(false);
    };

    const handleSetupSuccess = () => {
        refetchStatus();
    };

    const handleRevokeSuccess = () => {
        refetchStatus();
    };

    if (statusLoading) {
        return (
            <AuroraCard variant="default">
                <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            </AuroraCard>
        );
    }

    const isConfigured = status?.isConfigured;

    return (
        <>
            <AuroraCard variant="default" className={isConfigured ? "border-border-strong" : ""}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div
                            className={cn(
                                "p-2 rounded-lg shrink-0",
                                isConfigured
                                    ? "bg-[var(--theme-info)]/10"
                                    : "bg-[var(--theme-bg-elevated)]",
                            )}
                        >
                            {isConfigured ? (
                                <ShieldCheck className="w-6 h-6 text-[var(--theme-info)]" />
                            ) : (
                                <Shield className="w-6 h-6 text-[var(--theme-fg-muted)]" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-semibold text-foreground">Trusted Circle recovery</h3>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                {isConfigured
                                    ? `Enabled — ${status.threshold} of ${status.totalShares} shares required to recover`
                                    : "Distribute your recovery across 3-5 trusted contacts. Your vault can be restored only if a quorum of them agrees."}
                            </p>
                        </div>
                    </div>
                    {isConfigured ? (
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setViewExternalOpen(true)}
                            >
                                <QrCode className="mr-2 h-4 w-4" />
                                View QR Codes
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRevokeOpen(true)}
                                className="text-[var(--theme-error)] border-[var(--theme-error)]/30 hover:bg-[var(--theme-error)]/10"
                            >
                                <ShieldAlert className="mr-2 h-4 w-4" />
                                Revoke
                            </Button>
                        </div>
                    ) : (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={handleSetupClick}
                            disabled={!hasEncryptionSetup}
                        >
                            <Key className="mr-2 h-4 w-4" />
                            Set Up Recovery
                        </Button>
                    )}
                </div>
                {isConfigured && status.distribution && (
                    <div className="rounded-lg border border-[var(--theme-info)]/20 bg-[var(--theme-info)]/10 p-4 space-y-3">
                        <div className="flex items-center gap-4 text-sm text-[var(--theme-info)]">
                            <div className="flex items-center gap-2">
                                <Server className="h-4 w-4" />
                                <span>
                                    {status.distribution.server} Server
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4" />
                                <span>
                                    {status.distribution.email} Email
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                <span>
                                    {status.distribution.trusted_contact ||
                                        0}{" "}
                                    Contacts
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <QrCode className="h-4 w-4" />
                                <span>
                                    {status.distribution.external} External
                                </span>
                            </div>
                        </div>
                        <p className="text-xs text-[var(--theme-info)]/80">
                            You need any {status.threshold} shares from
                            different sources to recover your Master Key.
                        </p>
                    </div>
                )}
                {!isConfigured && (
                    !hasEncryptionSetup ? (
                        <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Setup Required</AlertTitle>
                            <AlertDescription>
                                You need to set up your Encryption Password
                                first before configuring Trusted Circle Recovery.
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <Alert>
                            <Info className="h-4 w-4" />
                            <AlertTitle>Why use Trusted Circle Recovery?</AlertTitle>
                            <AlertDescription>
                                Split your Master Key into multiple shares
                                stored in different locations. You'll need a
                                minimum number of shares to recover,
                                providing both security and redundancy.
                            </AlertDescription>
                        </Alert>
                    )
                )}
            </AuroraCard>

            {/* Setup Dialog */}
            <ShamirSetupDialog
                open={setupOpen}
                onClose={handleSetupClose}
                onSuccess={handleSetupSuccess}
            />

            {/* View External Shares Dialog */}
            <ShamirExternalSharesDialog
                open={viewExternalOpen}
                onOpenChange={setViewExternalOpen}
            />

            {/* Revoke Dialog */}
            <ShamirRevokeDialog
                open={revokeOpen}
                onOpenChange={setRevokeOpen}
                onSuccess={handleRevokeSuccess}
            />
        </>
    );
}
