/**
 * Admin Panel - Audit Tab
 * Real-time audit log viewer and export tools
 */
import { AuditExport } from "@/components/AuditExport";
import { useAuditLogs } from "../hooks/useAdminQueries";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    ChevronLeft,
    ChevronRight,
    ShieldCheck,
    ShieldAlert,
    Clock,
    User,
    Activity,
    Search
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { format as formatDate } from "date-fns";

export function AuditTab() {
    const {
        logs,
        total,
        isLoading,
        page,
        setPage,
        limit
    } = useAuditLogs();

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Export Tools (Sidebar-like) */}
                <div className="lg:col-span-1">
                    <AuditExport />
                </div>

                {/* Audit Viewer (Main table) */}
                <Card className="lg:col-span-2 overflow-hidden border-white/[0.08] bg-white/[0.02]">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Activity className="h-5 w-5 text-teal-400" />
                                Audit Log Viewer
                            </CardTitle>
                            <CardDescription>
                                Real-time system activity log
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {/* Summary Bar */}
                        <div className="flex items-center justify-between px-6 py-3 bg-white/[0.02] border-y border-white/[0.08]">
                            <span className="text-xs text-muted-foreground font-medium">
                                Total: <span className="text-foreground">{total.toLocaleString()}</span> logs
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setPage(Math.max(0, page - 1))}
                                    disabled={page === 0 || isLoading}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="text-xs font-medium">
                                    Page {page + 1} of {totalPages || 1}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                                    disabled={page >= totalPages - 1 || isLoading}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-white/[0.01]">
                                    <TableRow className="hover:bg-transparent border-white/[0.08]">
                                        <TableHead className="w-[180px] text-[11px] uppercase tracking-wider font-bold">Date/Time</TableHead>
                                        <TableHead className="text-[11px] uppercase tracking-wider font-bold">Action</TableHead>
                                        <TableHead className="text-[11px] uppercase tracking-wider font-bold">User</TableHead>
                                        <TableHead className="text-[11px] uppercase tracking-wider font-bold text-center">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <TableRow key={i} className="animate-pulse border-white/[0.04]">
                                                <TableCell colSpan={4} className="h-12 bg-white/[0.01]" />
                                            </TableRow>
                                        ))
                                    ) : logs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                                                No logs found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        logs.map((log: any) => (
                                            <TableRow key={log.id} className="group border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                                                <TableCell className="text-xs whitespace-nowrap py-4">
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                                        {formatDate(new Date(log.createdAt), "dd/MM/yy HH:mm")}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-4">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-sm font-medium">
                                                            {log.action.replace(/_/g, ' ')}
                                                        </span>
                                                        {log.resourceType && (
                                                            <span className="text-[10px] text-muted-foreground uppercase tracking-tight">
                                                                {log.resourceType} {log.resourceId ? `#${log.resourceId}` : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-4">
                                                    <div className="flex items-center gap-2">
                                                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                                                        <span className="text-sm truncate max-w-[150px]" title={log.userEmail || ""}>
                                                            {log.userEmail || `ID: ${log.userId}` || "Sistema"}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center py-4">
                                                    {log.success ? (
                                                        <Badge variant="outline" className="bg-teal-500/10 text-teal-400 border-teal-500/20 text-[10px] px-1.5 py-0 h-5">
                                                            SUCCESS
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] px-1.5 py-0 h-5">
                                                            FAILED
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
