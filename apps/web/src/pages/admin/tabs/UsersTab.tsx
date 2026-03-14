/**
 * ═══════════════════════════════════════════════════════════════
 * ADMIN USERS TAB - MATERIAL YOU 3 DESIGN
 * ═══════════════════════════════════════════════════════════════
 *
 * User management table with actions.
 * Features M3 animated rows and interactive buttons.
 *
 * ═══════════════════════════════════════════════════════════════
 */
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Crown,
    Edit,
    Trash2,
    RefreshCw,
    Zap,
    UserCheck,
    ShieldCheck,
    Search,
    Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UsersTabProps {
    usersData: any;
    usersLoading: boolean;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    roleFilter: "all" | "user" | "admin";
    setRoleFilter: (filter: "all" | "user" | "admin") => void;
    currentUserId: number | undefined;
    onEditLimits: (user: any) => void;
    onChangeRole: (user: any) => void;
    onDeleteUser: (user: any) => void;
    onInvalidateCache: (userId: number) => void;
    onResetRateLimit: (userId: number) => void;
    invalidateCachePending: boolean;
}

// M3 easing
const m3Transition = {
    duration: 0.35,
    ease: [0.05, 0.7, 0.1, 1] as [number, number, number, number],
};

export function UsersTab({
    usersData,
    usersLoading,
    searchQuery,
    setSearchQuery,
    roleFilter,
    setRoleFilter,
    currentUserId,
    onEditLimits,
    onChangeRole,
    onDeleteUser,
    onInvalidateCache,
    onResetRateLimit,
    invalidateCachePending,
}: UsersTabProps) {
    return (
        <div className="space-y-6">
            <Card className="m3-card">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <motion.div
                            className="m3-icon-container"
                            whileHover={{ scale: 1.08, rotate: 5 }}
                            transition={{ type: "spring", stiffness: 400, damping: 17 }}
                        >
                            <Users className="h-5 w-5" />
                        </motion.div>
                        <div>
                            <CardTitle>User Management</CardTitle>
                            <CardDescription>
                                Manage all users, roles, and permissions
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Filters - M3 styled */}
                    <motion.div
                        className="flex gap-4 mb-6"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...m3Transition, delay: 0.1 }}
                    >
                        <div className="relative max-w-sm flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search users..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 rounded-xl border-border/50 focus-visible:ring-primary/20"
                            />
                        </div>
                        <Select
                            value={roleFilter}
                            onValueChange={(value: "all" | "user" | "admin") => setRoleFilter(value)}
                        >
                            <SelectTrigger className="w-[180px] rounded-xl border-border/50">
                                <SelectValue placeholder="Filter by role" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                                <SelectItem value="all">All Roles</SelectItem>
                                <SelectItem value="user">Users</SelectItem>
                                <SelectItem value="admin">Admins</SelectItem>
                            </SelectContent>
                        </Select>
                    </motion.div>

                    {/* Users Table - M3 styled */}
                    <motion.div
                        className="m3-table rounded-xl overflow-hidden"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...m3Transition, delay: 0.2 }}
                    >
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                    <TableHead className="font-semibold">User</TableHead>
                                    <TableHead className="font-semibold">Role</TableHead>
                                    <TableHead className="font-semibold">Files</TableHead>
                                    <TableHead className="font-semibold">Storage</TableHead>
                                    <TableHead className="text-right font-semibold">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {usersLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-12">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="m3-skeleton h-8 w-8 rounded-full" />
                                                <div className="m3-skeleton h-4 w-32" />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : !usersData || usersData.users.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-12">
                                            <div className="text-muted-foreground">No users found</div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    usersData.users.map((u: any, index: number) => (
                                        <motion.tr
                                            key={u.id}
                                            initial={{ opacity: 0, x: -16 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{
                                                ...m3Transition,
                                                delay: 0.25 + index * 0.03,
                                            }}
                                            className={cn(
                                                "m3-table-row border-b border-border/50",
                                                "transition-colors duration-200"
                                            )}
                                        >
                                            <TableCell>
                                                <motion.div
                                                    className="flex items-center gap-3"
                                                    whileHover={{ x: 4 }}
                                                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                                >
                                                    <div className={cn(
                                                        "w-10 h-10 rounded-xl flex items-center justify-center",
                                                        "bg-primary/10 text-primary font-medium text-sm"
                                                    )}>
                                                        {(u.name || u.email)?.[0]?.toUpperCase() || "?"}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium">{u.name || "No name"}</div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {u.email}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1.5">
                                                    <Badge
                                                        variant={u.role === "admin" ? "default" : "outline"}
                                                        className={cn(
                                                            "w-fit",
                                                            u.role === "admin" && "bg-primary text-primary-foreground"
                                                        )}
                                                    >
                                                        {u.role === "admin" && <Crown className="h-3 w-3 mr-1" />}
                                                        {u.role}
                                                    </Badge>
                                                    {u.role !== "admin" && (
                                                        <Badge variant="secondary" className="text-xs w-fit">
                                                            {u.subscriptionPlan || "free"}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm font-medium">
                                                    {u.fileCount} file{u.fileCount !== 1 ? "s" : ""}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <div className="text-sm">
                                                        {u.storageUsedMB} MB / {u.storageQuotaMB} MB
                                                    </div>
                                                    {/* Progress bar */}
                                                    <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                                                        <motion.div
                                                            className="h-full bg-primary rounded-full"
                                                            initial={{ width: 0 }}
                                                            animate={{
                                                                width: `${Math.min((u.storageUsedMB / u.storageQuotaMB) * 100, 100)}%`
                                                            }}
                                                            transition={{ duration: 0.6, delay: 0.3 + index * 0.03 }}
                                                        />
                                                    </div>
                                                    {u.hasCustomQuotas && (
                                                        <Badge variant="outline" className="text-xs text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700">
                                                            <ShieldCheck className="h-3 w-3 mr-1" />
                                                            Protegido
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    {u.id !== currentUserId && (
                                                        <motion.div
                                                            whileHover={{ scale: 1.1 }}
                                                            whileTap={{ scale: 0.95 }}
                                                        >
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => onChangeRole(u)}
                                                                title={u.role === "admin" ? "Demote to User" : "Promote to Admin"}
                                                                className="text-blue-500 hover:text-blue-600 hover:bg-blue-500/10 rounded-xl"
                                                            >
                                                                <UserCheck className="h-4 w-4" />
                                                            </Button>
                                                        </motion.div>
                                                    )}
                                                    <motion.div
                                                        whileHover={{ scale: 1.1 }}
                                                        whileTap={{ scale: 0.95 }}
                                                    >
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => onInvalidateCache(u.id)}
                                                            title="Invalidate User Cache"
                                                            disabled={invalidateCachePending}
                                                            className="hover:bg-muted/50 rounded-xl"
                                                        >
                                                            <RefreshCw className={`h-4 w-4 ${invalidateCachePending ? "animate-spin" : ""}`} />
                                                        </Button>
                                                    </motion.div>
                                                    <motion.div
                                                        whileHover={{ scale: 1.1 }}
                                                        whileTap={{ scale: 0.95 }}
                                                    >
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => onResetRateLimit(u.id)}
                                                            title="Reset Rate Limits"
                                                            className="text-yellow-500 hover:text-yellow-600 hover:bg-yellow-500/10 rounded-xl"
                                                        >
                                                            <Zap className="h-4 w-4" />
                                                        </Button>
                                                    </motion.div>
                                                    <motion.div
                                                        whileHover={{ scale: 1.1 }}
                                                        whileTap={{ scale: 0.95 }}
                                                    >
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => onEditLimits(u)}
                                                            title="Edit Limits"
                                                            className="hover:bg-muted/50 rounded-xl"
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                    </motion.div>
                                                    {u.id !== currentUserId && (
                                                        <motion.div
                                                            whileHover={{ scale: 1.1 }}
                                                            whileTap={{ scale: 0.95 }}
                                                        >
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl"
                                                                onClick={() => onDeleteUser(u)}
                                                                title="Delete User"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </motion.div>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </motion.tr>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </motion.div>
                </CardContent>
            </Card>
        </div>
    );
}
