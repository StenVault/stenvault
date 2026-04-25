/**
 * DataExportDialog
 *
 * Self-service GDPR Art. 20 export UI. Renders five visual stages driven by the
 * `useDataExport` hook's `state.phase`:
 *
 *   idle        → preview (totals + Start)
 *   enumerating → spinner ("Counting your files...")
 *   preparing   → spinner ("Preparing names...")
 *   exporting   → progress bar + Cancel
 *   complete    → summary + Close (fires onExportComplete for pre-delete flow)
 *   error       → message + Try again / Close
 *
 * The dialog cannot be dismissed while an export is in flight.
 */

import { useEffect, useState } from "react";
import { Button } from "@stenvault/shared/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@stenvault/shared/ui/dialog";
import { Progress } from "@stenvault/shared/ui/progress";
import { Loader2, Lock, AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatBytes } from "@/utils/formatters";
import { useDataExport } from "@/hooks/useDataExport";
import { cn } from "@stenvault/shared/utils";

export interface DataExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** When true, the dialog copy nudges the user toward the next step (delete account) */
    preDelete?: boolean;
    /** Called once when export finishes successfully — used by DeleteAccountDialog */
    onExportComplete?: () => void;
}

export function DataExportDialog({
    open,
    onOpenChange,
    preDelete = false,
    onExportComplete,
}: DataExportDialogProps) {
    const { state, startExport, abort } = useDataExport();

    // Cheap preview: first page (limit=1) returns totalFiles + totalSize without
    // pulling the whole vault. Only enabled when the dialog is open.
    const preview = trpc.files.listForExport.useQuery(
        { limit: 1 },
        { enabled: open && state.phase === "idle", refetchOnWindowFocus: false, retry: false },
    );

    // Fire onExportComplete once when phase transitions to 'complete'
    const [completionFired, setCompletionFired] = useState(false);
    useEffect(() => {
        if (state.phase === "complete" && !completionFired) {
            onExportComplete?.();
            setCompletionFired(true);
        }
        if (state.phase === "idle") {
            setCompletionFired(false);
        }
    }, [state.phase, completionFired, onExportComplete]);

    const isExporting =
        state.phase === "enumerating" ||
        state.phase === "preparing" ||
        state.phase === "exporting";

    const handleOpenChange = (next: boolean) => {
        if (!next && isExporting) return; // block close mid-export
        onOpenChange(next);
    };

    const previewTotalFiles = preview.data?.totalFiles ?? 0;
    const previewTotalBytes = preview.data?.totalSize ? safeBigInt(preview.data.totalSize) : 0n;

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Download className="w-5 h-5 text-[var(--theme-primary)]" />
                        Export your vault
                    </DialogTitle>
                    <DialogDescription>
                        {preDelete
                            ? "Download a copy of your data before deleting your account."
                            : "Download every file in your vault as a single ZIP archive."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {state.phase === "idle" && (
                        <div className="rounded-lg border border-[var(--theme-primary)]/20 bg-[var(--theme-primary)]/10 p-4 space-y-3">
                            <div className="flex items-center gap-2 text-sm">
                                <Lock className="w-4 h-4 text-[var(--theme-primary)]" />
                                <span className="text-foreground">
                                    Files are decrypted by your browser, never on our servers.
                                </span>
                            </div>
                            {preview.isLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Counting your files...
                                </div>
                            ) : preview.data ? (
                                <p className="text-sm text-muted-foreground">
                                    {previewTotalFiles === 0 ? (
                                        "Your vault is empty — nothing to export."
                                    ) : (
                                        <>
                                            <strong className="text-foreground">{previewTotalFiles.toLocaleString()}</strong>{" "}
                                            file{previewTotalFiles !== 1 ? "s" : ""} ·{" "}
                                            <strong className="text-foreground">{formatBytes(Number(previewTotalBytes))}</strong>
                                        </>
                                    )}
                                </p>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Click Start to count your files.
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground/80">
                                The ZIP includes <code className="font-mono text-xs">account.json</code> with your profile, storage, and organization metadata. Folder structure is preserved.
                            </p>
                        </div>
                    )}

                    {(state.phase === "enumerating" || state.phase === "preparing") && (
                        <div className="flex flex-col items-center justify-center py-6 gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-[var(--theme-primary)]" />
                            <p className="text-sm text-muted-foreground">
                                {state.phase === "enumerating"
                                    ? "Counting your files..."
                                    : "Preparing your export..."}
                            </p>
                        </div>
                    )}

                    {state.phase === "exporting" && (
                        <div className="space-y-3">
                            <Progress
                                value={state.progress}
                                variant="premium"
                                size="lg"
                                animated
                                glow
                            />
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-foreground">
                                    <strong>{state.completedFiles.toLocaleString()}</strong> of{" "}
                                    <strong>{state.totalFiles.toLocaleString()}</strong> files
                                </span>
                                <span className="text-muted-foreground tabular-nums">
                                    {state.progress}%
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Lock className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
                                Decrypting locally · {formatBytes(Number(state.totalBytes))} total
                            </div>
                        </div>
                    )}

                    {state.phase === "complete" && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-[var(--theme-success)]">
                                <CheckCircle2 className="w-5 h-5" />
                                <span className="font-medium">Export complete</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {state.totalFiles.toLocaleString()} file{state.totalFiles !== 1 ? "s" : ""} exported
                                {state.failedFileNames.length > 0 && (
                                    <>
                                        {" · "}
                                        <strong className="text-[var(--theme-warning)]">
                                            {state.failedFileNames.length} skipped
                                        </strong>
                                    </>
                                )}
                                .
                            </p>
                            {state.failedFileNames.length > 0 && (
                                <details className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs">
                                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                        See skipped files ({state.failedFileNames.length})
                                    </summary>
                                    <ul className="mt-2 max-h-40 overflow-y-auto space-y-1">
                                        {state.failedFileNames.map((name, i) => (
                                            <li key={i} className="font-mono text-muted-foreground truncate">
                                                {name}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                            {preDelete && (
                                <p className="text-sm text-muted-foreground">
                                    You can now safely close this dialog and continue with account deletion.
                                </p>
                            )}
                        </div>
                    )}

                    {state.phase === "error" && (
                        <div className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                            <div className="flex items-center gap-2 text-destructive">
                                <AlertTriangle className="w-5 h-5" />
                                <span className="font-medium">Export failed</span>
                            </div>
                            <p className="text-sm text-muted-foreground break-words">
                                {state.error ?? "An unexpected error occurred."}
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className={cn("gap-2 sm:gap-2")}>
                    {state.phase === "idle" && (
                        <>
                            <Button variant="outline" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() => { void startExport(); }}
                                disabled={preview.isLoading || previewTotalFiles === 0}
                            >
                                Start Export
                            </Button>
                        </>
                    )}

                    {(state.phase === "enumerating" || state.phase === "preparing") && (
                        <Button variant="outline" onClick={abort}>
                            Cancel
                        </Button>
                    )}

                    {state.phase === "exporting" && (
                        <Button variant="outline" onClick={abort}>
                            Cancel Export
                        </Button>
                    )}

                    {state.phase === "complete" && (
                        <Button onClick={() => onOpenChange(false)}>Close</Button>
                    )}

                    {state.phase === "error" && (
                        <>
                            <Button variant="outline" onClick={() => onOpenChange(false)}>
                                Close
                            </Button>
                            <Button onClick={() => { void startExport(); }}>
                                Try again
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function safeBigInt(v: string): bigint {
    try { return BigInt(v); } catch { return 0n; }
}
