/**
 * Transfer History Component
 * Displays list of completed, failed, or expired transfers with sent tab and filters.
 */
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { formatBytes } from "@cloudvault/shared";
import {
    CheckCircle2,
    XCircle,
    ArrowRightLeft,
    Send,
    Download,
    Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import type { Session, SessionStatus } from "../types";
import { StatusBadge } from "./StatusBadge";
import { TransferDetailsModal } from "./TransferDetailsModal";

interface TransferHistoryProps {
    sessions: Session[];
    isLoading: boolean;
}

const STATUS_FILTERS: { value: SessionStatus | "all"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
    { value: "expired", label: "Expired" },
    { value: "cancelled", label: "Cancelled" },
];

export function TransferHistory({ sessions, isLoading }: TransferHistoryProps) {
    const [tab, setTab] = useState<"received" | "sent">("received");
    const [statusFilter, setStatusFilter] = useState<SessionStatus | "all">("all");
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

    // Sent transfers from backend
    const { data: sentTransfers, isLoading: sentLoading } = trpc.p2p.getSentP2PTransfers.useQuery(
        undefined,
        { enabled: tab === "sent" }
    );

    // Filter received sessions
    const completedSessions = sessions.filter(
        s => ["completed", "failed", "expired", "cancelled"].includes(s.status)
    );
    const filteredReceived = statusFilter === "all"
        ? completedSessions
        : completedSessions.filter(s => s.status === statusFilter);

    // Filter sent sessions
    const filteredSent = sentTransfers
        ? (statusFilter === "all"
            ? sentTransfers
            : sentTransfers.filter(s => s.status === statusFilter))
        : [];

    const currentList = tab === "received" ? filteredReceived : filteredSent;
    const currentLoading = tab === "received" ? isLoading : sentLoading;

    return (
        <div className="space-y-4">
            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit">
                <button
                    onClick={() => setTab("received")}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                        tab === "received" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Download className="h-3.5 w-3.5" />
                    Received
                </button>
                <button
                    onClick={() => setTab("sent")}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                        tab === "sent" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Send className="h-3.5 w-3.5" />
                    Sent
                </button>
            </div>

            {/* Status filter chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
                {STATUS_FILTERS.map(f => (
                    <button
                        key={f.value}
                        onClick={() => setStatusFilter(f.value)}
                        className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                            statusFilter === f.value
                                ? "bg-foreground text-background border-foreground"
                                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Loading */}
            {currentLoading && (
                <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-16 w-full" />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!currentLoading && currentList.length === 0 && (
                <div className="text-center py-12">
                    <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
                        <ArrowRightLeft className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium">
                        {tab === "sent" ? "No Sent Transfers" : "No Transfer History"}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        {tab === "sent"
                            ? "Files you send via Quantum Mesh will appear here"
                            : "Your completed transfers will appear here"}
                    </p>
                </div>
            )}

            {/* Transfer list */}
            {!currentLoading && currentList.length > 0 && (
                <div className="space-y-2">
                    {currentList.map((session) => (
                        <div
                            key={session.sessionId}
                            className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => setSelectedSessionId(session.sessionId)}
                        >
                            <div className={cn(
                                "p-2 rounded-lg",
                                session.status === "completed"
                                    ? "bg-green-500/10 text-green-500"
                                    : session.status === "cancelled"
                                        ? "bg-gray-500/10 text-gray-500"
                                        : "bg-red-500/10 text-red-500"
                            )}>
                                {session.status === "completed" ? (
                                    <CheckCircle2 className="h-4 w-4" />
                                ) : (
                                    <XCircle className="h-4 w-4" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="font-medium truncate text-sm">
                                        {session.fileName || "Unknown file"}
                                    </p>
                                    {tab === "sent" && "isE2EEncrypted" in session && session.isE2EEncrypted && (
                                        <Shield className="h-3 w-3 text-green-500 shrink-0" />
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {session.fileSize ? formatBytes(session.fileSize) : "..."} &middot;{" "}
                                    {tab === "sent" && "recipientEmail" in session && session.recipientEmail
                                        ? `To: ${session.recipientEmail} · `
                                        : ""}
                                    {session.completedAt
                                        ? format(new Date(session.completedAt), "MMM d, yyyy 'at' HH:mm")
                                        : format(new Date(session.createdAt), "MMM d, yyyy 'at' HH:mm")
                                    }
                                </p>
                            </div>
                            <StatusBadge status={session.status as SessionStatus} size="sm" />
                        </div>
                    ))}
                </div>
            )}

            {/* Details Modal */}
            <TransferDetailsModal
                sessionId={selectedSessionId}
                open={!!selectedSessionId}
                onClose={() => setSelectedSessionId(null)}
            />
        </div>
    );
}
