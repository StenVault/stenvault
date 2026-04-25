/**
 * Transfer History Page
 *
 * Dedicated page for viewing all P2P transfer history.
 * Tabs: Active | Pending | History (with sent/received + filters)
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/useMobile";
import {
    ArrowLeftRight,
    Wifi,
    CloudDownload,
    FileDown,
    Loader2,
} from "lucide-react";
import { cn } from "@stenvault/shared/utils";
import { AuroraCard, AuroraCardContent } from "@stenvault/shared/ui/aurora-card";
import { FadeIn } from "@stenvault/shared/ui/animated";
import {
    ActiveTransfers,
    PendingTransfers,
    TransferHistory,
} from "@/pages/QuantumMesh/components";
import type { Session, OfflineTransfer } from "@/pages/QuantumMesh/types";

type Tab = "active" | "pending" | "history";

const TABS: { value: Tab; label: string; icon: typeof Wifi }[] = [
    { value: "active", label: "Active", icon: Wifi },
    { value: "pending", label: "Pending", icon: CloudDownload },
    { value: "history", label: "History", icon: FileDown },
];

export default function TransferHistoryPage() {
    const [tab, setTab] = useState<Tab>("history");
    const isMobile = useIsMobile();

    // Check if P2P is enabled
    const { data: isEnabled, isLoading: isCheckingEnabled } = trpc.p2p.isEnabled.useQuery(
        undefined,
        { staleTime: 60000 }
    );

    // Fetch sessions
    const {
        data: sessionsData,
        isLoading: isLoadingSessions,
        refetch: refetchSessions,
    } = trpc.p2p.listSessions.useQuery(
        { limit: 50 },
        {
            enabled: isEnabled === true,
            refetchInterval: tab === "active" ? 5000 : 30000,
        }
    );

    // Fetch pending offline transfers
    const {
        data: pendingData,
        isLoading: isLoadingPending,
    } = trpc.p2p.getPendingTransfers.useQuery(
        undefined,
        {
            enabled: isEnabled === true,
            refetchInterval: 30000,
        }
    );

    const sessions = (sessionsData?.sessions || []) as Session[];
    const pendingTransfers = (pendingData?.transfers || []) as OfflineTransfer[];
    const isLoading = isCheckingEnabled || isLoadingSessions || isLoadingPending;

    const activeSessions = sessions.filter(
        s => ["waiting", "connecting", "transferring"].includes(s.status)
    );

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <FadeIn>
                <AuroraCard variant="glass" className="relative overflow-hidden mb-6">
                    <div
                        className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl opacity-15 pointer-events-none"
                        style={{ backgroundColor: '#8b5cf6' }}
                    />
                    <AuroraCardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div
                                    className="p-2 rounded-lg"
                                    style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)' }}
                                >
                                    <ArrowLeftRight className="h-5 w-5 text-purple-500" />
                                </div>
                                <div>
                                    <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">
                                        Transfer History
                                    </h1>
                                    <p className="text-xs text-muted-foreground">
                                        {sessions.length} total transfer{sessions.length !== 1 ? "s" : ""}
                                        {activeSessions.length > 0 && ` · ${activeSessions.length} active`}
                                        {pendingTransfers.length > 0 && ` · ${pendingTransfers.length} pending`}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </AuroraCardContent>
                </AuroraCard>
            </FadeIn>

            {/* Tabs */}
            <FadeIn delay={0.05}>
                <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit mb-6">
                    {TABS.map(t => (
                        <button
                            key={t.value}
                            onClick={() => setTab(t.value)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                                tab === t.value
                                    ? "bg-background shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <t.icon className="h-3.5 w-3.5" />
                            {t.label}
                            {t.value === "active" && activeSessions.length > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-600 text-xs">
                                    {activeSessions.length}
                                </span>
                            )}
                            {t.value === "pending" && pendingTransfers.length > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 text-xs">
                                    {pendingTransfers.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </FadeIn>

            {/* Loading */}
            {isCheckingEnabled && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                </div>
            )}

            {/* Disabled state */}
            {!isCheckingEnabled && !isEnabled && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="p-4 rounded-full bg-muted/50 mb-4">
                        <ArrowLeftRight className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <h2 className="text-lg font-medium mb-1">P2P Transfers Disabled</h2>
                    <p className="text-sm text-muted-foreground max-w-sm">
                        Quantum Mesh P2P transfers are not enabled. Contact your administrator.
                    </p>
                </div>
            )}

            {/* Content */}
            {isEnabled && (
                <FadeIn delay={0.1} className="flex-1 min-h-0">
                    {tab === "active" && (
                        <ActiveTransfers
                            sessions={sessions}
                            isLoading={isLoading}
                            onRefresh={() => refetchSessions()}
                        />
                    )}
                    {tab === "pending" && (
                        <PendingTransfers
                            transfers={pendingTransfers}
                            isLoading={isLoading}
                        />
                    )}
                    {tab === "history" && (
                        <TransferHistory
                            sessions={sessions}
                            isLoading={isLoading}
                        />
                    )}
                </FadeIn>
            )}
        </div>
    );
}
