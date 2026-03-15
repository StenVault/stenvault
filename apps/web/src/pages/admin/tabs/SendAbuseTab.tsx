/**
 * Send Abuse Tab - Admin Panel
 * Analytics, abuse reports, and IP blocklist for /send.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  Download,
  AlertTriangle,
  HardDrive,
  Trash2,
  XCircle,
  Ban,
  ShieldOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
} from "lucide-react";
import { formatBytes } from "@/utils/formatters";
import { useSendAbuseQueries, useSendAbuseMutations } from "../hooks/useSendAbuseQueries";

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export function SendAbuseTab() {
  const { reports, analytics, blockedIps } = useSendAbuseQueries();
  const { dismissMutation, deleteMutation, banMutation, unbanMutation } = useSendAbuseMutations();

  // Ban IP form
  const [banIpInput, setBanIpInput] = useState("");
  const [banReasonInput, setBanReasonInput] = useState("");
  const [banPermanent, setBanPermanent] = useState(false);

  // Pagination for reports
  const [reportsPage, setReportsPage] = useState(0);
  const reportsPerPage = 20;

  const todayStats = analytics.data?.daily?.[0];
  const totals = analytics.data?.totals;

  const handleBanIp = () => {
    if (!banIpInput.trim() || !banReasonInput.trim()) return;
    banMutation.mutate(
      { ip: banIpInput.trim(), reason: banReasonInput.trim(), permanent: banPermanent },
      {
        onSuccess: () => {
          setBanIpInput("");
          setBanReasonInput("");
          setBanPermanent(false);
        },
      },
    );
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* ============ ANALYTICS ============ */}
      <motion.div variants={staggerItem}>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-orange-500" />
              Send Analytics
            </CardTitle>
            <CardDescription>Public send usage statistics</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : (
              <>
                {/* Today's stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <StatCard
                    label="Uploads Today"
                    value={todayStats?.uploads ?? 0}
                    icon={<Upload className="h-4 w-4 text-blue-500" />}
                  />
                  <StatCard
                    label="Downloads Today"
                    value={todayStats?.downloads ?? 0}
                    icon={<Download className="h-4 w-4 text-green-500" />}
                  />
                  <StatCard
                    label="Reports Today"
                    value={todayStats?.reports ?? 0}
                    icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
                  />
                  <StatCard
                    label="Bytes Today"
                    value={formatBytes(todayStats?.totalBytes ?? 0)}
                    icon={<HardDrive className="h-4 w-4 text-purple-500" />}
                    isString
                  />
                </div>

                {/* 7-day table */}
                {analytics.data?.daily && analytics.data.daily.length > 0 && (
                  <div className="rounded-lg border border-border/50 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Uploads</TableHead>
                          <TableHead className="text-right">Downloads</TableHead>
                          <TableHead className="text-right">Reports</TableHead>
                          <TableHead className="text-right">Bytes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.data.daily.map((day) => (
                          <TableRow key={day.date}>
                            <TableCell className="font-mono text-sm">{day.date}</TableCell>
                            <TableCell className="text-right">{day.uploads}</TableCell>
                            <TableCell className="text-right">{day.downloads}</TableCell>
                            <TableCell className="text-right">
                              {day.reports > 0 ? (
                                <span className="text-red-500 font-medium">{day.reports}</span>
                              ) : (
                                day.reports
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatBytes(day.totalBytes)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {totals && (
                  <div className="mt-3 text-sm text-muted-foreground">
                    7-day totals: {totals.uploads} uploads, {totals.downloads} downloads,{" "}
                    {totals.reports} reports, {formatBytes(totals.totalBytes)}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ============ ABUSE REPORTS ============ */}
      <motion.div variants={staggerItem}>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Abuse Reports
              {reports.data?.total ? (
                <Badge variant="destructive" className="ml-2">
                  {reports.data.total}
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription>Flagged send sessions (newest first)</CardDescription>
          </CardHeader>
          <CardContent>
            {reports.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : !reports.data?.items.length ? (
              <div className="text-center py-8 text-muted-foreground">
                No abuse reports
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Session</TableHead>
                        <TableHead>Uploader IP</TableHead>
                        <TableHead>File Size</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-center">Reports</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reports.data.items.map((item) => {
                        const primaryReason = item.reports[0]?.reason ?? "unknown";
                        return (
                          <TableRow key={item.sessionId}>
                            <TableCell className="font-mono text-xs">
                              {item.sessionId.slice(0, 12)}...
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {item.session?.uploaderIp ?? "—"}
                            </TableCell>
                            <TableCell>
                              {item.session ? formatBytes(item.session.fileSize) : "—"}
                            </TableCell>
                            <TableCell>
                              <ReasonBadge reason={primaryReason} />
                            </TableCell>
                            <TableCell className="text-center font-medium">
                              {item.reportCount}
                            </TableCell>
                            <TableCell>
                              {item.session ? (
                                <Badge variant={item.session.status === "ready" ? "default" : "secondary"}>
                                  {item.session.status}
                                </Badge>
                              ) : (
                                <Badge variant="outline">expired</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Dismiss"
                                  disabled={dismissMutation.isPending}
                                  onClick={() =>
                                    dismissMutation.mutate({ sessionId: item.sessionId })
                                  }
                                >
                                  <XCircle className="h-4 w-4 text-muted-foreground" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Delete session"
                                  disabled={deleteMutation.isPending}
                                  onClick={() =>
                                    deleteMutation.mutate({ sessionId: item.sessionId })
                                  }
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                                {item.session?.uploaderIp && item.session.uploaderIp !== "unknown" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title="Ban IP"
                                    disabled={banMutation.isPending}
                                    onClick={() =>
                                      banMutation.mutate({
                                        ip: item.session!.uploaderIp,
                                        reason: `Banned from abuse report: ${primaryReason}`,
                                      })
                                    }
                                  >
                                    <Ban className="h-4 w-4 text-orange-500" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {reports.data.total > reportsPerPage && (
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-sm text-muted-foreground">
                      Showing {reportsPage * reportsPerPage + 1}–
                      {Math.min((reportsPage + 1) * reportsPerPage, reports.data.total)} of{" "}
                      {reports.data.total}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={reportsPage === 0}
                        onClick={() => setReportsPage((p) => p - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={(reportsPage + 1) * reportsPerPage >= reports.data.total}
                        onClick={() => setReportsPage((p) => p + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ============ IP BLOCKLIST ============ */}
      <motion.div variants={staggerItem}>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-orange-500" />
              IP Blocklist
            </CardTitle>
            <CardDescription>Blocked IPs cannot upload via /send</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Inline ban form */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="IP address"
                value={banIpInput}
                onChange={(e) => setBanIpInput(e.target.value)}
                className="sm:w-40"
              />
              <Input
                placeholder="Reason"
                value={banReasonInput}
                onChange={(e) => setBanReasonInput(e.target.value)}
                className="flex-1"
              />
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground whitespace-nowrap cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={banPermanent}
                  onChange={(e) => setBanPermanent(e.target.checked)}
                  className="rounded"
                />
                Permanent
              </label>
              <Button
                onClick={handleBanIp}
                disabled={!banIpInput.trim() || !banReasonInput.trim() || banMutation.isPending}
                size="sm"
              >
                {banMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" />
                    Block
                  </>
                )}
              </Button>
            </div>

            {/* Blocked IPs table */}
            {blockedIps.isLoading ? (
              <Skeleton className="h-32" />
            ) : !blockedIps.data?.entries.length ? (
              <div className="text-center py-6 text-muted-foreground">
                No blocked IPs
              </div>
            ) : (
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Blocked At</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedIps.data.entries.map((entry) => (
                      <TableRow key={entry.ip}>
                        <TableCell className="font-mono text-sm">{entry.ip}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{entry.reason}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(entry.blockedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={entry.blockedBy === "auto" ? "secondary" : "default"}>
                            {entry.blockedBy}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Unban"
                            disabled={unbanMutation.isPending}
                            onClick={() => unbanMutation.mutate({ ip: entry.ip })}
                          >
                            <ShieldOff className="h-4 w-4 text-green-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ============ Sub-Components ============

function StatCard({
  label,
  value,
  icon,
  isString,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  isString?: boolean;
}) {
  return (
    <div className="p-4 rounded-lg bg-muted/50 border border-border/30">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-semibold">
        {isString ? value : Number(value).toLocaleString()}
      </div>
    </div>
  );
}

function ReasonBadge({ reason }: { reason: string }) {
  const variants: Record<string, string> = {
    malware: "bg-red-500/10 text-red-500 border-red-500/20",
    phishing: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    illegal_content: "bg-rose-500/10 text-rose-500 border-rose-500/20",
    copyright: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    other: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
        variants[reason] ?? variants.other
      }`}
    >
      {reason.replace("_", " ")}
    </span>
  );
}
