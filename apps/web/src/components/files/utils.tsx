/**
 * FileList Utilities
 * 
 * Shared utility functions and animation variants for the FileList components.
 */

import { FileIcon, FileText, FileImage, FileVideo, FileAudio } from 'lucide-react';
import { cn } from '@stenvault/shared/utils';
import type { FileType } from './types';
import { formatBytes } from '@/utils/formatters';

/**
 * Format file size from bytes to human-readable string
 * Re-exported from centralized location
 */
export const formatFileSize = formatBytes;

/**
 * Get the appropriate icon component for a file type
 */
export function getFileIcon(fileType: FileType, className?: string) {
    const iconClass = cn('w-5 h-5', className);
    switch (fileType) {
        case 'image':
            return { icon: FileImage, className: cn(iconClass, 'text-green-500') };
        case 'video':
            return { icon: FileVideo, className: cn(iconClass, 'text-purple-500') };
        case 'audio':
            return { icon: FileAudio, className: cn(iconClass, 'text-orange-500') };
        case 'document':
            return { icon: FileText, className: cn(iconClass, 'text-blue-500') };
        default:
            return { icon: FileIcon, className: cn(iconClass, 'text-gray-500') };
    }
}

/**
 * Render file icon as JSX element
 */
export function renderFileIcon(fileType: FileType, className?: string) {
    const { icon: Icon, className: iconClassName } = getFileIcon(fileType, className);
    return <Icon className={iconClassName} />;
}

/**
 * Framer Motion animation variants for container
 */
export const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05
        }
    }
};

/**
 * Framer Motion animation variants for items
 */
export const itemVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.95 },
    show: { opacity: 1, y: 0, scale: 1 }
};
