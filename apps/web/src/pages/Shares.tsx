/**
 * Shares Page - File Sharing Management
 * Enhanced with Aurora Design System for premium aesthetics.
 */
import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/useMobile';
import { MobileShares } from '@/components/mobile-v2/pages/MobileShares';
import { trpc } from '@/lib/trpc';
import { useFilenameDecryption } from '@/hooks/useFilenameDecryption';
import type { FileItem } from '@/components/files/types';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuroraCard, AuroraCardContent, AuroraCardHeader } from '@/components/ui/aurora-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageLoading } from '@/components/ui/page-loading';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { FadeIn, StaggerContainer, StaggerItem } from '@/components/ui/animated';
import {
    Share2,
    Link2,
    Copy,
    Trash2,
    Clock,
    Download,
    RefreshCw,
    Loader2,
    FileIcon,
    FileText,
    FileImage,
    FileVideo,
    FileAudio,
    AlertTriangle,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { useTheme } from '@/contexts/ThemeContext';
import { type FileType } from '@cloudvault/shared';
import { formatBytes } from '@/utils/formatters';

function getFileIcon(fileType: FileType) {
    switch (fileType) {
        case 'image': return <FileImage className="w-5 h-5 text-green-500" />;
        case 'video': return <FileVideo className="w-5 h-5 text-purple-500" />;
        case 'audio': return <FileAudio className="w-5 h-5 text-orange-500" />;
        case 'document': return <FileText className="w-5 h-5 text-blue-500" />;
        default: return <FileIcon className="w-5 h-5 text-gray-500" />;
    }
}

export default function Shares() {
    const isMobile = useIsMobile();
    const { theme } = useTheme();
    const [revokeDialog, setRevokeDialog] = useState<{ open: boolean; shareId: number | null }>({
        open: false,
        shareId: null,
    });
    const [extendDialog, setExtendDialog] = useState<{ open: boolean; shareId: number | null }>({
        open: false,
        shareId: null,
    });
    const [newExpiration, setNewExpiration] = useState<'1h' | '24h' | '7d' | '30d' | 'never'>('7d');

    const utils = trpc.useUtils();

    const { data: shares = [], isLoading } = trpc.shares.listMyShares.useQuery({
        includeExpired: true,
        includeRevoked: true,
    });

    const { data: stats } = trpc.shares.getShareStats.useQuery();

    // Decrypt filenames for display (owner has Master Key)
    const { getDisplayName, decryptFilenames } = useFilenameDecryption();
    const shareFiles = useMemo(
        () => shares.map(s => s.file as unknown as FileItem).filter(f => f.encryptedFilename),
        [shares]
    );
    useEffect(() => {
        if (shareFiles.length > 0) {
            decryptFilenames(shareFiles);
        }
    }, [shareFiles, decryptFilenames]);

    const getShareFilename = (file: typeof shares[0]['file']) => {
        return getDisplayName(file as unknown as FileItem);
    };

    const revokeMutation = trpc.shares.revokeShare.useMutation({
        onSuccess: () => {
            toast.success('Share revoked');
            utils.shares.listMyShares.invalidate();
            utils.shares.getShareStats.invalidate();
            setRevokeDialog({ open: false, shareId: null });
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const updateMutation = trpc.shares.updateShare.useMutation({
        onSuccess: () => {
            toast.success('Share updated');
            utils.shares.listMyShares.invalidate();
            setExtendDialog({ open: false, shareId: null });
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    if (isMobile) return <MobileShares />;

    const handleCopyLink = (link: string) => {
        navigator.clipboard.writeText(link);
        toast.success('Link copied!');
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
        if (share.isRevoked) {
            return { label: 'Revoked', variant: 'destructive' as const, icon: XCircle };
        }
        if (share.isExpired) {
            return { label: 'Expired', variant: 'secondary' as const, icon: Clock };
        }
        if (share.isLimitReached) {
            return { label: 'Limit reached', variant: 'secondary' as const, icon: AlertTriangle };
        }
        return { label: 'Active', variant: 'default' as const, icon: CheckCircle2 };
    };

    return (
        <>
            <div className="space-y-8">
                {/* Header */}
                <FadeIn>
                    <AuroraCard variant="glass" className="relative overflow-hidden">
                        {/* Theme glow decoration */}
                        <div
                            className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl opacity-15 pointer-events-none"
                            style={{ backgroundColor: theme.brand.primary }}
                        />
                        <AuroraCardContent className="p-5">
                            <div className="flex items-center gap-3">
                                <motion.div
                                    className="p-2.5 rounded-xl"
                                    style={{ backgroundColor: `${theme.brand.primary}15` }}
                                    whileHover={{ scale: 1.05, rotate: 5 }}
                                >
                                    <Share2
                                        className="h-5 w-5"
                                        style={{ color: theme.brand.primary }}
                                    />
                                </motion.div>
                                <div>
                                    <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                                        Shares
                                    </h1>
                                    <p className="text-muted-foreground">
                                        Manage file sharing links
                                    </p>
                                </div>
                            </div>
                        </AuroraCardContent>
                    </AuroraCard>
                </FadeIn>

                {/* Stats Cards */}
                {stats && (
                    <FadeIn delay={0.1}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <AuroraCard variant="default">
                                <AuroraCardContent className="pt-6">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="p-2 rounded-lg"
                                            style={{ backgroundColor: `${theme.brand.primary}15` }}
                                        >
                                            <Share2 className="w-5 h-5" style={{ color: theme.brand.primary }} />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold">{stats.activeShares}</p>
                                            <p className="text-sm text-muted-foreground">Active</p>
                                        </div>
                                    </div>
                                </AuroraCardContent>
                            </AuroraCard>
                            <AuroraCard variant="default">
                                <AuroraCardContent className="pt-6">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="p-2 rounded-lg"
                                            style={{ backgroundColor: `${theme.semantic.success}15` }}
                                        >
                                            <Download className="w-5 h-5" style={{ color: theme.semantic.success }} />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold">{stats.totalDownloads}</p>
                                            <p className="text-sm text-muted-foreground">Downloads</p>
                                        </div>
                                    </div>
                                </AuroraCardContent>
                            </AuroraCard>
                            <AuroraCard variant="default">
                                <AuroraCardContent className="pt-6">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="p-2 rounded-lg"
                                            style={{ backgroundColor: `${theme.semantic.warning}15` }}
                                        >
                                            <Clock className="w-5 h-5" style={{ color: theme.semantic.warning }} />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold">{stats.expiredShares}</p>
                                            <p className="text-sm text-muted-foreground">Expired</p>
                                        </div>
                                    </div>
                                </AuroraCardContent>
                            </AuroraCard>
                            <AuroraCard variant="default">
                                <AuroraCardContent className="pt-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-secondary">
                                            <Link2 className="w-5 h-5 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold">{stats.sharesUsed}/{stats.maxShares}</p>
                                            <p className="text-sm text-muted-foreground">Quota</p>
                                        </div>
                                    </div>
                                </AuroraCardContent>
                            </AuroraCard>
                        </div>
                    </FadeIn>
                )}

                {/* Shares List */}
                <FadeIn delay={0.2}>
                    <AuroraCard variant="default">
                        <AuroraCardHeader>
                            <div className="flex items-center gap-2">
                                <Share2 className="w-5 h-5" style={{ color: theme.brand.primary }} />
                                <div>
                                    <h3 className="font-semibold">Sharing Links</h3>
                                    <p className="text-sm text-muted-foreground">All links you have shared</p>
                                </div>
                            </div>
                        </AuroraCardHeader>
                        <AuroraCardContent>
                            {isLoading ? (
                                <PageLoading />
                            ) : shares.length === 0 ? (
                                <EmptyState
                                    icon={Share2}
                                    title="No shares yet"
                                    description="Use the context menu on a file to share it."
                                />
                            ) : (
                                <div className="space-y-4">
                                    {shares.map((share) => {
                                        const status = getShareStatus(share);
                                        const StatusIcon = status.icon;
                                        const isActive = !share.isRevoked && !share.isExpired && !share.isLimitReached;

                                        return (
                                            <div
                                                key={share.id}
                                                className={`p-4 rounded-sm border ${isActive ? 'bg-card' : 'bg-muted/30 opacity-75'
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                                        {getFileIcon(share.file.fileType as FileType)}
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-medium truncate">{getShareFilename(share.file)}</p>
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

                                                    <div className="flex items-center gap-2">
                                                        {isActive && (
                                                            <>
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
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </AuroraCardContent>
                    </AuroraCard>
                </FadeIn>
            </div>

            {/* Revoke Dialog */}
            <Dialog open={revokeDialog.open} onOpenChange={(open) => setRevokeDialog({ ...revokeDialog, open })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Revoke Share</DialogTitle>
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

            {/* Extend Dialog */}
            <Dialog open={extendDialog.open} onOpenChange={(open) => setExtendDialog({ ...extendDialog, open })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Renew Share</DialogTitle>
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
