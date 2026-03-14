/**
 * ═══════════════════════════════════════════════════════════════
 * ADMIN PANEL - MATERIAL YOU 3 DESIGN
 * ═══════════════════════════════════════════════════════════════
 *
 * System administration with Material Design 3 aesthetics.
 * Features smooth, fluid animations and expressive motion.
 *
 * Modular architecture:
 * - tabs/DashboardTab.tsx - Stats, health, activity
 * - tabs/UsersTab.tsx - User management
 * - tabs/MetricsTab.tsx - System metrics
 * - tabs/CacheTab.tsx - Cache management
 * - dialogs/index.tsx - All confirmation dialogs
 * - hooks/useAdminQueries.ts - Queries and mutations
 *
 * ═══════════════════════════════════════════════════════════════
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { AuroraCard, AuroraCardContent } from "@/components/ui/aurora-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FadeIn } from "@/components/ui/animated";
import {
    Users,
    Shield,
    Crown,
    AlertCircle,
    FileText,
    LayoutDashboard,
    ServerCog,
    UserPlus,
    BarChart3,
    Wand2,
    Terminal,
    Database,
    Send,
} from "lucide-react";
import { useState } from "react";

// Components
import { RegistrationControl } from "@/components/RegistrationControl";

// Admin modular components
import { DashboardTab } from "./tabs/DashboardTab";
import { UsersTab } from "./tabs/UsersTab";
import { MetricsTab } from "./tabs/MetricsTab";
import { CacheTab } from "./tabs/CacheTab";
import { FeaturesTab } from "./tabs/FeaturesTab";
import { AuditTab } from "./tabs/AuditTab";
import { SystemMonitorTab } from "./tabs/SystemMonitorTab";
import { DatabaseHealthTab } from "./tabs/DatabaseHealthTab";
import { SendAbuseTab } from "./tabs/SendAbuseTab";
import {
    EditLimitsDialog,
    DeleteUserDialog,
    ChangeRoleDialog,
    FlushCacheDialog,
} from "./dialogs";
import {
    useAdminQueries,
    useUsersQuery,
    useAdminMutations,
    LimitForm,
} from "./hooks/useAdminQueries";

export default function AdminPanel() {
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState<"all" | "user" | "admin">("all");

    // Dialog States
    const [editLimitsOpen, setEditLimitsOpen] = useState(false);
    const [deleteUserOpen, setDeleteUserOpen] = useState(false);
    const [changeRoleOpen, setChangeRoleOpen] = useState(false);
    const [flushCacheOpen, setFlushCacheOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [selectedPlan, setSelectedPlan] = useState<"free" | "pro" | "business" | "admin">("free");

    // Edit Limits Form State
    const [limitForm, setLimitForm] = useState<LimitForm>({
        storageQuota: 1,
        maxFileSize: 500,
        maxShares: 10,
        hasCustomQuotas: false,
    });

    // Queries
    const {
        stats, statsLoading, refetchStats,
        health, healthLoading,
        recentActivity, activityLoading,
        cacheStats, cacheLoading, refetchCache,
        metrics, metricsLoading, refetchMetrics,
    } = useAdminQueries();

    const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } =
        useUsersQuery(searchQuery, roleFilter);

    // Mutations
    const {
        updateLimitsMutation,
        deleteUserMutation,
        resetRateLimitMutation,
        updateRoleMutation,
        flushCachesMutation,
        invalidateUserCachesMutation,
    } = useAdminMutations({
        onUserUpdate: () => {
            refetchUsers();
            setEditLimitsOpen(false);
            setDeleteUserOpen(false);
            setChangeRoleOpen(false);
            setSelectedUser(null);
        },
        onStatsUpdate: () => refetchStats(),
        onCacheUpdate: () => {
            refetchCache();
            setFlushCacheOpen(false);
        },
    });

    // Handlers
    const openEditLimits = (user: any) => {
        setSelectedUser(user);
        setLimitForm({
            storageQuota: Math.round(user.storageQuotaMB / 1024),
            maxFileSize: user.maxFileSize ? Math.round(user.maxFileSize / (1024 * 1024)) : 500,
            maxShares: user.maxShares || 10,
            hasCustomQuotas: user.hasCustomQuotas || false,
        });
        setEditLimitsOpen(true);
    };

    const openChangeRole = (user: any) => {
        setSelectedUser(user);
        // Set initial plan based on current user state
        if (user.role === "admin") {
            setSelectedPlan("admin");
        } else {
            setSelectedPlan((user.subscriptionPlan || "free") as "free" | "pro" | "business");
        }
        setChangeRoleOpen(true);
    };

    const handleChangeRole = () => {
        if (!selectedUser) return;
        updateRoleMutation.mutate({
            userId: selectedUser.id,
            role: selectedPlan === "admin" ? "admin" : "user",
            subscriptionPlan: selectedPlan !== "admin" ? selectedPlan : undefined,
        });
    };

    const handleUpdateLimits = () => {
        if (!selectedUser) return;
        updateLimitsMutation.mutate({
            userId: selectedUser.id,
            storageQuota: limitForm.storageQuota * 1024 * 1024 * 1024,
            maxFileSize: limitForm.maxFileSize * 1024 * 1024,
            maxShares: limitForm.maxShares,
            hasCustomQuotas: limitForm.hasCustomQuotas,
        });
    };

    const handleDeleteUser = () => {
        if (!selectedUser) return;
        deleteUserMutation.mutate({ userId: selectedUser.id });
    };

    const handleFlushAllCaches = () => {
        flushCachesMutation.mutate();
    };

    const handleInvalidateUserCache = (userId: number) => {
        invalidateUserCachesMutation.mutate({ userId });
    };

    const handleResetRateLimit = (userId: number) => {
        resetRateLimitMutation.mutate({ userId: String(userId) });
    };

    // Redirect if not admin
    if (user && user.role !== "admin") {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <AlertCircle className="h-16 w-16 text-destructive" />
                <h1 className="text-2xl font-bold">Access Denied</h1>
                <p className="text-muted-foreground">You do not have admin privileges</p>
            </div>
        );
    }

    return (
            <div className="admin-panel space-y-6">
                {/* Header - M3 Card with elevated surface */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        duration: 0.4,
                        ease: [0.05, 0.7, 0.1, 1], // M3 emphasized decelerate
                    }}
                >
                    <div className="m3-card m3-card-elevated relative overflow-hidden p-6">
                        {/* Ambient glow */}
                        <div
                            className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none"
                            style={{ background: 'hsl(var(--primary))' }}
                        />
                        <div className="relative flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <motion.div
                                    className="m3-icon-container"
                                    whileHover={{ scale: 1.08, rotate: 5 }}
                                    whileTap={{ scale: 0.95 }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 400,
                                        damping: 17,
                                    }}
                                >
                                    <Crown className="h-6 w-6" />
                                </motion.div>
                                <div>
                                    <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                                        Admin Panel
                                    </h1>
                                    <p className="text-muted-foreground text-sm mt-0.5">
                                        System administration and management
                                    </p>
                                </div>
                            </div>
                            <motion.div
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.98 }}
                                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                            >
                                <Badge className="m3-badge">
                                    <Shield className="h-3.5 w-3.5" />
                                    Administrator
                                </Badge>
                            </motion.div>
                        </div>
                    </div>
                </motion.div>

                {/* M3 Tabs with smooth transitions */}
                <Tabs defaultValue="dashboard" className="space-y-6">
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                            duration: 0.35,
                            delay: 0.1,
                            ease: [0.05, 0.7, 0.1, 1],
                        }}
                    >
                        <TabsList className="m3-tabs-list flex-wrap h-auto gap-1 p-1.5 bg-muted/50 rounded-2xl">
                            <TabsTrigger value="dashboard" className="m3-tab-trigger">
                                <LayoutDashboard className="h-4 w-4 mr-2" />
                                Dashboard
                            </TabsTrigger>
                            <TabsTrigger value="users" className="m3-tab-trigger">
                                <Users className="h-4 w-4 mr-2" />
                                Users
                            </TabsTrigger>
                            <TabsTrigger value="registration" className="m3-tab-trigger">
                                <UserPlus className="h-4 w-4 mr-2" />
                                Registration
                            </TabsTrigger>
                            <TabsTrigger value="metrics" className="m3-tab-trigger">
                                <BarChart3 className="h-4 w-4 mr-2" />
                                Metrics
                            </TabsTrigger>
                            <TabsTrigger value="cache" className="m3-tab-trigger">
                                <ServerCog className="h-4 w-4 mr-2" />
                                Cache
                            </TabsTrigger>
                            <TabsTrigger value="audit" className="m3-tab-trigger">
                                <FileText className="h-4 w-4 mr-2" />
                                Audit
                            </TabsTrigger>
                            <TabsTrigger value="monitor" className="m3-tab-trigger">
                                <Terminal className="h-4 w-4 mr-2 text-teal-500" />
                                Monitor
                            </TabsTrigger>
                            <TabsTrigger value="features" className="m3-tab-trigger">
                                <Wand2 className="h-4 w-4 mr-2" />
                                Features
                            </TabsTrigger>
                            <TabsTrigger value="send" className="m3-tab-trigger">
                                <Send className="h-4 w-4 mr-2 text-orange-500" />
                                Send
                            </TabsTrigger>
                            <TabsTrigger value="database" className="m3-tab-trigger">
                                <Database className="h-4 w-4 mr-2 text-indigo-500" />
                                Database
                            </TabsTrigger>
                        </TabsList>
                    </motion.div>

                    {/* Dashboard Tab - M3 animated content */}
                    <TabsContent value="dashboard" className="space-y-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.05, 0.7, 0.1, 1] }}
                        >
                            <DashboardTab
                                stats={stats}
                                statsLoading={statsLoading}
                                health={health}
                                healthLoading={healthLoading}
                                recentActivity={recentActivity || []}
                                activityLoading={activityLoading}
                            />
                        </motion.div>
                    </TabsContent>

                    {/* Users Tab - M3 animated content */}
                    <TabsContent value="users" className="space-y-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.05, 0.7, 0.1, 1] }}
                        >
                            <UsersTab
                                usersData={usersData}
                                usersLoading={usersLoading}
                                searchQuery={searchQuery}
                                setSearchQuery={setSearchQuery}
                                roleFilter={roleFilter}
                                setRoleFilter={setRoleFilter}
                                currentUserId={user?.id}
                                onEditLimits={openEditLimits}
                                onChangeRole={openChangeRole}
                                onDeleteUser={(u) => {
                                    setSelectedUser(u);
                                    setDeleteUserOpen(true);
                                }}
                                onInvalidateCache={handleInvalidateUserCache}
                                onResetRateLimit={handleResetRateLimit}
                                invalidateCachePending={invalidateUserCachesMutation.isPending}
                            />
                        </motion.div>
                    </TabsContent>

                    {/* Registration Tab - M3 animated content */}
                    <TabsContent value="registration">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.05, 0.7, 0.1, 1] }}
                        >
                            <RegistrationControl />
                        </motion.div>
                    </TabsContent>

                    {/* Metrics Tab - M3 animated content */}
                    <TabsContent value="metrics" className="space-y-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.05, 0.7, 0.1, 1] }}
                        >
                            <MetricsTab
                                metrics={metrics}
                                metricsLoading={metricsLoading}
                                refetchMetrics={refetchMetrics}
                            />
                        </motion.div>
                    </TabsContent>

                    {/* Cache Tab - M3 animated content */}
                    <TabsContent value="cache" className="space-y-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.05, 0.7, 0.1, 1] }}
                        >
                            <CacheTab
                                cacheStats={cacheStats}
                                cacheLoading={cacheLoading}
                                refetchCache={refetchCache}
                                onFlushCaches={() => setFlushCacheOpen(true)}
                                flushPending={flushCachesMutation.isPending}
                            />
                        </motion.div>
                    </TabsContent>

                    {/* Audit Tab - M3 animated content */}
                    <TabsContent value="audit" className="space-y-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.05, 0.7, 0.1, 1] }}
                        >
                            <AuditTab />
                        </motion.div>
                    </TabsContent>

                    {/* Monitor Tab - Real-time terminal */}
                    <TabsContent value="monitor" className="space-y-6">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4, ease: [0.05, 0.7, 0.1, 1] }}
                        >
                            <SystemMonitorTab />
                        </motion.div>
                    </TabsContent>

                    {/* Features Tab - M3 animated content */}
                    <TabsContent value="features" className="space-y-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.05, 0.7, 0.1, 1] }}
                        >
                            <FeaturesTab />
                        </motion.div>
                    </TabsContent>

                    {/* Send Abuse Tab */}
                    <TabsContent value="send" className="space-y-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.05, 0.7, 0.1, 1] }}
                        >
                            <SendAbuseTab />
                        </motion.div>
                    </TabsContent>

                    {/* Database Health Tab */}
                    <TabsContent value="database" className="space-y-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.05, 0.7, 0.1, 1] }}
                        >
                            <DatabaseHealthTab />
                        </motion.div>
                    </TabsContent>
                </Tabs>

                {/* Dialogs */}
                <EditLimitsDialog
                    open={editLimitsOpen}
                    onOpenChange={setEditLimitsOpen}
                    selectedUser={selectedUser}
                    limitForm={limitForm}
                    setLimitForm={setLimitForm}
                    onSave={handleUpdateLimits}
                    isPending={updateLimitsMutation.isPending}
                />

                <DeleteUserDialog
                    open={deleteUserOpen}
                    onOpenChange={setDeleteUserOpen}
                    selectedUser={selectedUser}
                    onDelete={handleDeleteUser}
                    isPending={deleteUserMutation.isPending}
                />

                <ChangeRoleDialog
                    open={changeRoleOpen}
                    onOpenChange={setChangeRoleOpen}
                    selectedUser={selectedUser}
                    selectedPlan={selectedPlan}
                    onPlanChange={setSelectedPlan}
                    onConfirm={handleChangeRole}
                    isPending={updateRoleMutation.isPending}
                />

                <FlushCacheDialog
                    open={flushCacheOpen}
                    onOpenChange={setFlushCacheOpen}
                    onConfirm={handleFlushAllCaches}
                    isPending={flushCachesMutation.isPending}
                />
            </div>
    );
}
