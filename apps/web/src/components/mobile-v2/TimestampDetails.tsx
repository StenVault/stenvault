/**
 * TimestampDetails Component
 *
 * Modal dialog showing full OpenTimestamps blockchain proof details.
 * Allows verification, proof download, and retry for failed timestamps.
 */

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@stenvault/shared/ui/dialog";
import { Button } from "@stenvault/shared/ui/button";
import {
    Clock,
    Check,
    AlertCircle,
    Download,
    RefreshCw,
    Shield,
    ExternalLink,
    Loader2,
    Blocks,
    FileText,
} from "lucide-react";
import { useTimestamp } from "@/hooks/useTimestamp";
import { TimestampBadge } from "@/components/files/components/TimestampBadge";
import type { TimestampVerification } from "@stenvault/shared";
import { cn } from "@stenvault/shared/utils";

interface TimestampDetailsProps {
    fileId: number;
    filename: string;
    open: boolean;
    onClose: () => void;
}

export function TimestampDetails({
    fileId,
    filename,
    open,
    onClose,
}: TimestampDetailsProps) {
    const {
        timestampInfo,
        isLoading,
        isEnabled,
        hasPlanAccess,
        submitTimestamp,
        verifyTimestamp,
        downloadProof,
        downloadLegalPdf,
        retryTimestamp,
        isPending,
    } = useTimestamp({ fileId, filename });

    const [verification, setVerification] = useState<TimestampVerification | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    const handleVerify = async () => {
        setIsVerifying(true);
        try {
            const result = await verifyTimestamp();
            setVerification(result);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleSubmit = async () => {
        await submitTimestamp();
    };

    const handleRetry = async () => {
        await retryTimestamp();
    };

    const handleDownload = async () => {
        await downloadProof();
    };

    const formatDate = (date: Date | string | null) => {
        if (!date) return "—";
        const d = new Date(date);
        return d.toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
        });
    };

    if (!isEnabled) {
        return (
            <Dialog open={open} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Blocks className="h-5 w-5" />
                            Blockchain Timestamp
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-4 py-6 text-center">
                        <AlertCircle className="h-12 w-12 text-muted-foreground" />
                        <div>
                            <p className="font-medium">Timestamping Disabled</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                The blockchain timestamping service is not available.
                            </p>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Blocks className="h-5 w-5 text-primary" />
                        Blockchain Timestamp
                    </DialogTitle>
                    <DialogDescription className="truncate">
                        {filename}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : !timestampInfo?.hasTimestamp ? (
                    <NoTimestampView onSubmit={handleSubmit} isPending={isPending} hasPlanAccess={hasPlanAccess} />
                ) : (
                    <div className="space-y-6">
                        {/* Status Header */}
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Status</span>
                            <TimestampBadge status={timestampInfo.status} />
                        </div>

                        {/* Timestamp Info */}
                        <div className="grid gap-3 text-sm">
                            <InfoRow
                                label="Submitted"
                                value={formatDate(timestampInfo.submittedAt)}
                            />
                            {timestampInfo.status === "confirmed" && (
                                <>
                                    <InfoRow
                                        label="Confirmed"
                                        value={formatDate(timestampInfo.confirmedAt)}
                                    />
                                    <InfoRow
                                        label="Bitcoin Block"
                                        value={
                                            timestampInfo.bitcoinBlockHeight?.toLocaleString() ||
                                            "—"
                                        }
                                        link={
                                            timestampInfo.bitcoinBlockHeight
                                                ? `https://blockstream.info/block-height/${timestampInfo.bitcoinBlockHeight}`
                                                : undefined
                                        }
                                    />
                                    <InfoRow
                                        label="Block Time"
                                        value={formatDate(timestampInfo.bitcoinTimestamp)}
                                    />
                                </>
                            )}
                        </div>

                        {/* Verification Result */}
                        {verification && (
                            <div
                                className={cn(
                                    "rounded-lg border p-4",
                                    verification.verified
                                        ? "border-green-500/50 bg-green-500/10"
                                        : "border-red-500/50 bg-red-500/10"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    {verification.verified ? (
                                        <Check className="h-5 w-5 text-green-500 mt-0.5" />
                                    ) : (
                                        <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                                    )}
                                    <div>
                                        <p className="font-medium">
                                            {verification.verified
                                                ? "Timestamp Verified"
                                                : "Verification Failed"}
                                        </p>
                                        {verification.message && (
                                            <p className="text-sm text-muted-foreground mt-1">
                                                {verification.message}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2">
                            {timestampInfo.status === "confirmed" && (
                                <>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleVerify}
                                        disabled={isVerifying}
                                    >
                                        {isVerifying ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Shield className="h-4 w-4 mr-2" />
                                        )}
                                        Verify
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleDownload}
                                    >
                                        <Download className="h-4 w-4 mr-2" />
                                        Download Proof
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={downloadLegalPdf}
                                        disabled={isPending}
                                    >
                                        {isPending ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <FileText className="h-4 w-4 mr-2" />
                                        )}
                                        Export PDF
                                    </Button>
                                </>
                            )}
                            {timestampInfo.status === "failed" && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRetry}
                                    disabled={isPending}
                                >
                                    {isPending ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                    )}
                                    Retry
                                </Button>
                            )}
                            {timestampInfo.status === "pending" && (
                                <p className="text-sm text-muted-foreground flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    Bitcoin confirmation typically takes 1-3 hours
                                </p>
                            )}
                        </div>

                        {/* What is this? */}
                        <div className="border-t pt-4">
                            <details className="group">
                                <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                    What is blockchain timestamping?
                                </summary>
                                <div className="mt-3 text-sm text-muted-foreground space-y-2">
                                    <p>
                                        OpenTimestamps creates cryptographic proof that your file
                                        existed at a specific point in time, anchored in the
                                        Bitcoin blockchain.
                                    </p>
                                    <p>
                                        This proof is tamper-evident and can be independently
                                        verified by anyone, making it useful for:
                                    </p>
                                    <ul className="list-disc list-inside space-y-1 ml-2">
                                        <li>Proving document creation dates</li>
                                        <li>Timestamping contracts and agreements</li>
                                        <li>Regulatory compliance records</li>
                                        <li>Intellectual property protection</li>
                                    </ul>
                                </div>
                            </details>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function NoTimestampView({
    onSubmit,
    isPending,
    hasPlanAccess,
}: {
    onSubmit: () => void;
    isPending: boolean;
    hasPlanAccess: boolean;
}) {
    return (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted">
                <Shield className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
                <p className="font-medium">No Timestamp Yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    Create a blockchain-backed proof that this file existed at
                    this point in time.
                </p>
            </div>
            {hasPlanAccess ? (
                <Button onClick={onSubmit} disabled={isPending}>
                    {isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Shield className="h-4 w-4 mr-2" />
                    )}
                    Create Proof
                </Button>
            ) : (
                <div className="px-4 py-2 rounded-lg bg-muted/50 border border-border">
                    <p className="text-sm text-muted-foreground">
                        Blockchain proofs require a <span className="text-primary font-medium">Pro</span> or <span className="text-primary font-medium">Business</span> plan.
                    </p>
                </div>
            )}
        </div>
    );
}

function InfoRow({
    label,
    value,
    link,
}: {
    label: string;
    value: string;
    link?: string;
}) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{label}</span>
            {link ? (
                <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                >
                    {value}
                    <ExternalLink className="h-3 w-3" />
                </a>
            ) : (
                <span className="font-medium">{value}</span>
            )}
        </div>
    );
}
