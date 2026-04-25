import { useOrgAuditLogs } from "@/hooks/organizations/useOrganizations";
import { trpc } from "@/lib/trpc";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@stenvault/shared/ui/table";
import { Badge } from "@stenvault/shared/ui/badge";
import { Button } from "@stenvault/shared/ui/button";
import { AuroraCard, AuroraCardContent } from "@stenvault/shared/ui/aurora-card";
import { Separator } from "@/components/ui/separator";
import {
    Activity,
    ChevronLeft,
    ChevronRight,
    Clock,
    User,
    Lock,
} from "lucide-react";
import { format as formatDate } from "date-fns";
import { useNavigate } from "react-router-dom";

interface OrgAuditLogsProps {
    organizationId: number;
}

export function OrgAuditLogs({ organizationId }: OrgAuditLogsProps) {
    const navigate = useNavigate();

    const { data: subscription } = trpc.stripe.getSubscription.useQuery(undefined, {
        staleTime: 60000,
    });
    const hasFeature = subscription?.isAdmin || subscription?.features?.orgAuditLogs === true;

    if (hasFeature === false && subscription) {
        return (
            <AuroraCard variant="glass">
                <AuroraCardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Activity className="w-5 h-5 text-muted-foreground" />
                        <h3 className="font-medium">Audit Logs</h3>
                    </div>
                    <Separator className="mb-4" />
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                        <div className="p-3 rounded-full bg-muted/30">
                            <Lock className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground max-w-sm">
                            Track member activity across your organization. Audit logs are available on the Business plan.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/settings?tab=subscription")}
                        >
                            View plans
                        </Button>
                    </div>
                </AuroraCardContent>
            </AuroraCard>
        );
    }

    if (!hasFeature) return null;

    return <OrgAuditLogsTable organizationId={organizationId} />;
}

function OrgAuditLogsTable({ organizationId }: { organizationId: number }) {
    const { logs, total, isLoading, page, setPage, limit } = useOrgAuditLogs(organizationId);
    const totalPages = Math.ceil(total / limit);

    return (
        <AuroraCard variant="glass">
            <AuroraCardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Activity className="w-5 h-5 text-muted-foreground" />
                    <h3 className="font-medium">Audit Logs</h3>
                </div>
                <Separator className="mb-4" />

                {/* Summary + Pagination */}
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted-foreground">
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

                <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
                    <Table>
                        <TableHeader className="bg-white/[0.01]">
                            <TableRow className="hover:bg-transparent border-white/[0.08]">
                                <TableHead className="w-[160px] text-[11px] uppercase tracking-wider font-bold">Date/Time</TableHead>
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
                                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                        No activity recorded yet.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log) => (
                                    <TableRow key={log.id} className="border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                                        <TableCell className="text-xs whitespace-nowrap py-3">
                                            <div className="flex items-center gap-2">
                                                <Clock className="h-3 w-3 text-muted-foreground" />
                                                {formatDate(new Date(log.createdAt), "dd/MM/yy HH:mm")}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-sm font-medium">
                                                    {log.action.replace(/_/g, " ")}
                                                </span>
                                                {log.resourceType && (
                                                    <span className="text-[10px] text-muted-foreground uppercase tracking-tight">
                                                        {log.resourceType} {log.resourceId ? `#${log.resourceId}` : ""}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <div className="flex items-center gap-2">
                                                <User className="h-3.5 w-3.5 text-muted-foreground" />
                                                <span className="text-sm truncate max-w-[150px]" title={log.userEmail || ""}>
                                                    {log.userEmail || `ID: ${log.userId}`}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center py-3">
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
            </AuroraCardContent>
        </AuroraCard>
    );
}
