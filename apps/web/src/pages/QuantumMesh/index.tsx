import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { EXTERNAL_URLS } from "@/lib/constants/externalUrls";
import { useIsMobile } from "@/hooks/useMobile";
import { useTheme } from "@/contexts/ThemeContext";
import {
    Network,
    Lock,
    Zap,
    WifiOff,
    RefreshCw,
    Download,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@stenvault/shared/ui/tabs";
import { Badge } from "@stenvault/shared/ui/badge";
import { Button } from "@stenvault/shared/ui/button";
import { AuroraCard, AuroraCardContent, AuroraCardHeader } from "@stenvault/shared/ui/aurora-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoading } from "@/components/ui/page-loading";
import { FadeIn } from "@stenvault/shared/ui/animated";
import type { Session, OfflineTransfer } from "./types";
import { ActiveTransfers } from "./components/ActiveTransfers";
import { PendingTransfers } from "./components/PendingTransfers";
import { TransferHistory } from "./components/TransferHistory";
import { ResumableTransfers } from "./components/ResumableTransfers";

export default function QuantumMesh() {
    const isMobile = useIsMobile();
    const { theme } = useTheme();
    const [activeTab, setActiveTab] = useState("active");

    // Check if P2P is enabled (server toggle)
    const { data: isEnabled, isLoading: isCheckingEnabled } = trpc.p2p.isEnabled.useQuery(
        undefined,
        { staleTime: 60000 }
    );

    // Check if user's plan includes P2P
    const { data: subscription, isLoading: isCheckingPlan } = trpc.stripe.getSubscription.useQuery(
        undefined,
        { staleTime: 60000 }
    );
    const hasPlanP2P = subscription?.isAdmin || subscription?.features?.p2pQuantumMesh === true;

    // Fetch sessions
    const {
        data: sessionsData,
        isLoading: isLoadingSessions,
        refetch: refetchSessions,
    } = trpc.p2p.listSessions.useQuery(
        { limit: 50 },
        {
            enabled: isEnabled === true && hasPlanP2P === true,
            refetchInterval: 5000,
        }
    );

    // Fetch pending offline transfers
    const {
        data: pendingData,
        isLoading: isLoadingPending,
    } = trpc.p2p.getPendingTransfers.useQuery(
        undefined,
        {
            enabled: isEnabled === true && hasPlanP2P === true,
            refetchInterval: 30000,
        }
    );

    const sessions = useMemo(() => (sessionsData?.sessions ?? []) as Session[], [sessionsData?.sessions]);
    const pendingTransfers = useMemo(() => (pendingData?.transfers ?? []) as OfflineTransfer[], [pendingData?.transfers]);

    const activeCount = sessions.filter(s => ["waiting", "connecting", "transferring"].includes(s.status)).length;
    const pendingCount = pendingTransfers.length;
    const isLoading = isLoadingSessions || isLoadingPending;

    // Loading gate
    if (isCheckingEnabled || isCheckingPlan) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <PageLoading rows={3} />
            </div>
        );
    }

    // Plan gate
    if (!hasPlanP2P) {
        return (
            <EmptyState
                icon={Lock}
                title="Quantum Mesh requires Pro"
                description="Direct browser-to-browser P2P transfers are available on Pro and Business plans."
                action={{
                    label: "View plans",
                    onClick: () => { window.location.href = EXTERNAL_URLS.pricing; },
                    variant: "outline",
                }}
                className="min-h-[60vh]"
            />
        );
    }

    // Feature disabled
    if (!isEnabled) {
        return (
            <EmptyState
                icon={WifiOff}
                title="P2P sharing is disabled"
                description="The Quantum Mesh feature is currently disabled by your administrator."
                className="min-h-[60vh]"
            />
        );
    }

    // Build subtitle
    const subtitleParts: string[] = [];
    if (activeCount > 0) subtitleParts.push(`${activeCount} active`);
    if (pendingCount > 0) subtitleParts.push(`${pendingCount} pending`);
    const subtitle = subtitleParts.length > 0
        ? subtitleParts.join(" \u00b7 ")
        : "Peer-to-peer encrypted file transfers";

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <FadeIn>
                <AuroraCard variant="glass" className="relative overflow-hidden mb-6">
                    <div
                        className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl opacity-15 pointer-events-none"
                        style={{ backgroundColor: theme.brand.primary }}
                    />
                    <AuroraCardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div
                                    className="p-2 rounded-lg"
                                    style={{ backgroundColor: `${theme.brand.primary}15` }}
                                >
                                    <Network
                                        className="h-5 w-5"
                                        style={{ color: theme.brand.primary }}
                                    />
                                </div>
                                <div>
                                    <h1 className="text-xl md:text-2xl font-display font-semibold tracking-tight text-foreground">
                                        Quantum Mesh
                                    </h1>
                                    <p className="text-xs text-muted-foreground">
                                        {subtitle}
                                    </p>
                                </div>
                            </div>

                            {activeCount > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => refetchSessions()}
                                >
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Refresh
                                </Button>
                            )}
                        </div>
                    </AuroraCardContent>
                </AuroraCard>
            </FadeIn>

            {/* Pending alert banner */}
            {pendingCount > 0 && activeTab !== "pending" && (
                <FadeIn delay={0.05}>
                    <AuroraCard variant="default" className="mb-4">
                        <AuroraCardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm">
                                    <Download
                                        className="h-4 w-4"
                                        style={{ color: theme.brand.primary }}
                                    />
                                    <span>
                                        {pendingCount} file{pendingCount !== 1 ? "s" : ""} waiting for you
                                    </span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setActiveTab("pending")}
                                >
                                    View
                                </Button>
                            </div>
                        </AuroraCardContent>
                    </AuroraCard>
                </FadeIn>
            )}

            {/* Main content */}
            <FadeIn delay={0.1} className="flex-1 min-h-0">
                <AuroraCard variant="glass">
                    <AuroraCardContent className={isMobile ? "p-3" : "p-4"}>
                        <AuroraCardHeader
                            icon={<Network className="h-4 w-4" />}
                            title="Transfers"
                            description="All peer-to-peer file transfer activity"
                        />

                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList className={isMobile ? "grid w-full grid-cols-3" : "w-fit"}>
                                <TabsTrigger value="active" className="gap-1.5">
                                    Active
                                    {activeCount > 0 && (
                                        <Badge
                                            className="ml-1 h-5 min-w-5 px-1.5 flex items-center justify-center text-xs"
                                            style={{ backgroundColor: theme.brand.primary }}
                                        >
                                            {activeCount}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="pending" className="gap-1.5">
                                    Pending
                                    {pendingCount > 0 && (
                                        <Badge
                                            className="ml-1 h-5 min-w-5 px-1.5 flex items-center justify-center text-xs"
                                            style={{ backgroundColor: theme.brand.primary }}
                                        >
                                            {pendingCount}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="history">History</TabsTrigger>
                            </TabsList>

                            <div className="mt-4">
                                <TabsContent value="active" className="m-0">
                                    {isLoading ? (
                                        <PageLoading rows={3} />
                                    ) : (
                                        <>
                                            <ActiveTransfers
                                                sessions={sessions}
                                                isLoading={false}
                                                onRefresh={() => refetchSessions()}
                                            />
                                            <ResumableTransfers />
                                        </>
                                    )}
                                </TabsContent>

                                <TabsContent value="pending" className="m-0">
                                    {isLoading ? (
                                        <PageLoading rows={3} />
                                    ) : (
                                        <PendingTransfers
                                            transfers={pendingTransfers}
                                            isLoading={false}
                                        />
                                    )}
                                </TabsContent>

                                <TabsContent value="history" className="m-0">
                                    <TransferHistory
                                        sessions={sessions}
                                        isLoading={isLoading}
                                    />
                                </TabsContent>
                            </div>
                        </Tabs>
                    </AuroraCardContent>
                </AuroraCard>
            </FadeIn>
        </div>
    );
}
