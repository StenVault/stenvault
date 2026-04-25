/**
 * FileGallery View Component
 * 
 * Gallery view for displaying images with folders and other files.
 */

import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
    Folder,
    MoreVertical,
    Download,
    Trash2,
    Eye,
    Share2,
    Images,
    Clock,
} from 'lucide-react';
import { Button } from '@stenvault/shared/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ImageGallery } from '@/components/gallery/ImageGallery';
import { containerVariants, itemVariants, formatFileSize, renderFileIcon } from '../utils';
import { TimestampIcon } from '../components/TimestampBadge';
import { SignatureIcon } from '../components/SignatureIcon';
import { FavoriteStar } from '../components/FavoriteStar';
import type { FileItem, FolderItem, TimestampProps } from '../types';

interface FileGalleryProps {
    files: FileItem[];
    folders: FolderItem[];
    onFolderClick?: (folderId: number) => void;
    onFilePreview?: (file: FileItem) => void;
    onDownload: (file: FileItem) => void;
    onShare: (file: FileItem) => void;
    onDelete: (item: FileItem | FolderItem, type: 'file' | 'folder') => void;
    onFolderDownload?: (folder: FolderItem) => void;
    /** Timestamp props - grouped for consistency */
    timestamp?: TimestampProps<FileItem>;
    // Favorites
    onToggleFavorite?: (fileId: number) => void;
    /** Get decrypted display name for a folder */
    getFolderDisplayName?: (folder: FolderItem) => string;
    // Selection
    isSelected?: (fileId: number) => boolean;
    onToggleSelection?: (fileId: number) => void;
}

export function FileGallery({
    files,
    folders,
    onFolderClick,
    onFilePreview,
    onDownload,
    onShare,
    onDelete,
    onFolderDownload,
    timestamp,
    onToggleFavorite,
    getFolderDisplayName,
    isSelected,
    onToggleSelection,
}: FileGalleryProps) {
    const imageFiles = files.filter((f) => f.fileType === 'image');
    const otherFiles = files.filter((f) => f.fileType !== 'image');

    return (
        <motion.div
            className="space-y-6"
            variants={containerVariants}
            initial="hidden"
            animate="show"
        >
            {/* Show folders first if any */}
            {folders.length > 0 && (
                <div>
                    <h3 className="text-sm font-medium text-foreground-muted mb-3">Pastas</h3>
                    <motion.div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {folders.map((folder) => (
                            <motion.div
                                layout
                                variants={itemVariants}
                                key={`folder-${folder.id}`}
                                className="group relative p-3 rounded-lg border border-border/50 bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 cursor-pointer"
                                onClick={() => onFolderClick?.(folder.id)}
                            >
                                <div className="flex flex-col items-center gap-2">
                                    <div className="p-2 rounded-lg bg-primary/10">
                                        <Folder className="w-6 h-6 text-primary" />
                                    </div>
                                    <span className="text-xs font-medium text-center truncate w-full">
                                        {getFolderDisplayName ? getFolderDisplayName(folder) : folder.name}
                                    </span>
                                </div>
                                {onFolderDownload && (
                                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                                    <MoreVertical className="w-3 h-3" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onFolderDownload(folder); }}>
                                                    <Download className="w-4 h-4 mr-2" />
                                                    Download as ZIP
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            )}

            {/* Image Gallery */}
            {imageFiles.length > 0 ? (
                <motion.div variants={itemVariants}>
                    <h3 className="text-sm font-medium text-foreground-muted mb-3">
                        Imagens ({imageFiles.length})
                    </h3>
                    <ImageGallery
                        images={imageFiles.map((f) => ({
                            id: f.id,
                            filename: f.filename,
                            mimeType: f.mimeType,
                            size: f.size,
                            createdAt: f.createdAt,
                            url: `/api/files/${f.id}/preview`,
                        }))}
                        onDownload={(img) => {
                            const file = imageFiles.find(f => f.id === img.id);
                            if (file) onDownload(file);
                        }}
                        onShare={(img) => {
                            const file = imageFiles.find(f => f.id === img.id);
                            if (file) onShare(file);
                        }}
                        onDelete={(img) => {
                            const file = imageFiles.find(f => f.id === img.id);
                            if (file) onDelete(file, 'file');
                        }}
                        onImageClick={(img) => {
                            const file = imageFiles.find(f => f.id === img.id);
                            if (file) onFilePreview?.(file);
                        }}
                    />
                </motion.div>
            ) : (
                folders.length === 0 && (
                    <motion.div
                        variants={itemVariants}
                        className="flex flex-col items-center justify-center py-16 text-center"
                    >
                        <div className="p-4 rounded-full bg-secondary mb-4">
                            <Images className="w-12 h-12 text-foreground-muted" />
                        </div>
                        <h3 className="text-lg font-medium mb-2">No images found</h3>
                        <p className="text-muted-foreground">
                            Upload some images to see them in the gallery
                        </p>
                    </motion.div>
                )
            )}

            {/* Other file types in compact list */}
            {otherFiles.length > 0 && (
                <motion.div variants={itemVariants}>
                    <h3 className="text-sm font-medium text-foreground-muted mb-3">
                        Outros Arquivos ({otherFiles.length})
                    </h3>
                    <div className="space-y-1 rounded-lg border border-border overflow-hidden">
                        {otherFiles.map((file) => (
                            <div
                                key={file.id}
                                className="flex items-center justify-between p-3 hover:bg-accent/50 transition-colors cursor-pointer"
                                onClick={() => onFilePreview?.(file)}
                            >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    {isSelected && onToggleSelection && (
                                        <input
                                            type="checkbox"
                                            checked={isSelected(file.id)}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                onToggleSelection(file.id);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-5 h-5 cursor-pointer accent-primary flex-shrink-0"
                                        />
                                    )}
                                    {onToggleFavorite && (
                                        <FavoriteStar
                                            isFavorite={!!file.isFavorite}
                                            onClick={() => onToggleFavorite(file.id)}
                                            size={14}
                                        />
                                    )}
                                    {renderFileIcon(file.fileType)}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-sm font-medium truncate">{file.decryptedFilename || file.filename}</p>
                                            {timestamp?.getStatus && timestamp.getStatus(file.id) && (
                                                <TimestampIcon
                                                    status={timestamp.getStatus(file.id)}
                                                    onClick={() => timestamp?.onClick?.(file)}
                                                />
                                            )}
                                            {file.isSigned && (
                                                <SignatureIcon signedAt={file.signedAt} />
                                            )}
                                        </div>
                                        <p className="text-xs text-foreground-muted">
                                            {formatFileSize(file.size)} • {format(new Date(file.createdAt), 'dd MMM yyyy')}
                                        </p>
                                    </div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreVertical className="w-4 h-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onFilePreview?.(file); }}>
                                            <Eye className="w-4 h-4 mr-2" />
                                            Preview
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(file); }}>
                                            <Download className="w-4 h-4 mr-2" />
                                            Download
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onShare(file); }}>
                                            <Share2 className="w-4 h-4 mr-2" />
                                            Share
                                        </DropdownMenuItem>
                                        {timestamp?.onClick && (
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); timestamp.onClick?.(file); }}>
                                                <Clock className="w-4 h-4 mr-2" />
                                                Blockchain Timestamp
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="text-destructive"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete(file, 'file');
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}
