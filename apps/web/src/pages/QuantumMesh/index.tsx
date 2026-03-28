/**
 * Quantum Mesh Network - P2P Transfers Dashboard
 * 
 * Dedicated page for managing P2P file transfers:
 * - View active real-time transfers
 * - Monitor pending offline transfers
 * - See transfer history
 * - Quick access to P2P sharing
 * 
 * This file is the main orchestrator that handles data fetching
 * and delegates rendering to responsive view components.
 */
import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/useMobile";
import { Loader2, Lock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Session, OfflineTransfer } from "./types";
import { MobileView, DesktopView } from "./views";

export default function QuantumMesh() {
    const isMobile = useIsMobile();
    const navigate = useNavigate();

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
            enabled: isEnabled === true,
            refetchInterval: 5000, // Poll every 5 seconds for active transfers
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
            refetchInterval: 30000, // Poll every 30 seconds
        }
    );

    // Calculate stats
    const sessions = sessionsData?.sessions || [];
    const pendingTransfers = pendingData?.transfers || [];

    const stats = {
        total: sessions.length,
        active: sessions.filter(s => ["waiting", "connecting", "transferring"].includes(s.status)).length,
        pending: pendingTransfers.length,
        completed: sessions.filter(s => s.status === "completed").length,
    };

    const isLoading = isCheckingEnabled || isLoadingSessions || isLoadingPending;

    const handleRefresh = () => {
        refetchSessions();
    };

    // Loading state
    if (isCheckingEnabled || isCheckingPlan) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            </div>
        );
    }

    // Plan gate — Free users see upgrade prompt
    if (!hasPlanP2P) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center max-w-sm space-y-4">
                    <div className="mx-auto w-12 h-12 rounded-xl bg-[rgba(212,175,55,0.1)] flex items-center justify-center">
                        <Lock className="h-6 w-6 text-[var(--gold-400)]" />
                    </div>
                    <h2 className="text-lg font-semibold text-[var(--nocturne-100)]">
                        Quantum Mesh requires Pro
                    </h2>
                    <p className="text-sm text-[var(--nocturne-400)]">
                        Direct browser-to-browser P2P transfers are available on Pro and Business plans.
                    </p>
                    <button
                        onClick={() => navigate("/pricing")}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[rgba(212,175,55,0.2)] text-sm font-medium text-[var(--gold-400)] hover:bg-[rgba(212,175,55,0.08)] transition-colors"
                    >
                        <Sparkles className="h-4 w-4" />
                        View plans
                    </button>
                </div>
            </div>
        );
    }

    // Render appropriate view
    const ViewComponent = isMobile ? MobileView : DesktopView;

    return (
        <ViewComponent
            isEnabled={isEnabled === true}
            sessions={sessions as Session[]}
            pendingTransfers={pendingTransfers as OfflineTransfer[]}
            stats={stats}
            isLoading={isLoading}
            onRefresh={handleRefresh}
        />
    );
}
