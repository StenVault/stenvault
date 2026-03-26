/**
 * EncryptedThumbnail Component (Phase 7.2)
 *
 * Displays encrypted thumbnails by decrypting them client-side.
 * Shows loading skeleton while decrypting and falls back to icon on error.
 *
 * @module EncryptedThumbnail
 */

import React, { useMemo } from 'react';
import { useThumbnailDecryption } from '@/hooks/useThumbnailDecryption';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { FileIcon, ImageIcon, VideoIcon, FileAudioIcon, FileTextIcon } from 'lucide-react';

export interface EncryptedThumbnailProps {
    fileId: number;
    thumbnailUrl: string | null;
    thumbnailIv: string | null;
    mimeType: string | null;
    /** Override fileId for HKDF key derivation (for duplicated files) */
    keyDerivationFileId?: number;
    alt?: string;
    className?: string;
    width?: number | string;
    height?: number | string;
    objectFit?: 'cover' | 'contain' | 'fill' | 'none';
    disabled?: boolean;
}

function getFallbackIcon(mimeType: string | null): React.ComponentType<{ className?: string }> {
    if (!mimeType) return FileIcon;

    if (mimeType.startsWith('image/')) return ImageIcon;
    if (mimeType.startsWith('video/')) return VideoIcon;
    if (mimeType.startsWith('audio/')) return FileAudioIcon;
    if (mimeType.startsWith('text/') || mimeType.includes('pdf') || mimeType.includes('document')) {
        return FileTextIcon;
    }

    return FileIcon;
}

export function EncryptedThumbnail({
    fileId,
    thumbnailUrl,
    thumbnailIv,
    mimeType,
    keyDerivationFileId,
    alt = 'Thumbnail',
    className,
    width = 80,
    height = 80,
    objectFit = 'cover',
    disabled = false,
}: EncryptedThumbnailProps) {
    const { url, isLoading, error } = useThumbnailDecryption({
        fileId,
        thumbnailUrl: disabled ? null : thumbnailUrl,
        thumbnailIv: disabled ? null : thumbnailIv,
        keyDerivationFileId,
        autoFetch: true,
    });

    const FallbackIcon = useMemo(() => getFallbackIcon(mimeType), [mimeType]);

    const containerStyle = useMemo(() => ({
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
    }), [width, height]);

    if (isLoading) {
        return (
            <Skeleton
                className={cn('rounded-md', className)}
                style={containerStyle}
            />
        );
    }

    if (url) {
        return (
            <img
                src={url}
                alt={alt}
                className={cn('rounded-md', className)}
                style={{
                    ...containerStyle,
                    objectFit,
                }}
                loading="lazy"
            />
        );
    }

    return (
        <div
            className={cn(
                'flex items-center justify-center rounded-md bg-muted',
                className
            )}
            style={containerStyle}
            title={error || undefined}
        >
            <FallbackIcon
                className={cn(
                    'text-muted-foreground',
                    typeof width === 'number' && width <= 40 ? 'h-4 w-4' :
                        typeof width === 'number' && width <= 80 ? 'h-6 w-6' : 'h-8 w-8'
                )}
            />
        </div>
    );
}

export const EncryptedThumbnailMemo = React.memo(EncryptedThumbnail);
