/**
 * ═══════════════════════════════════════════════════════════════
 * ACTIVITY TIMELINE COMPONENT
 * ═══════════════════════════════════════════════════════════════
 *
 * Shows recent user activity in a visual timeline format.
 * Uses real data from the files API.
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { motion } from 'framer-motion';
import {
    Upload,
    FolderPlus,
    Trash2,
    Share2,
    Download,
    Eye,
    Clock,
    FileIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
// Default to English locale

export type ActivityType = 'upload' | 'create_folder' | 'delete' | 'share' | 'download' | 'view';

export interface ActivityItem {
    id: string | number;
    type: ActivityType;
    title: string;
    timestamp: Date;
    metadata?: {
        fileName?: string;
        folderName?: string;
        sharedWith?: string;
    };
}

interface ActivityTimelineProps {
    activities: ActivityItem[];
    maxItems?: number;
    className?: string;
    isLoading?: boolean;
}

const activityConfig: Record<ActivityType, {
    icon: typeof Upload;
    color: string;
    bgColor: string;
    label: string;
}> = {
    upload: {
        icon: Upload,
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        label: 'Upload',
    },
    create_folder: {
        icon: FolderPlus,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        label: 'New Folder',
    },
    delete: {
        icon: Trash2,
        color: 'text-rose-400',
        bgColor: 'bg-rose-500/10',
        label: 'Deleted',
    },
    share: {
        icon: Share2,
        color: 'text-violet-400',
        bgColor: 'bg-violet-500/10',
        label: 'Shared',
    },
    download: {
        icon: Download,
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        label: 'Download',
    },
    view: {
        icon: Eye,
        color: 'text-sky-400',
        bgColor: 'bg-sky-500/10',
        label: 'Viewed',
    },
};

function ActivityItemSkeleton() {
    return (
        <div className="flex items-start gap-3 animate-pulse">
            <div className="w-9 h-9 rounded-lg bg-secondary" />
            <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-secondary" />
                <div className="h-3 w-1/2 rounded bg-secondary" />
            </div>
        </div>
    );
}

export function ActivityTimeline({
    activities,
    maxItems = 5,
    className,
    isLoading = false,
}: ActivityTimelineProps) {
    const displayActivities = activities.slice(0, maxItems);

    if (isLoading) {
        return (
            <div className={cn('space-y-4', className)}>
                <div className="flex items-center gap-2 mb-4">
                    <Clock className="h-4 w-4 text-foreground-muted" />
                    <h3 className="text-sm font-medium text-foreground">Recent Activity</h3>
                </div>
                <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                        <ActivityItemSkeleton key={i} />
                    ))}
                </div>
            </div>
        );
    }

    if (displayActivities.length === 0) {
        return (
            <div className={cn('text-center py-8', className)}>
                <div className="p-3 rounded-xl bg-secondary inline-block mb-3">
                    <Clock className="h-6 w-6 text-foreground-muted" />
                </div>
                <p className="text-foreground-muted text-sm">
                    No recent activity
                </p>
            </div>
        );
    }

    return (
        <div className={cn('space-y-4', className)}>
            <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-foreground-muted" />
                <h3 className="text-sm font-medium text-foreground">Recent Activity</h3>
            </div>

            <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[17px] top-0 bottom-0 w-px bg-border" />

                <div className="space-y-4">
                    {displayActivities.map((activity, index) => {
                        const config = activityConfig[activity.type];
                        const Icon = config.icon;

                        return (
                            <motion.div
                                key={activity.id}
                                className="relative flex items-start gap-3 pl-0"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{
                                    delay: index * 0.05,
                                    duration: 0.3,
                                    ease: [0.16, 1, 0.3, 1],
                                }}
                            >
                                {/* Icon */}
                                <motion.div
                                    className={cn(
                                        'relative z-10 p-2 rounded-lg',
                                        config.bgColor
                                    )}
                                    whileHover={{ scale: 1.05 }}
                                >
                                    <Icon className={cn('h-5 w-5', config.color)} />
                                </motion.div>

                                {/* Content */}
                                <div className="flex-1 min-w-0 pt-0.5">
                                    <p className="text-sm font-medium text-foreground truncate">
                                        {activity.title}
                                    </p>
                                    <p className="text-xs text-foreground-muted">
                                        {formatDistanceToNow(new Date(activity.timestamp), {
                                            addSuffix: true,
                                            // Default to English locale
                                        })}
                                    </p>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/**
 * Helper function to convert file uploads to activity items
 */
export function filesToActivityItems(
    files: Array<{ id: number; filename: string; createdAt: Date }>
): ActivityItem[] {
    return files.map(file => ({
        id: file.id,
        type: 'upload' as ActivityType,
        title: file.filename,
        timestamp: new Date(file.createdAt),
        metadata: {
            fileName: file.filename,
        },
    }));
}
