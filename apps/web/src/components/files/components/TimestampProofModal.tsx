/**
 * TimestampProofModal Component
 *
 * Blockchain timestamp verification and proof download.
 * Uses the Nocturne design system — standard dialog styling with semantic status colors.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@stenvault/shared/ui/dialog";
import { Button } from "@stenvault/shared/ui/button";
import {
    Check,
    AlertCircle,
    Download,
    RefreshCw,
    Shield,
    ExternalLink,
    Loader2,
    Copy,
    CheckCircle2,
    Clock,
    FileDigit,
    Blocks,
    ShieldCheck,
    FileText,
} from "lucide-react";
import { useTimestamp } from "@/hooks/useTimestamp";
import type { TimestampVerification } from "@stenvault/shared";
import { cn } from "@stenvault/shared/utils";
import { motion, AnimatePresence } from "framer-motion";

interface TimestampProofModalProps {
    fileId: number;
    filename: string;
    open: boolean;
    onClose: () => void;
}

export function TimestampProofModal({
    fileId,
    filename,
    open,
    onClose,
}: TimestampProofModalProps) {
    const navigate = useNavigate();
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
    const [copiedHash, setCopiedHash] = useState(false);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => {
        if (!open) {
            setVerification(null);
            setCopiedHash(false);
            clearTimeout(copyTimerRef.current);
        }
    }, [open]);

    const handleVerify = async () => {
        setIsVerifying(true);
        try {
            const result = await verifyTimestamp();
            setVerification(result);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleCopyHash = async (hash: string) => {
        try {
            await navigator.clipboard.writeText(hash);
            setCopiedHash(true);
            clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => setCopiedHash(false), 2000);
        } catch {
            // Clipboard API can fail if page lacks focus
        }
    };

    const formatDate = (date: Date | string | null) => {
        if (!date) return "—";
        const d = new Date(date);
        return d.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const truncateHash = (hash: string) => {
        if (!hash || hash.length < 16) return hash;
        return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
    };

    if (!isEnabled) {
        return (
            <Dialog open={open} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-md">
                    <div className="flex flex-col items-center gap-4 py-8 text-center">
                        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                            <AlertCircle className="h-7 w-7 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="font-semibold text-lg text-foreground">Service Unavailable</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Blockchain timestamping is not enabled.
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
                    <DialogTitle className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Blocks className="h-5 w-5 text-primary" />
                        </div>
                        Blockchain Proof
                    </DialogTitle>
                    <DialogDescription className="truncate">
                        {filename}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <LoadingState />
                ) : !timestampInfo?.hasTimestamp ? (
                    <NoTimestampState
                        onSubmit={submitTimestamp}
                        isPending={isPending}
                        hasPlanAccess={hasPlanAccess}
                        onUpgrade={() => navigate("/settings/billing")}
                    />
                ) : (
                    <div className="space-y-5">
                        <StatusCard
                            status={timestampInfo.status}
                            submittedAt={timestampInfo.submittedAt}
                            confirmedAt={timestampInfo.confirmedAt}
                            bitcoinBlockHeight={timestampInfo.bitcoinBlockHeight}
                            bitcoinTimestamp={timestampInfo.bitcoinTimestamp}
                            formatDate={formatDate}
                        />

                        {timestampInfo.contentHash && (
                            <HashDisplay
                                hash={timestampInfo.contentHash}
                                onCopy={() => handleCopyHash(timestampInfo.contentHash!)}
                                copied={copiedHash}
                                truncate={truncateHash}
                            />
                        )}

                        <AnimatePresence>
                            {verification && (
                                <VerificationResult verification={verification} />
                            )}
                        </AnimatePresence>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2 pt-2">
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
                                            <ShieldCheck className="h-4 w-4 mr-2" />
                                        )}
                                        Verify Proof
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={downloadProof}
                                    >
                                        <Download className="h-4 w-4 mr-2" />
                                        Download .ots
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
                                        Legal PDF
                                    </Button>
                                </>
                            )}
                            {timestampInfo.status === "failed" && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={retryTimestamp}
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
                        </div>

                        {(timestampInfo.status === "pending" || timestampInfo.status === "confirming") && (
                            <PendingInfo status={timestampInfo.status} />
                        )}

                        <ExpandableInfo />
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function LoadingState() {
    return (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
            <p className="text-sm text-muted-foreground">Loading timestamp data...</p>
        </div>
    );
}

function NoTimestampState({
    onSubmit,
    isPending,
    hasPlanAccess,
    onUpgrade,
}: {
    onSubmit: () => void;
    isPending: boolean;
    hasPlanAccess: boolean;
    onUpgrade: () => void;
}) {
    return (
        <div className="flex flex-col items-center gap-5 py-8 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                <Shield className="h-7 w-7 text-muted-foreground" />
            </div>

            <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                    Create Blockchain Proof
                </h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                    Anchor this file's existence to the Bitcoin blockchain.
                    Immutable, verifiable, forever.
                </p>
            </div>

            {hasPlanAccess ? (
                <>
                    <Button
                        onClick={onSubmit}
                        disabled={isPending}
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Shield className="h-4 w-4 mr-2" />
                        )}
                        Create Proof
                    </Button>

                    <p className="text-xs text-muted-foreground">
                        No extra cost &middot; Takes 1-3 hours for Bitcoin confirmation
                    </p>
                </>
            ) : (
                <>
                    <div className="px-4 py-2 rounded-lg bg-muted/50 border border-border">
                        <p className="text-sm text-muted-foreground">
                            Blockchain proofs require a <span className="text-primary font-medium">Pro</span> or <span className="text-primary font-medium">Business</span> plan.
                        </p>
                    </div>

                    <Button onClick={onUpgrade}>
                        Upgrade to Pro
                    </Button>
                </>
            )}
        </div>
    );
}

function StatusCard({
    status,
    submittedAt,
    confirmedAt,
    bitcoinBlockHeight,
    bitcoinTimestamp,
    formatDate,
}: {
    status: string | null;
    submittedAt: Date | string | null;
    confirmedAt: Date | string | null;
    bitcoinBlockHeight: number | null;
    bitcoinTimestamp: Date | string | null;
    formatDate: (date: Date | string | null) => string;
}) {
    const isConfirmed = status === "confirmed";
    const isPending = status === "pending" || status === "confirming";
    const isFailed = status === "failed";

    return (
        <div className={cn(
            "rounded-xl border p-4",
            isConfirmed && "border-green-500/30 bg-green-500/5",
            isPending && "border-amber-500/30 bg-amber-500/5",
            isFailed && "border-red-500/30 bg-red-500/5"
        )}>
            <div className="flex items-center gap-3 mb-4">
                <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    isConfirmed && "bg-green-500/20",
                    isPending && "bg-amber-500/20",
                    isFailed && "bg-red-500/20"
                )}>
                    {isConfirmed && <Check className="h-5 w-5 text-green-500" />}
                    {isPending && <Clock className="h-5 w-5 text-amber-500 animate-pulse" />}
                    {isFailed && <AlertCircle className="h-5 w-5 text-red-500" />}
                </div>
                <div>
                    <p className={cn(
                        "font-semibold",
                        isConfirmed && "text-green-400",
                        isPending && "text-amber-400",
                        isFailed && "text-red-400"
                    )}>
                        {isConfirmed && "Verified on Bitcoin"}
                        {isPending && "Awaiting Confirmation"}
                        {isFailed && "Timestamp Failed"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Submitted {formatDate(submittedAt)}
                    </p>
                </div>
            </div>

            {isConfirmed && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <InfoCell
                        icon={CheckCircle2}
                        label="Confirmed"
                        value={formatDate(confirmedAt)}
                    />
                    <InfoCell
                        icon={Blocks}
                        label="Block Height"
                        value={bitcoinBlockHeight?.toLocaleString() || "—"}
                        link={bitcoinBlockHeight
                            ? `https://blockstream.info/block-height/${bitcoinBlockHeight}`
                            : undefined
                        }
                    />
                    <InfoCell
                        icon={Clock}
                        label="Block Time"
                        value={formatDate(bitcoinTimestamp)}
                        className="col-span-2"
                    />
                </div>
            )}
        </div>
    );
}

function InfoCell({
    icon: Icon,
    label,
    value,
    link,
    className,
}: {
    icon: typeof Check;
    label: string;
    value: string;
    link?: string;
    className?: string;
}) {
    return (
        <div className={cn("bg-muted/50 rounded-lg p-3", className)}>
            <div className="flex items-center gap-2 mb-1">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            {link ? (
                <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary hover:text-primary-hover flex items-center gap-1"
                >
                    {value}
                    <ExternalLink className="h-3 w-3" />
                </a>
            ) : (
                <span className="text-sm font-medium text-foreground">{value}</span>
            )}
        </div>
    );
}

function HashDisplay({
    hash,
    onCopy,
    copied,
    truncate,
}: {
    hash: string;
    onCopy: () => void;
    copied: boolean;
    truncate: (hash: string) => string;
}) {
    return (
        <div className="bg-muted/50 rounded-xl p-4 border border-border">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <FileDigit className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                        Content SHA-256
                    </span>
                </div>
                <button
                    onClick={onCopy}
                    aria-label="Copy content hash"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                    {copied ? (
                        <>
                            <Check className="h-3 w-3 text-green-500" />
                            <span className="text-green-500">Copied!</span>
                        </>
                    ) : (
                        <>
                            <Copy className="h-3 w-3" />
                            Copy
                        </>
                    )}
                </button>
            </div>
            <code className="text-sm font-mono text-primary break-all">
                {truncate(hash)}
            </code>
        </div>
    );
}

function VerificationResult({
    verification,
}: {
    verification: TimestampVerification;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
                "rounded-xl border p-4",
                verification.verified
                    ? "border-green-500/50 bg-green-500/10"
                    : "border-red-500/50 bg-red-500/10"
            )}
        >
            <div className="flex items-start gap-3">
                <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                    verification.verified ? "bg-green-500/20" : "bg-red-500/20"
                )}>
                    {verification.verified ? (
                        <ShieldCheck className="h-4 w-4 text-green-500" />
                    ) : (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                </div>
                <div>
                    <p className={cn(
                        "font-semibold",
                        verification.verified ? "text-green-400" : "text-red-400"
                    )}>
                        {verification.verified
                            ? "Cryptographically Verified"
                            : "Verification Failed"}
                    </p>
                    {verification.message && (
                        <p className="text-sm text-muted-foreground mt-1">
                            {verification.message}
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

function PendingInfo({ status }: { status: string }) {
    return (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <Clock className="h-5 w-5 text-amber-500 animate-pulse flex-shrink-0" />
            <div>
                <p className="text-sm font-medium text-amber-400">
                    {status === "pending" ? "Submitted to Calendar Servers" : "Bitcoin Network Processing"}
                </p>
                <p className="text-xs text-muted-foreground">
                    Confirmation typically takes 1-3 hours
                </p>
            </div>
        </div>
    );
}

function ExpandableInfo() {
    return (
        <div className="border-t border-border pt-4">
            <details className="group">
                <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                    What is blockchain timestamping?
                </summary>
                <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                    <p>
                        <strong className="text-foreground">OpenTimestamps</strong> creates
                        cryptographic proof that your file existed at a specific point
                        in time, anchored in the Bitcoin blockchain.
                    </p>
                    <p>
                        The proof is <strong className="text-foreground">tamper-evident</strong> and
                        can be independently verified by anyone using the .ots file.
                    </p>
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                        <ExternalLink className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-xs">
                            Verify independently at{" "}
                            <a
                                href="https://opentimestamps.org"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                            >
                                opentimestamps.org
                            </a>
                        </span>
                    </div>
                </div>
            </details>
        </div>
    );
}
