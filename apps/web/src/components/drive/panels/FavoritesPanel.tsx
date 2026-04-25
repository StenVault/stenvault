/**
 * FavoritesPanel — Favorites filter view inside Drive.
 *
 * Renders the list of starred files (no header chrome — Drive owns the title).
 * Mirrors the body of the legacy standalone Favorites page so the migration
 * to a single Drive surface (I1) is a content move, not a behaviour change.
 */

import { useEffect, useMemo, useState } from 'react';
import { File, FileText, Image, Music, Star, Video } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useCurrentOrgId } from '@/contexts/OrganizationContext';
import { formatBytes } from '@stenvault/shared';
import { AuroraCard, AuroraCardContent } from '@stenvault/shared/ui/aurora-card';
import { FadeIn } from '@stenvault/shared/ui/animated';
import { PageLoading } from '@/components/ui/page-loading';
import { useFilenameDecryption } from '@/hooks/useFilenameDecryption';
import { useFavoriteToggle } from '@/hooks/useFavoriteToggle';
import { FavoriteStar } from '@/components/files/components/FavoriteStar';
import { FilePreviewModal } from '@/components/FilePreviewModal/index';
import type { FileItem } from '@/components/files/types';
import { DriveFilterEmpty } from './DriveFilterEmpty';

function getFileTypeIcon(fileType: string) {
    switch (fileType) {
        case 'image': return Image;
        case 'video': return Video;
        case 'audio': return Music;
        case 'document': return FileText;
        default: return File;
    }
}

export function FavoritesPanel() {
    const orgId = useCurrentOrgId();
    const { data: favoriteFiles, isLoading } = trpc.files.listFavorites.useQuery({
        limit: 100,
        organizationId: orgId,
    });

    const { getDisplayName, decryptFilenames } = useFilenameDecryption();
    const [decryptedFiles, setDecryptedFiles] = useState<FileItem[]>([]);
    const rawFiles = useMemo(() => favoriteFiles ?? [], [favoriteFiles]);

    useEffect(() => {
        if (rawFiles.length > 0) {
            decryptFilenames(rawFiles as FileItem[]).then(
                (result) => setDecryptedFiles(result as FileItem[]),
            );
        } else {
            setDecryptedFiles((prev) => (prev.length === 0 ? prev : []));
        }
    }, [rawFiles, decryptFilenames]);

    const { toggleFavorite } = useFavoriteToggle();
    const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

    if (isLoading) return <PageLoading />;

    if (decryptedFiles.length === 0) {
        return (
            <DriveFilterEmpty
                icon={Star}
                title="Nothing starred yet."
                body="Tap the star on any file to keep it close."
            />
        );
    }

    return (
        <>
            <FadeIn className="flex-1 min-h-0">
                <AuroraCard variant="glass">
                    <AuroraCardContent className="p-0">
                        <div className="divide-y divide-border">
                            {decryptedFiles.map((file) => {
                                const Icon = getFileTypeIcon(file.fileType);
                                return (
                                    <button
                                        key={file.id}
                                        type="button"
                                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                                        onClick={() => setPreviewFile(file)}
                                    >
                                        <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{getDisplayName(file)}</p>
                                            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                                        </div>
                                        <div className="shrink-0">
                                            <FavoriteStar
                                                isFavorite
                                                onClick={() => toggleFavorite(file.id)}
                                            />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </AuroraCardContent>
                </AuroraCard>
            </FadeIn>

            {previewFile && (
                <FilePreviewModal
                    file={previewFile}
                    open={!!previewFile}
                    onClose={() => setPreviewFile(null)}
                />
            )}
        </>
    );
}
