/**
 * SharedFileCard - Display shared vault files in chat
 *
 * Shows a card with:
 * - File icon and name
 * - File size and type
 * - E2E encryption badge
 * - Expiration countdown
 * - Download/Preview buttons
 * - Preview modal for images/videos
 *
 * @module components/chat/SharedFileCard
 */

import { memo, useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    FileText,
    Image as ImageIcon,
    Video as VideoIcon,
    Music,
    File,
    Download,
    Eye,
    Clock,
    Loader2,
    Shield,
    AlertCircle,
} from "lucide-react";
import { formatBytes } from "@/utils/formatters";
import { useSharedFileAccess } from "@/hooks/useSharedFileAccess";
import { formatDistanceToNow } from "date-fns";
import { enGB } from "date-fns/locale";
import { toast } from "sonner";

// File type to icon mapping
const FILE_TYPE_ICONS: Record<string, typeof File> = {
    image: ImageIcon,
    video: VideoIcon,
    audio: Music,
    document: FileText,
    other: File,
};

// File type to color mapping
const FILE_TYPE_COLORS: Record<string, string> = {
    image: "bg-pink-500/20 text-pink-500",
    video: "bg-purple-500/20 text-purple-500",
    audio: "bg-amber-500/20 text-amber-500",
    document: "bg-blue-500/20 text-blue-500",
    other: "bg-slate-500/20 text-slate-500",
};

interface SharedFileCardProps {
    /** Share ID for accessing the file */
    shareId: number;
    /** File information */
    file: {
        filename: string;
        fileType: string;
        size: number;
        mimeType?: string | null;
    };
    /** Permission level */
    permission: "view" | "download";
    /** Download count and limit */
    downloadCount: number;
    maxDownloads: number | null;
    /** Expiration date */
    expiresAt: Date | null;
    /** Share status */
    status: "active" | "revoked" | "expired";
    /** If this is the sender's view */
    isOwn?: boolean;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Card component for shared vault files in chat
 */
export const SharedFileCard = memo(function SharedFileCard({
    shareId,
    file,
    permission,
    downloadCount,
    maxDownloads,
    expiresAt,
    status,
    isOwn = false,
    className,
}: SharedFileCardProps) {
    const { downloadAndSave, previewSharedFile, isDownloading, downloadProgress } =
        useSharedFileAccess();

    // Preview modal state
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);

    // Get icon for file type
    const Icon = FILE_TYPE_ICONS[file.fileType] || File;
    const iconColorClass = FILE_TYPE_COLORS[file.fileType] || FILE_TYPE_COLORS.other;

    // Check if share is accessible
    const isAccessible = status === "active";
    const isExpired =
        status === "expired" || (expiresAt && new Date(expiresAt) < new Date());
    const isRevoked = status === "revoked";
    const isLimitReached = maxDownloads !== null && downloadCount >= maxDownloads;

    // Check if preview is supported
    const isPreviewSupported = file.fileType === "image" || file.fileType === "video";

    // Format expiration
    const expirationText = useMemo(() => {
        if (!expiresAt) return null;
        const expDate = new Date(expiresAt);
        if (expDate < new Date()) return "Expired";
        return `Expires ${formatDistanceToNow(expDate, { addSuffix: true, locale: enGB })}`;
    }, [expiresAt]);

    // Handle download
    const handleDownload = useCallback(async () => {
        if (!isAccessible || isLimitReached) return;
        await downloadAndSave(shareId);
    }, [isAccessible, isLimitReached, downloadAndSave, shareId]);

    // Handle preview - opens modal with decrypted content
    const handlePreview = useCallback(async () => {
        if (!isAccessible || !isPreviewSupported) return;

        setIsLoadingPreview(true);
        setIsPreviewOpen(true);

        try {
            const url = await previewSharedFile(shareId);
            setPreviewUrl(url);
        } catch (error) {
            toast.error("Failed to load preview", {
                description: error instanceof Error ? error.message : "Try again",
            });
            setIsPreviewOpen(false);
        } finally {
            setIsLoadingPreview(false);
        }
    }, [isAccessible, isPreviewSupported, previewSharedFile, shareId]);

    // Cleanup preview URL when modal closes
    const handleClosePreview = useCallback(() => {
        setIsPreviewOpen(false);
        if (previewUrl) {
            // Revoke the object URL to free memory
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
    }, [previewUrl]);

    // Status badge
    const statusBadge = useMemo(() => {
        if (isRevoked) {
            return (
                <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Revoked
                </Badge>
            );
        }
        if (isExpired) {
            return (
                <Badge variant="secondary" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    Expired
                </Badge>
            );
        }
        if (isLimitReached) {
            return (
                <Badge variant="secondary" className="text-xs">
                    <Download className="w-3 h-3 mr-1" />
                    Limit reached
                </Badge>
            );
        }
        return null;
    }, [isRevoked, isExpired, isLimitReached]);

    return (
        <>
            <div
                className={cn(
                    "flex flex-col gap-2 p-3 rounded-xl border-2 min-w-[240px] max-w-[320px]",
                    "transition-all duration-200",
                    isOwn
                        ? "bg-white/10 border-white/20"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
                    !isAccessible && "opacity-60",
                    className
                )}
            >
                {/* Header with file info */}
                <div className="flex items-start gap-3">
                    {/* File icon */}
                    <div
                        className={cn(
                            "p-2.5 rounded-lg flex-shrink-0",
                            isOwn ? "bg-white/20" : iconColorClass
                        )}
                    >
                        <Icon className={cn("h-5 w-5", isOwn && "text-white")} />
                    </div>

                    {/* File details */}
                    <div className="flex-1 min-w-0">
                        <p
                            className={cn(
                                "text-sm font-medium truncate",
                                isOwn ? "text-white" : "text-slate-900 dark:text-slate-100"
                            )}
                            title={file.filename}
                        >
                            {file.filename}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span
                                className={cn(
                                    "text-xs",
                                    isOwn ? "text-white/70" : "text-slate-500 dark:text-slate-400"
                                )}
                            >
                                {formatBytes(file.size)}
                            </span>
                            {maxDownloads !== null && (
                                <span
                                    className={cn(
                                        "text-xs",
                                        isOwn ? "text-white/70" : "text-slate-500 dark:text-slate-400"
                                    )}
                                >
                                    • {downloadCount}/{maxDownloads} downloads
                                </span>
                            )}
                        </div>
                    </div>

                    {/* E2E badge */}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div
                                    className={cn(
                                        "p-1.5 rounded-md flex-shrink-0",
                                        isOwn
                                            ? "bg-emerald-500/20"
                                            : "bg-emerald-100 dark:bg-emerald-900/30"
                                    )}
                                >
                                    <Shield
                                        className={cn(
                                            "w-3.5 h-3.5",
                                            isOwn
                                                ? "text-emerald-300"
                                                : "text-emerald-600 dark:text-emerald-400"
                                        )}
                                    />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>E2E Encryption</p>
                                <p className="text-xs text-muted-foreground">
                                    Vault File - Zero-copy
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>

                {/* Status and expiration */}
                <div className="flex items-center gap-2 flex-wrap">
                    {statusBadge}
                    {!statusBadge && expirationText && (
                        <span
                            className={cn(
                                "text-xs flex items-center gap-1",
                                isOwn ? "text-white/60" : "text-slate-500 dark:text-slate-400"
                            )}
                        >
                            <Clock className="w-3 h-3" />
                            {expirationText}
                        </span>
                    )}
                    {permission === "view" && (
                        <Badge
                            variant="outline"
                            className={cn(
                                "text-xs",
                                isOwn && "border-white/30 text-white/80"
                            )}
                        >
                            <Eye className="w-3 h-3 mr-1" />
                            View only
                        </Badge>
                    )}
                </div>

                {/* Actions */}
                {isAccessible && !isLimitReached && (
                    <div className="flex gap-2 mt-1">
                        {isPreviewSupported && (
                            <Button
                                size="sm"
                                variant={isOwn ? "secondary" : "outline"}
                                onClick={handlePreview}
                                disabled={isDownloading || isLoadingPreview}
                                className={cn(
                                    "flex-1",
                                    isOwn && "bg-white/20 hover:bg-white/30 border-0"
                                )}
                            >
                                {isLoadingPreview ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                        Loading...
                                    </>
                                ) : (
                                    <>
                                        <Eye className="w-4 h-4 mr-1.5" />
                                        Preview
                                    </>
                                )}
                            </Button>
                        )}
                        {permission === "download" && (
                            <Button
                                size="sm"
                                variant={isOwn ? "secondary" : "default"}
                                onClick={handleDownload}
                                disabled={isDownloading}
                                className={cn(
                                    "flex-1",
                                    isOwn && "bg-white/20 hover:bg-white/30 border-0"
                                )}
                            >
                                {isDownloading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                        {downloadProgress}%
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-4 h-4 mr-1.5" />
                                        Download
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Preview Modal */}
            <Dialog open={isPreviewOpen} onOpenChange={handleClosePreview}>
                <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
                    <DialogHeader className="px-4 py-3 border-b bg-background/95 backdrop-blur">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-sm font-medium truncate flex items-center gap-2">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                                {file.filename}
                            </DialogTitle>
                            <div className="flex items-center gap-2">
                                {permission === "download" && previewUrl && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={handleDownload}
                                        disabled={isDownloading}
                                    >
                                        <Download className="w-4 h-4 mr-1.5" />
                                        Download
                                    </Button>
                                )}
                                <Badge variant="secondary" className="gap-1">
                                    <Shield className="w-3 h-3" />
                                    E2E
                                </Badge>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="relative flex items-center justify-center bg-black/95 min-h-[300px] max-h-[calc(90vh-60px)] overflow-auto">
                        {isLoadingPreview ? (
                            <div className="flex flex-col items-center gap-3 text-white/80">
                                <Loader2 className="w-8 h-8 animate-spin" />
                                <p className="text-sm">Decrypting file...</p>
                                <p className="text-xs text-white/50">
                                    {downloadProgress > 0 && `${downloadProgress}%`}
                                </p>
                            </div>
                        ) : previewUrl ? (
                            file.fileType === "image" ? (
                                <img
                                    src={previewUrl}
                                    alt={file.filename}
                                    className="max-w-full max-h-[calc(90vh-60px)] object-contain"
                                    onError={() => {
                                        toast.error("Failed to load image");
                                        handleClosePreview();
                                    }}
                                />
                            ) : file.fileType === "video" ? (
                                <video
                                    src={previewUrl}
                                    controls
                                    autoPlay
                                    className="max-w-full max-h-[calc(90vh-60px)]"
                                    onError={() => {
                                        toast.error("Failed to load video");
                                        handleClosePreview();
                                    }}
                                >
                                    Your browser does not support video playback.
                                </video>
                            ) : null
                        ) : null}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
});

export default SharedFileCard;
