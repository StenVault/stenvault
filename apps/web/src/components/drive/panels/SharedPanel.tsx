/**
 * SharedPanel — Shared filter view inside Drive.
 *
 * Lists every share link the user owns (active, expired, revoked) and lets
 * them copy / renew / revoke. The data domain is share links, not files —
 * so the row layout differs from Favorites/Trash; the empty-state shape and
 * tone match.
 */

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    Copy,
    FileAudio,
    FileIcon,
    FileImage,
    FileText,
    FileVideo,
    Loader2,
    RefreshCw,
    Share2,
    Trash2,
    XCircle,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from '@stenvault/shared/lib/toast';
import { type FileType } from '@stenvault/shared';
import { formatBytes } from '@/utils/formatters';
import { Badge } from '@stenvault/shared/ui/badge';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@stenvault/shared/ui/select';
import { FadeIn } from '@stenvault/shared/ui/animated';
import { PageLoading } from '@/components/ui/page-loading';
import { useFilenameDecryption } from '@/hooks/useFilenameDecryption';
import type { FileItem } from '@/components/files/types';
import { DriveFilterEmpty } from './DriveFilterEmpty';

function getFileIcon(fileType: FileType) {
    // File type is signalled by the icon glyph; colour stays neutral so
    // the share list reads consistently with FavoritesPanel/TrashPanel.
    const className = 'w-5 h-5 text-muted-foreground';
    switch (fileType) {
        case 'image': return <FileImage className={className} />;
        case 'video': return <FileVideo className={className} />;
        case 'audio': return <FileAudio className={className} />;
        case 'document': return <FileText className={className} />;
        default: return <FileIcon className={className} />;
    }
}

export function SharedPanel() {
    const utils = trpc.useUtils();
    const [revokeDialog, setRevokeDialog] = useState<{ open: boolean; shareId: number | null }>({
        open: false,
        shareId: null,
    });
    const [extendDialog, setExtendDialog] = useState<{ open: boolean; shareId: number | null }>({
        open: false,
        shareId: null,
    });
    const [newExpiration, setNewExpiration] = useState<'1h' | '24h' | '7d' | '30d' | 'never'>('7d');

    const { data: shares = [], isLoading } = trpc.shares.listMyShares.useQuery({
        includeExpired: true,
        includeRevoked: true,
    });

    const { getDisplayName, decryptFilenames } = useFilenameDecryption();
    const shareFiles = useMemo(
        () => shares.map((s) => s.file as unknown as FileItem).filter((f) => f.encryptedFilename),
        [shares],
    );
    useEffect(() => {
        if (shareFiles.length > 0) {
            decryptFilenames(shareFiles);
        }
    }, [shareFiles, decryptFilenames]);

    const revokeMutation = trpc.shares.revokeShare.useMutation({
        onSuccess: () => {
            toast.success('Share revoked');
            utils.shares.listMyShares.invalidate();
            utils.shares.getShareStats.invalidate();
            setRevokeDialog({ open: false, shareId: null });
        },
        onError: (error) => toast.error(error.message),
    });

    const updateMutation = trpc.shares.updateShare.useMutation({
        onSuccess: () => {
            toast.success('Share updated');
            utils.shares.listMyShares.invalidate();
            setExtendDialog({ open: false, shareId: null });
        },
        onError: (error) => toast.error(error.message),
    });

    const handleCopyLink = (link: string) => {
        navigator.clipboard.writeText(link);
        toast.success('Link copied');
    };

    const handleRevoke = () => {
        if (revokeDialog.shareId) {
            revokeMutation.mutate({ shareId: revokeDialog.shareId });
        }
    };

    const handleExtend = () => {
        if (extendDialog.shareId) {
            updateMutation.mutate({
                shareId: extendDialog.shareId,
                expiration: newExpiration,
            });
        }
    };

    const getShareStatus = (share: typeof shares[0]) => {
        if (share.isRevoked) return { label: 'Revoked', variant: 'destructive' as const, icon: XCircle };
        if (share.isExpired) return { label: 'Expired', variant: 'secondary' as const, icon: Clock };
        if (share.isLimitReached) return { label: 'Limit reached', variant: 'secondary' as const, icon: AlertTriangle };
        return { label: 'Active', variant: 'default' as const, icon: CheckCircle2 };
    };

    if (isLoading) return <PageLoading />;

    if (shares.length === 0) {
        return (
            <DriveFilterEmpty
                icon={Share2}
                title="No active shares."
                body="Create a share link from any file."
            />
        );
    }

    return (
        <>
            <FadeIn className="flex-1 min-h-0">
                <AuroraCard variant="default">
                    <AuroraCardContent>
                        <div className="space-y-4">
                            {shares.map((share) => {
                                const status = getShareStatus(share);
                                const StatusIcon = status.icon;
                                const isActive = !share.isRevoked && !share.isExpired && !share.isLimitReached;

                                return (
                                    <div
                                        key={share.id}
                                        className={`p-4 rounded-sm border ${isActive ? 'bg-card' : 'bg-muted/30 opacity-75'}`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                                {getFileIcon(share.file.fileType as FileType)}
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-medium truncate">
                                                        {getDisplayName(share.file as unknown as FileItem)}
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {share.recipientEmail} • {formatBytes(share.file.size)}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                        <Badge variant={status.variant} className="gap-1">
                                                            <StatusIcon className="w-3 h-3" />
                                                            {status.label}
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground">
                                                            {share.downloadCount} downloads
                                                            {share.maxDownloads && ` / ${share.maxDownloads}`}
                                                        </span>
                                                        {share.expiresAt && (
                                                            <span className="text-xs text-muted-foreground">
                                                                • Expires {format(new Date(share.expiresAt), "MMM d, yyyy 'at' HH:mm")}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {isActive && (
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleCopyLink(share.downloadLink)}
                                                        title="Copy link"
                                                    >
                                                        <Copy className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setExtendDialog({ open: true, shareId: share.id })}
                                                        title="Renew"
                                                    >
                                                        <RefreshCw className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => setRevokeDialog({ open: true, shareId: share.id })}
                                                        title="Revoke"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </AuroraCardContent>
                </AuroraCard>
            </FadeIn>

            <Dialog
                open={revokeDialog.open}
                onOpenChange={(open) => setRevokeDialog({ ...revokeDialog, open })}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Revoke share</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to revoke this share? The link will stop working immediately.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRevokeDialog({ open: false, shareId: null })}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleRevoke}
                            disabled={revokeMutation.isPending}
                        >
                            {revokeMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Revoke
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={extendDialog.open}
                onOpenChange={(open) => setExtendDialog({ ...extendDialog, open })}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Renew share</DialogTitle>
                        <DialogDescription>
                            Extend the expiration time for this share.
                        </DialogDescription>
                    </DialogHeader>
                    <Select value={newExpiration} onValueChange={(v: any) => setNewExpiration(v)}>
                        <SelectTrigger>
                            <SelectValue placeholder="New expiration" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1h">1 hour</SelectItem>
                            <SelectItem value="24h">24 hours</SelectItem>
                            <SelectItem value="7d">7 days</SelectItem>
                            <SelectItem value="30d">30 days</SelectItem>
                            <SelectItem value="never">No expiration</SelectItem>
                        </SelectContent>
                    </Select>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setExtendDialog({ open: false, shareId: null })}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleExtend}
                            disabled={updateMutation.isPending}
                        >
                            {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Renew
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
