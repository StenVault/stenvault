/**
 * Mobile View Component
 * Mobile-optimized layout for Quantum Mesh Dashboard
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Network,
    Zap,
    CloudDownload,
    RefreshCw,
} from "lucide-react";
import type { ViewProps } from "../types";
import {
    StatsCard,
    ActiveTransfers,
    PendingTransfers,
    ResumableTransfers,
    TransferHistory,
    FeatureDisabled,
} from "../components";

export function MobileView({ isEnabled, sessions, pendingTransfers, stats, isLoading, onRefresh }: ViewProps) {
    const [activeTab, setActiveTab] = useState("active");

    if (!isEnabled) {
        return <FeatureDisabled />;
    }

    return (
            <div className="px-4 py-6 space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Network className="h-6 w-6 text-purple-500" />
                        Quantum Mesh
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Secure peer-to-peer file transfers
                    </p>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-3">
                    <StatsCard
                        title="Active"
                        value={stats.active}
                        icon={<Zap className="h-5 w-5" />}
                    />
                    <StatsCard
                        title="Pending"
                        value={stats.pending}
                        icon={<CloudDownload className="h-5 w-5" />}
                    />
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="active">Active</TabsTrigger>
                        <TabsTrigger value="pending">
                            Pending
                            {stats.pending > 0 && (
                                <Badge className="ml-1.5 h-5 w-5 p-0 flex items-center justify-center bg-purple-500">
                                    {stats.pending}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="resume">
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Resume
                        </TabsTrigger>
                        <TabsTrigger value="history">History</TabsTrigger>
                    </TabsList>
                    <div className="mt-4">
                        <TabsContent value="active" className="m-0">
                            <ActiveTransfers
                                sessions={sessions}
                                isLoading={isLoading}
                                onRefresh={onRefresh}
                            />
                        </TabsContent>
                        <TabsContent value="pending" className="m-0">
                            <PendingTransfers
                                transfers={pendingTransfers}
                                isLoading={isLoading}
                            />
                        </TabsContent>
                        <TabsContent value="resume" className="m-0">
                            <ResumableTransfers />
                        </TabsContent>
                        <TabsContent value="history" className="m-0">
                            <TransferHistory
                                sessions={sessions}
                                isLoading={isLoading}
                            />
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
    );
}
