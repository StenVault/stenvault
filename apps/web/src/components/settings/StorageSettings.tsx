import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/components/ui/alert-dialog";
import { Loader2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
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
 * Displays user storage usage with a visual progress bar and provides
 * functionality to permanently delete trashed files.
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
            <Card>
                <CardContent className="py-12 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Loading storage statistics...</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Storage</CardTitle>
                    <CardDescription>Manage your disk space</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>{Math.min(100, storageStats?.percentUsed || 0)}% Used</span>
                            <span>{formatBytes(storageStats?.storageUsed || 0)} of {formatBytes(storageStats?.storageQuota || 0)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
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

                    <div className="flex items-center justify-between p-4 rounded-lg border border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10">
                        <div className="flex items-center gap-3">
                            <Trash2 className="w-5 h-5 text-red-500" />
                            <div>
                                <p className="font-medium text-red-700 dark:text-red-400">Empty Trash</p>
                                <p className="text-sm text-red-600/80 dark:text-red-400/70">
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
                </CardContent>
            </Card>

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
