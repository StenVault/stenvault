/**
 * TrashPanel — Trash filter view inside Drive.
 *
 * Owns its own restore / permanent-delete / empty-trash dialogs. Drive does
 * not surface those actions in the chrome — they live next to the list they
 * act on. Trash retention is server-side; the panel just reflects the count
 * and the per-row "X days left" countdown.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Clock,
    File,
    FileText,
    Image,
    Music,
    RotateCcw,
    Trash2,
    Video,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useCurrentOrgId } from '@/contexts/OrganizationContext';
import { toast } from '@stenvault/shared/lib/toast';
import { formatBytes } from '@stenvault/shared';
import { Button } from '@stenvault/shared/ui/button';
import { AuroraCard, AuroraCardContent } from '@stenvault/shared/ui/aurora-card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@stenvault/shared/ui/dialog';
import { FadeIn } from '@stenvault/shared/ui/animated';
import { PageLoading } from '@/components/ui/page-loading';
import { useFilenameDecryption } from '@/hooks/useFilenameDecryption';
import type { FileItem } from '@/components/files/types';
import { DriveFilterEmpty } from './DriveFilterEmpty';

interface TrashFileItem extends FileItem {
    deletedAt: Date | string;
    daysUntilPermanentDeletion: number;
}

function getFileTypeIcon(fileType: string) {
    switch (fileType) {
        case 'image': return Image;
        case 'video': return Video;
        case 'audio': return Music;
        case 'document': return FileText;
        default: return File;
    }
}

function formatDeletedDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TrashPanel() {
    const utils = trpc.useUtils();
    const orgId = useCurrentOrgId();

    const [confirmEmpty, setConfirmEmpty] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

    const { data: deletedFiles, isLoading } = trpc.files.listDeleted.useQuery({
        organizationId: orgId,
    });

    const { getDisplayName, decryptFilenames } = useFilenameDecryption();
    const [decryptedFiles, setDecryptedFiles] = useState<TrashFileItem[]>([]);
    const rawFiles = useMemo(() => deletedFiles ?? [], [deletedFiles]);

    useEffect(() => {
        if (rawFiles.length > 0) {
            decryptFilenames(rawFiles as TrashFileItem[]).then(
                (result) => setDecryptedFiles(result as TrashFileItem[]),
            );
        } else {
            setDecryptedFiles((prev) => (prev.length === 0 ? prev : []));
        }
    }, [rawFiles, decryptFilenames]);

    const restoreMutation = trpc.files.restore.useMutation({
        onSuccess: () => {
            toast.success('File restored');
            utils.files.listDeleted.invalidate();
            utils.files.list.invalidate();
            utils.files.getStorageStats.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    const permanentDeleteMutation = trpc.files.permanentDelete.useMutation({
        onSuccess: () => {
            toast.success('File permanently deleted');
            setDeleteTarget(null);
            utils.files.listDeleted.invalidate();
            utils.files.getStorageStats.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    const emptyTrashMutation = trpc.files.emptyTrash.useMutation({
        onSuccess: (data) => {
            toast.success(`Permanently deleted ${data.deletedCount} file(s)`);
            setConfirmEmpty(false);
            utils.files.listDeleted.invalidate();
            utils.files.getStorageStats.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    const handleRestore = useCallback((fileId: number) => {
        restoreMutation.mutate({ fileId });
    }, [restoreMutation]);

    const handlePermanentDelete = useCallback(() => {
        if (deleteTarget !== null) {
            permanentDeleteMutation.mutate({ fileId: deleteTarget });
        }
    }, [deleteTarget, permanentDeleteMutation]);

    const handleEmptyTrash = useCallback(() => {
        emptyTrashMutation.mutate({ organizationId: orgId });
    }, [emptyTrashMutation, orgId]);

    if (isLoading) return <PageLoading />;

    if (decryptedFiles.length === 0) {
        return (
            <DriveFilterEmpty
                icon={Trash2}
                title="Trash is empty."
                body="Nothing to restore."
            />
        );
    }

    const totalSize = decryptedFiles.reduce((sum, f) => sum + (f.size || 0), 0);

    return (
        <>
            <FadeIn className="flex-1 min-h-0 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                        {decryptedFiles.length} file{decryptedFiles.length !== 1 ? 's' : ''} &middot; {formatBytes(totalSize)}
                    </p>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmEmpty(true)}
                        className="text-destructive hover:text-destructive"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Empty trash
                    </Button>
                </div>

                <AuroraCard variant="glass">
                    <AuroraCardContent className="p-0">
                        <div className="divide-y divide-border">
                            {decryptedFiles.map((file) => {
                                const Icon = getFileTypeIcon(file.fileType);
                                const isUrgent = file.daysUntilPermanentDeletion <= 7;
                                return (
                                    <div
                                        key={file.id}
                                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                                    >
                                        <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{getDisplayName(file)}</p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span>{formatBytes(file.size)}</span>
                                                {file.deletedAt && (
                                                    <>
                                                        <span>&middot;</span>
                                                        <span>Deleted {formatDeletedDate(file.deletedAt)}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className={`hidden sm:flex items-center gap-1 text-xs shrink-0 ${isUrgent ? 'text-destructive' : 'text-muted-foreground'}`}>
                                            {isUrgent ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                            <span>{file.daysUntilPermanentDeletion}d left</span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRestore(file.id)}
                                                disabled={restoreMutation.isPending}
                                                title="Restore"
                                            >
                                                <RotateCcw className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setDeleteTarget(file.id)}
                                                className="text-destructive hover:text-destructive"
                                                title="Delete permanently"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </AuroraCardContent>
                </AuroraCard>
            </FadeIn>

            <Dialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Empty trash?</DialogTitle>
                        <DialogDescription>
                            This will permanently delete {decryptedFiles.length} file{decryptedFiles.length !== 1 ? 's' : ''} ({formatBytes(totalSize)}).
                            This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmEmpty(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleEmptyTrash}
                            disabled={emptyTrashMutation.isPending}
                        >
                            {emptyTrashMutation.isPending ? 'Deleting...' : 'Empty trash'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Permanently delete?</DialogTitle>
                        <DialogDescription>
                            This file will be permanently deleted and cannot be recovered.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handlePermanentDelete}
                            disabled={permanentDeleteMutation.isPending}
                        >
                            {permanentDeleteMutation.isPending ? 'Deleting...' : 'Delete forever'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
