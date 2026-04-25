/**
 * FileVersionHistory Component
 * 
 * Displays version history for a file and allows restoring previous versions.
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@stenvault/shared/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@stenvault/shared/ui/dialog';
import { ScrollArea } from '@stenvault/shared/ui/scroll-area';
import {
    History,
    Download,
    RotateCcw,
    Trash2,
    Loader2,
    Clock,
    HardDrive,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@stenvault/shared/lib/toast';
import { cn } from '@stenvault/shared/utils';
import { formatBytes } from '@/utils/formatters';

interface FileVersionHistoryProps {
    fileId: number;
    filename: string;
    open: boolean;
    onClose: () => void;
}

export function FileVersionHistory({
    fileId,
    filename,
    open,
    onClose,
}: FileVersionHistoryProps) {
    const utils = trpc.useUtils();
    const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

    // Query versions
    const { data, isLoading, error } = trpc.files.listVersions.useQuery(
        { fileId },
        { enabled: open }
    );

    // Mutations
    const restoreVersion = trpc.files.restoreVersion.useMutation({
        onSuccess: (result) => {
            toast.success(`Restored to version ${result.restoredVersion}`);
            utils.files.listVersions.invalidate({ fileId });
            utils.files.list.invalidate();
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const deleteVersion = trpc.files.deleteVersion.useMutation({
        onSuccess: () => {
            toast.success('Version deleted');
            utils.files.listVersions.invalidate({ fileId });
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const getVersionUrl = trpc.files.getVersionDownloadUrl.useQuery(
        { versionId: selectedVersion! },
        { enabled: !!selectedVersion }
    );

    const handleDownloadVersion = async (versionId: number) => {
        setSelectedVersion(versionId);
    };

    // Effect to handle download when URL is available
    if (getVersionUrl.data && selectedVersion) {
        const link = document.createElement('a');
        link.href = getVersionUrl.data.url;
        link.download = `${filename}_v${selectedVersion}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setSelectedVersion(null);
    }

    const handleRestore = (versionId: number) => {
        if (confirm('This will restore the file to this version. The current version will be saved as a new version. Continue?')) {
            restoreVersion.mutate({ fileId, versionId });
        }
    };

    const handleDelete = (versionId: number) => {
        if (confirm('Delete this version permanently? This cannot be undone.')) {
            deleteVersion.mutate({ versionId });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="w-5 h-5" />
                        Version History
                    </DialogTitle>
                    <DialogDescription>
                        {filename} • {data?.versions.length || 0} previous versions
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[400px]">
                    {isLoading && (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-8 text-destructive">
                            Failed to load versions: {error.message}
                        </div>
                    )}

                    {data && data.versions.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>No previous versions</p>
                            <p className="text-sm mt-1">
                                Versions are created when you upload a new file with the same name
                            </p>
                        </div>
                    )}

                    {data && data.versions.length > 0 && (
                        <div className="space-y-2">
                            {/* Current Version (not in list) */}
                            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="font-medium">Current Version (v{data.currentVersion})</span>
                                        <p className="text-sm text-muted-foreground">Active version</p>
                                    </div>
                                    <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                                        Latest
                                    </span>
                                </div>
                            </div>

                            {/* Previous Versions */}
                            {data.versions.map((version) => (
                                <div
                                    key={version.id}
                                    className={cn(
                                        "p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors",
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">Version {version.versionNumber}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <HardDrive className="w-3 h-3" />
                                                    {formatBytes(version.size)}
                                                </span>
                                            </div>
                                            {version.comment && (
                                                <p className="text-sm text-muted-foreground mt-1 italic">
                                                    "{version.comment}"
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDownloadVersion(version.id)}
                                                disabled={getVersionUrl.isLoading && selectedVersion === version.id}
                                                title="Download this version"
                                            >
                                                {getVersionUrl.isLoading && selectedVersion === version.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Download className="w-4 h-4" />
                                                )}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRestore(version.id)}
                                                disabled={restoreVersion.isPending}
                                                title="Restore to this version"
                                            >
                                                {restoreVersion.isPending ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <RotateCcw className="w-4 h-4" />
                                                )}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDelete(version.id)}
                                                disabled={deleteVersion.isPending}
                                                className="text-destructive hover:text-destructive"
                                                title="Delete this version"
                                            >
                                                {deleteVersion.isPending ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
