import { Button } from "@stenvault/shared/ui/button";
import { AuroraCard } from "@stenvault/shared/ui/aurora-card";
import { Separator } from "@/components/ui/separator";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@stenvault/shared/ui/alert-dialog";
import { Loader2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "@stenvault/shared/lib/toast";
import { useState } from "react";
import { formatBytes } from "@/utils/formatters";
import type { StorageStats } from "@/types/settings";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Props for the StorageSettings component
 */
interface StorageSettingsProps {
    /** Storage statistics (undefined while loading) */
    storageStats: StorageStats | undefined;
    /** Callback to refetch storage stats after operations */
    refetchStorage: () => void;
}

/**
 * StorageSettings Component
 *
 * Storage usage visualisation + Empty Trash. The Export Vault card moved
 * to DataExportSection (Account / Profile) because export is a data-
 * portability concern, not a billing one — see DataExportSection for the
 * rationale.
 *
 * @component
 */
export function StorageSettings({ storageStats, refetchStorage }: StorageSettingsProps) {
    const { theme } = useTheme();
    const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const emptyTrashMutation = trpc.files.emptyTrash.useMutation();
    const { data: trashItems } = trpc.files.listDeleted.useQuery();

    const handleEmptyTrash = async () => {
        setConfirmOpen(false);
        setIsEmptyingTrash(true);
        try {
            const result = await emptyTrashMutation.mutateAsync();
            toast.success(result.message);
            refetchStorage();
        } catch (error: any) {
            toast.error("Error emptying trash");
        } finally {
            setIsEmptyingTrash(false);
        }
    };

    // Loading state
    if (!storageStats) {
        return (
            <AuroraCard variant="default">
                <div className="py-6 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Loading storage statistics...</p>
                    </div>
                </div>
            </AuroraCard>
        );
    }

    return (
        <>
            <AuroraCard variant="default">
                <div className="mb-4">
                    <h3 className="font-semibold text-foreground">Storage</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">Manage your disk space</p>
                </div>
                <div className="space-y-6">
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>{Math.min(100, storageStats?.percentUsed || 0)}% Used</span>
                            <span>{formatBytes(storageStats?.storageUsed || 0)} of {formatBytes(storageStats?.storageQuota || 0)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--theme-bg-elevated)] overflow-hidden">
                            <div
                                className="h-full transition-all duration-500"
                                style={{
                                    width: `${Math.min(100, storageStats?.percentUsed || 0)}%`,
                                    background: `linear-gradient(to right, ${theme.brand.primary}, ${theme.brand.secondary})`
                                }}
                            />
                        </div>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between p-4 rounded-lg border border-[var(--theme-error)]/20 bg-[var(--theme-error)]/10">
                        <div className="flex items-center gap-3">
                            <Trash2 className="w-5 h-5 text-[var(--theme-error)]" />
                            <div>
                                <p className="font-medium text-[var(--theme-error)]">Empty Trash</p>
                                <p className="text-sm text-[var(--theme-error)]/80">
                                    Permanently remove deleted files
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setConfirmOpen(true)}
                            disabled={isEmptyingTrash}
                        >
                            {isEmptyingTrash ? "Emptying..." : "Empty Now"}
                        </Button>
                    </div>
                </div>
            </AuroraCard>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Empty Trash</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure? This will permanently delete {trashItems?.length ? `${trashItems.length} file${trashItems.length !== 1 ? 's' : ''} (${formatBytes(trashItems.reduce((sum, f) => sum + (f.size || 0), 0))})` : 'all files'} in your trash. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleEmptyTrash}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            Empty Trash
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
