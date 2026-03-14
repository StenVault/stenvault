import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Download, Calendar, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format as formatDate, subDays, subMonths } from "date-fns";

type ExportFormat = "csv" | "pdf";

export function AuditExport() {
    const [format, setFormat] = useState<ExportFormat>("csv");
    const [dateRange, setDateRange] = useState("30days");
    const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 30));
    const [endDate, setEndDate] = useState<Date>(new Date());

    // Export audit logs mutation
    const exportMutation = trpc.admin.exportAuditLogs.useMutation({
        onSuccess: (data) => {
            // Convert base64 to blob and download
            const binaryString = atob(data.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], {
                type: format === "csv" ? "text/csv" : "text/html",
            });

            // Create download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = data.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success(`${format.toUpperCase()} export completed!`);
        },
        onError: (error) => {
            toast.error(`Export error: ${error.message}`);
        },
    });

    const handleQuickRange = (range: string) => {
        setDateRange(range);
        const now = new Date();

        switch (range) {
            case "7days":
                setStartDate(subDays(now, 7));
                setEndDate(now);
                break;
            case "30days":
                setStartDate(subDays(now, 30));
                setEndDate(now);
                break;
            case "3months":
                setStartDate(subMonths(now, 3));
                setEndDate(now);
                break;
        }
    };

    const handleExport = () => {
        exportMutation.mutate({
            format,
            startDate,
            endDate,
            userId: null, // All users (admin export)
        });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Export Audit Logs
                </CardTitle>
                <CardDescription>
                    Export audit logs for compliance and reporting
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Quick Date Ranges */}
                <div>
                    <Label className="mb-3 block">Date Range</Label>
                    <Select value={dateRange} onValueChange={handleQuickRange}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7days">Last 7 days</SelectItem>
                            <SelectItem value="30days">Last 30 days</SelectItem>
                            <SelectItem value="3months">Last 3 months</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-2">
                        <Calendar className="w-3 h-3 inline mr-1" />
                        {formatDate(startDate, "yyyy-MM-dd")} to {formatDate(endDate, "yyyy-MM-dd")}
                    </p>
                </div>

                {/* Export Format */}
                <div>
                    <Label className="mb-3 block">Export Format</Label>
                    <RadioGroup value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                        <div className="flex items-start space-x-3 space-y-0 rounded-lg border p-4 hover:bg-accent/50 transition-colors">
                            <RadioGroupItem value="csv" id="csv" />
                            <div className="flex-1">
                                <Label htmlFor="csv" className="font-normal cursor-pointer">
                                    <div className="font-medium">CSV (Excel)</div>
                                    <p className="text-sm text-muted-foreground">
                                        Tabular format, ideal for spreadsheet analysis
                                    </p>
                                </Label>
                            </div>
                        </div>

                        <div className="flex items-start space-x-3 space-y-0 rounded-lg border p-4 hover:bg-accent/50 transition-colors">
                            <RadioGroupItem value="pdf" id="pdf" />
                            <div className="flex-1">
                                <Label htmlFor="pdf" className="font-normal cursor-pointer">
                                    <div className="font-medium">PDF/HTML (Report)</div>
                                    <p className="text-sm text-muted-foreground">
                                        Formatted and readable report format
                                    </p>
                                </Label>
                            </div>
                        </div>
                    </RadioGroup>
                </div>

                {/* Export Button */}
                <Button
                    onClick={handleExport}
                    disabled={exportMutation.isPending}
                    className="w-full gap-2"
                    size="lg"
                >
                    {exportMutation.isPending ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Exporting...
                        </>
                    ) : (
                        <>
                            <Download className="w-4 h-4" />
                            Export Audit Logs
                        </>
                    )}
                </Button>

                {/* Info Box */}
                <div className="rounded-lg bg-muted/50 p-4 text-sm">
                    <p className="text-muted-foreground">
                        <strong className="text-foreground">Note:</strong> The export will include all audit logs
                        from the selected period for all system users. Use this feature for compliance,
                        security audits, and activity analysis.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
