/**
 * ═══════════════════════════════════════════════════════════════
 * QUICK ACCESS FILES COMPONENT
 * ═══════════════════════════════════════════════════════════════
 *
 * Shows quick access to frequently used or recent files.
 * Horizontal scrollable on mobile, grid on desktop.
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { motion } from 'framer-motion';
import {
    FileImage,
    FileVideo,
    FileAudio,
    FileText,
    File,
    ArrowUpRight,
    FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { useTheme } from '@/contexts/ThemeContext';
import { type FileTypeNoFolder } from '@stenvault/shared';
import { formatBytes } from '@/utils/formatters';

// Use FileTypeNoFolder for files (as opposed to folders)
type FileType = FileTypeNoFolder;

interface QuickAccessFile {
    id: number;
    filename: string;
    fileType: FileType;
    size: number;
    mimeType: string | null;
}

interface QuickAccessFilesProps {
    files: QuickAccessFile[];
    onFileClick: (file: QuickAccessFile) => void;
    onViewAll: () => void;
    isLoading?: boolean;
    className?: string;
}

const fileTypeConfig: Record<FileType, {
    icon: typeof File;
    color: string;
    bgColor: string;
}> = {
    image: {
        icon: FileImage,
        color: 'text-pink-400',
        bgColor: 'bg-pink-500/10',
    },
    video: {
        icon: FileVideo,
        color: 'text-violet-400',
        bgColor: 'bg-violet-500/10',
    },
    audio: {
        icon: FileAudio,
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
    },
    document: {
        icon: FileText,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
    },
    other: {
        icon: File,
        color: 'text-slate-400',
        bgColor: 'bg-slate-500/10',
    },
};

function QuickAccessFileSkeleton() {
    return (
        <div className="flex-shrink-0 w-[140px] md:w-auto animate-pulse">
            <div className="p-4 rounded-xl bg-secondary h-[120px]" />
        </div>
    );
}

export function QuickAccessFiles({
    files,
    onFileClick,
    onViewAll,
    isLoading = false,
    className,
}: QuickAccessFilesProps) {
    const { theme } = useTheme();
    const displayFiles = files.slice(0, 6);

    if (isLoading) {
        return (
            <div className={cn('space-y-3', className)}>
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground">Quick Access</h3>
                </div>
                <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-3">
                    {[...Array(3)].map((_, i) => (
                        <QuickAccessFileSkeleton key={i} />
                    ))}
                </div>
            </div>
        );
    }

    if (displayFiles.length === 0) {
        return (
            <div className={cn('text-center py-8', className)}>
                <div className="p-3 rounded-xl bg-secondary inline-block mb-3">
                    <FolderOpen className="h-6 w-6 text-foreground-muted" />
                </div>
                <p className="text-foreground-muted text-sm">
                    No files yet
                </p>
            </div>
        );
    }

    return (
        <div className={cn('space-y-3', className)}>
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">Quick Access</h3>
                <button
                    onClick={onViewAll}
                    className="flex items-center gap-1 text-xs transition-colors"
                    style={{ color: theme.brand.primary }}
                >
                    View all
                    <ArrowUpRight className="h-3 w-3" />
                </button>
            </div>

            {/* Horizontal scroll on mobile, grid on desktop */}
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-3 lg:grid-cols-4">
                {displayFiles.map((file, index) => {
                    const config = fileTypeConfig[file.fileType];
                    const Icon = config.icon;

                    return (
                        <motion.div
                            key={file.id}
                            className="flex-shrink-0 w-[140px] md:w-auto"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                                delay: index * 0.05,
                                duration: 0.3,
                                ease: [0.16, 1, 0.3, 1],
                            }}
                        >
                            <Card
                                variant="interactive"
                                className="cursor-pointer group h-full"
                                onClick={() => onFileClick(file)}
                            >
                                <CardContent className="p-4">
                                    <div className={cn(
                                        'p-2.5 rounded-lg w-fit mb-3 transition-transform group-hover:scale-105',
                                        config.bgColor
                                    )}>
                                        <Icon className={cn('h-5 w-5', config.color)} />
                                    </div>

                                    <p className="text-sm font-medium text-foreground truncate mb-1">
                                        {file.filename}
                                    </p>

                                    <p className="text-xs text-foreground-muted">
                                        {formatBytes(file.size)}
                                    </p>
                                </CardContent>
                            </Card>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
