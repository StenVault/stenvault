/**
 * ═══════════════════════════════════════════════════════════════
 * ADMIN DASHBOARD TAB - MATERIAL YOU 3 DESIGN
 * ═══════════════════════════════════════════════════════════════
 *
 * System stats, health status, and recent activity.
 * Features M3 cards with smooth hover animations.
 *
 * ═══════════════════════════════════════════════════════════════
 */
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Users,
    HardDrive,
    Database,
    Zap,
    CheckCircle,
    XCircle,
    Clock,
    FileText,
    AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface DashboardTabProps {
    stats: any;
    statsLoading: boolean;
    health: any;
    healthLoading: boolean;
    recentActivity: any[];
    activityLoading: boolean;
}

// M3 easing and timing
const m3Transition = {
    duration: 0.35,
    ease: [0.05, 0.7, 0.1, 1] as [number, number, number, number], // M3 emphasized decelerate
};

const staggerContainer = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.08,
            delayChildren: 0.05,
        },
    },
};

const staggerItem = {
    hidden: { opacity: 0, y: 16 },
    show: {
        opacity: 1,
        y: 0,
        transition: m3Transition,
    },
};

export function DashboardTab({
    stats,
    statsLoading,
    health,
    healthLoading,
    recentActivity,
    activityLoading,
}: DashboardTabProps) {
    return (
        <div className="space-y-6">
            {/* System Stats Grid - M3 Stat Cards */}
            <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
            >
                {/* Total Users */}
                <motion.div variants={staggerItem}>
                    <div className="m3-stat-card group">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-muted-foreground">Total Users</span>
                            <motion.div
                                className="m3-icon-container !w-10 !h-10"
                                whileHover={{ scale: 1.08, rotate: 5 }}
                                whileTap={{ scale: 0.95 }}
                                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                            >
                                <Users className="h-5 w-5" />
                            </motion.div>
                        </div>
                        <div className="text-3xl font-bold text-foreground">
                            {statsLoading ? (
                                <div className="m3-skeleton h-9 w-16" />
                            ) : (
                                stats?.users.total || 0
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {stats?.users.admins || 0} admin{(stats?.users.admins || 0) !== 1 ? "s" : ""}
                        </p>
                    </div>
                </motion.div>

                {/* Total Files */}
                <motion.div variants={staggerItem}>
                    <div className="m3-stat-card group">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-muted-foreground">Total Files</span>
                            <motion.div
                                className="m3-icon-container !w-10 !h-10"
                                whileHover={{ scale: 1.08, rotate: 5 }}
                                whileTap={{ scale: 0.95 }}
                                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                            >
                                <HardDrive className="h-5 w-5" />
                            </motion.div>
                        </div>
                        <div className="text-3xl font-bold text-foreground">
                            {statsLoading ? (
                                <div className="m3-skeleton h-9 w-16" />
                            ) : (
                                stats?.files.total || 0
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {stats?.files.active || 0} active
                        </p>
                    </div>
                </motion.div>

                {/* Storage Used */}
                <motion.div variants={staggerItem}>
                    <div className="m3-stat-card group">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-muted-foreground">Storage Used</span>
                            <motion.div
                                className="m3-icon-container !w-10 !h-10"
                                whileHover={{ scale: 1.08, rotate: 5 }}
                                whileTap={{ scale: 0.95 }}
                                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                            >
                                <Database className="h-5 w-5" />
                            </motion.div>
                        </div>
                        <div className="text-3xl font-bold text-foreground">
                            {statsLoading ? (
                                <div className="m3-skeleton h-9 w-24" />
                            ) : (
                                `${stats?.storage.totalGB || 0} GB`
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {stats?.storage.totalMB || 0} MB total
                        </p>
                    </div>
                </motion.div>

                {/* Rate Limits */}
                <motion.div variants={staggerItem}>
                    <div className="m3-stat-card group">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-muted-foreground">Rate Limits</span>
                            <motion.div
                                className="m3-icon-container !w-10 !h-10"
                                whileHover={{ scale: 1.08, rotate: 5 }}
                                whileTap={{ scale: 0.95 }}
                                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                            >
                                <Zap className="h-5 w-5" />
                            </motion.div>
                        </div>
                        <div className="text-3xl font-bold text-foreground">
                            {statsLoading ? (
                                <div className="m3-skeleton h-9 w-16" />
                            ) : (
                                stats?.rateLimits.totalRequests || 0
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {stats?.rateLimits.blockedRequests || 0} blocked today
                        </p>
                    </div>
                </motion.div>
            </motion.div>

            {/* Health and Activity Section */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                {/* System Health - M3 Card */}
                <motion.div
                    className="col-span-3"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...m3Transition, delay: 0.3 }}
                >
                    <Card className="m3-card h-full">
                        <CardHeader>
                            <CardTitle>System Health</CardTitle>
                            <CardDescription>Status of core services and integrations</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {healthLoading ? (
                                    <div className="space-y-3">
                                        <div className="m3-skeleton h-6 w-full" />
                                        <div className="m3-skeleton h-6 w-full" />
                                        <div className="m3-skeleton h-6 w-3/4" />
                                    </div>
                                ) : !health ? (
                                    <div className="text-sm text-destructive">Failed to load health status</div>
                                ) : (
                                    <>
                                        {/* Database */}
                                        <motion.div
                                            className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                                            whileHover={{ x: 4 }}
                                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Database className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm font-medium">Database</span>
                                            </div>
                                            {health.database ? (
                                                <div className="flex items-center gap-1.5">
                                                    <div className="m3-health-dot healthy" />
                                                    <span className="text-sm text-green-500">Operational</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5">
                                                    <div className="m3-health-dot error" />
                                                    <span className="text-sm text-destructive">Issues Detected</span>
                                                </div>
                                            )}
                                        </motion.div>

                                        {/* Redis */}
                                        <motion.div
                                            className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                                            whileHover={{ x: 4 }}
                                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Zap className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm font-medium">Redis (Rate Limiting)</span>
                                            </div>
                                            {health.redis ? (
                                                <div className="flex items-center gap-1.5">
                                                    <div className="m3-health-dot healthy" />
                                                    <span className="text-sm text-green-500">Connected</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5">
                                                    <div className="m3-health-dot warning" />
                                                    <span className="text-sm text-yellow-500">Not Configured</span>
                                                </div>
                                            )}
                                        </motion.div>

                                        {/* Storage */}
                                        <motion.div
                                            className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                                            whileHover={{ x: 4 }}
                                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <HardDrive className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm font-medium">Storage (R2)</span>
                                            </div>
                                            {health.storage ? (
                                                <div className="flex items-center gap-1.5">
                                                    <div className="m3-health-dot healthy" />
                                                    <span className="text-sm text-green-500">Operational</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5">
                                                    <div className="m3-health-dot error" />
                                                    <span className="text-sm text-destructive">Checking...</span>
                                                </div>
                                            )}
                                        </motion.div>

                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Recent Activity - M3 Card */}
                <motion.div
                    className="col-span-4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...m3Transition, delay: 0.4 }}
                >
                    <Card className="m3-card h-full">
                        <CardHeader>
                            <CardTitle>Recent Activity</CardTitle>
                            <CardDescription>Latest file uploads and actions</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {activityLoading ? (
                                    <div className="space-y-3">
                                        {[1, 2, 3].map((i) => (
                                            <div key={i} className="m3-skeleton h-20 w-full" />
                                        ))}
                                    </div>
                                ) : !recentActivity || recentActivity.length === 0 ? (
                                    <div className="text-sm text-muted-foreground text-center py-12">
                                        No recent activity found
                                    </div>
                                ) : (
                                    recentActivity.map((activity: any, index: number) => (
                                        <motion.div
                                            key={activity.id}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{
                                                ...m3Transition,
                                                delay: 0.45 + index * 0.05,
                                            }}
                                            className={cn(
                                                "flex items-start justify-between p-3 rounded-xl",
                                                "bg-muted/30 hover:bg-muted/50",
                                                "transition-all duration-200",
                                                "border-b border-transparent",
                                                "last:border-0"
                                            )}
                                            whileHover={{ x: 4 }}
                                        >
                                            <div className="flex gap-3">
                                                <motion.div
                                                    className="m3-icon-container !w-10 !h-10"
                                                    whileHover={{ scale: 1.1, rotate: 5 }}
                                                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                                                >
                                                    <FileText className="h-4 w-4" />
                                                </motion.div>
                                                <div>
                                                    <p className="text-sm font-medium text-foreground">New File Upload</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        <strong>{activity.user.name}</strong> uploaded a {activity.fileType} file
                                                    </p>
                                                    <p className="text-xs text-muted-foreground/70 mt-1">
                                                        {(activity.size / (1024 * 1024)).toFixed(2)} MB
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center text-xs text-muted-foreground">
                                                <Clock className="h-3 w-3 mr-1" />
                                                {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </div>
    );
}
