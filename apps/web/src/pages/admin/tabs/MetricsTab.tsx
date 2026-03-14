/**
 * Admin Panel - Metrics Tab
 * System, business, AI, and auth metrics
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Clock,
    Cpu,
    Activity,
    Wifi,
    Users,
    FileText,
    HardDrive,
    Share2,
    Zap,
    Shield,
    BarChart3,
    RefreshCw,
    TrendingUp,
} from "lucide-react";
import { formatBytes, formatUptime } from "../utils";
import { useHistoricalMetrics } from "../hooks/useAdminQueries";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";

interface MetricsTabProps {
    metrics: any;
    metricsLoading: boolean;
    refetchMetrics: () => void;
}

export function MetricsTab({ metrics, metricsLoading, refetchMetrics }: MetricsTabProps) {
    const { data: history, isLoading: historyLoading } = useHistoricalMetrics(24);

    return (
        <div className="space-y-6">
            {/* Refresh Button */}
            <div className="flex justify-end">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchMetrics()}
                    disabled={metricsLoading}
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${metricsLoading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {/* System Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Uptime</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {metricsLoading ? "-" : formatUptime(metrics?.uptime || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Server running time
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {metricsLoading ? "-" : formatBytes(metrics?.system?.memoryUsed || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            of {formatBytes(metrics?.system?.memoryRss || 0)} RSS
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">HTTP Requests</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {metricsLoading ? "-" : (metrics?.http?.requestsTotal || 0).toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {metrics?.http?.activeConnections || 0} active connections
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">WebSocket</CardTitle>
                        <Wifi className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {metricsLoading ? "-" : metrics?.websocket?.connections || 0}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            active connections
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Business Metrics */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Business Metrics
                    </CardTitle>
                    <CardDescription>
                        Key performance indicators updated every minute
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="p-4 border rounded-sm">
                            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                <Users className="h-4 w-4" />
                                <span className="text-sm">Total Users</span>
                            </div>
                            <div className="text-2xl font-bold">{metrics?.business?.usersTotal || 0}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                                {metrics?.business?.usersActiveDaily || 0} active (24h)
                            </div>
                        </div>

                        <div className="p-4 border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                <FileText className="h-4 w-4" />
                                <span className="text-sm">Total Files</span>
                            </div>
                            <div className="text-2xl font-bold">{metrics?.business?.filesTotal || 0}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                                {metrics?.business?.uploadsTotal || 0} uploads total
                            </div>
                        </div>

                        <div className="p-4 border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                <HardDrive className="h-4 w-4" />
                                <span className="text-sm">Storage Used</span>
                            </div>
                            <div className="text-2xl font-bold">
                                {formatBytes(metrics?.business?.storageUsedBytes || 0)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                                {metrics?.business?.downloadsTotal || 0} downloads
                            </div>
                        </div>

                        <div className="p-4 border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                <Share2 className="h-4 w-4" />
                                <span className="text-sm">Active Shares</span>
                            </div>
                            <div className="text-2xl font-bold">{metrics?.business?.sharesActive || 0}</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* AI & Auth Metrics */}
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5" />
                            AI Usage
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Total API Calls</span>
                            <Badge variant="secondary">{metrics?.ai?.apiCallsTotal || 0}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Tokens Used</span>
                            <Badge variant="secondary">
                                {(metrics?.ai?.tokensUsed || 0).toLocaleString()}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5" />
                            Auth & Security
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Login Attempts</span>
                            <Badge variant="secondary">{metrics?.auth?.loginAttempts || 0}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Rate Limit Hits</span>
                            <Badge variant={metrics?.auth?.rateLimitHits ? "destructive" : "secondary"}>
                                {metrics?.auth?.rateLimitHits || 0}
                            </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Errors</span>
                            <Badge variant={metrics?.errors?.total ? "destructive" : "secondary"}>
                                {metrics?.errors?.total || 0}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Historical Charts */}
            <div className="grid gap-6 md:grid-cols-2">
                <Card className="md:col-span-2 overflow-hidden border-white/[0.08] bg-white/[0.02]">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-indigo-400" />
                            System Evolution (24h)
                        </CardTitle>
                        <CardDescription>
                            Real-time resource utilization and activity
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[350px] w-full pt-4 pr-6 pb-2 pl-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history || []}>
                                <defs>
                                    <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="createdAt"
                                    tickFormatter={(val) => new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    stroke="rgba(255,255,255,0.3)"
                                    fontSize={10}
                                />
                                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                                    labelFormatter={(label) => new Date(label).toLocaleString()}
                                />
                                <Area
                                    name="CPU %"
                                    type="monotone"
                                    dataKey="cpuUsage"
                                    stroke="#6366f1"
                                    fillOpacity={1}
                                    fill="url(#colorCpu)"
                                />
                                <Area
                                    name="Users (Active)"
                                    type="monotone"
                                    dataKey="activeUsers24h"
                                    stroke="#14b8a6"
                                    fillOpacity={1}
                                    fill="url(#colorMem)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="border-white/[0.08] bg-white/[0.02]">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Activity Load</CardTitle>
                        <CardDescription>HTTP Requests per measurement</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[200px] w-full p-4 pl-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history || []}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="createdAt"
                                    hide
                                />
                                <YAxis hide />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                                />
                                <Area
                                    name="Requests"
                                    type="monotone"
                                    dataKey="requestsPerMinute"
                                    stroke="#f43f5e"
                                    fill="rgba(244, 63, 94, 0.1)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="border-white/[0.08] bg-white/[0.02]">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Storage Growth</CardTitle>
                        <CardDescription>Total bytes in storage</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[200px] w-full p-4 pl-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history || []}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="createdAt"
                                    hide
                                />
                                <YAxis hide />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                                    formatter={(val: number) => formatBytes(val)}
                                />
                                <Area
                                    name="Storage"
                                    type="stepAfter"
                                    dataKey="totalStorageBytes"
                                    stroke="#e9d5ff"
                                    fill="rgba(233, 213, 255, 0.1)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Prometheus Endpoint Info */}
            <Card>
                <CardHeader>
                    <CardTitle>Prometheus Export</CardTitle>
                    <CardDescription>
                        These metrics are also available in Prometheus format
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                        <code className="flex-1 text-sm font-mono">
                            GET /api/metrics
                        </code>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open('/api/metrics', '_blank')}
                        >
                            Open
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                        Use this endpoint to scrape metrics with Prometheus and visualize them in Grafana.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
