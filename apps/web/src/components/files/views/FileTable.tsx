/**
 * FileTable View Component
 * 
 * Table/list view for displaying files and folders.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
    Folder,
    MoreVertical,
    Download,
    Trash2,
    Pencil,
    Eye,
    Share2,
    Clock,
    Star,
    Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { containerVariants, itemVariants, formatFileSize, renderFileIcon } from '../utils';
import { TimestampIcon } from '../components/TimestampBadge';
import { SignatureIcon } from '../components/SignatureIcon';
import { FavoriteStar } from '../components/FavoriteStar';
import type { FileItem, FolderItem, TimestampProps } from '../types';

interface FileTableProps {
    files: FileItem[];
    folders: FolderItem[];
    onFolderClick?: (folderId: number) => void;
    onFilePreview?: (file: FileItem) => void;
    onDownload: (file: FileItem) => void;
    onShare: (file: FileItem) => void;
    onRename: (item: FileItem | FolderItem, type: 'file' | 'folder') => void;
    onDelete: (item: FileItem | FolderItem, type: 'file' | 'folder') => void;
    onFolderDownload?: (folder: FolderItem) => void;
    /** Timestamp props - grouped for consistency */
    timestamp?: TimestampProps<FileItem>;
    // Favorites
    onToggleFavorite?: (fileId: number) => void;
    // Duplicate
    onDuplicate?: (file: FileItem) => void;
    /** Get decrypted display name for a folder */
    getFolderDisplayName?: (folder: FolderItem) => string;
    // Selection
    isSelected?: (fileId: number) => boolean;
    onToggleSelection?: (fileId: number) => void;
}

export function FileTable({
    files,
    folders,
    onFolderClick,
    onFilePreview,
    onDownload,
    onShare,
    onRename,
    onDelete,
    onFolderDownload,
    timestamp,
    onToggleFavorite,
    onDuplicate,
    getFolderDisplayName,
    isSelected,
    onToggleSelection,
}: FileTableProps) {
    if (files.length === 0 && folders.length === 0) {
        return null;
    }

    return (
        <div className="rounded-sm border border-border overflow-hidden">
            <table className="w-full">
                <thead className="bg-muted/50">
                    <tr>
                        {isSelected && onToggleSelection && (
                            <th className="px-2 py-3 w-10" />
                        )}
                        <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
                        {onToggleFavorite && (
                            <th className="px-4 py-3 text-center w-10"><Star className="w-3.5 h-3.5 mx-auto text-muted-foreground" /></th>
                        )}
                        <th className="px-4 py-3 text-left text-sm font-medium hidden sm:table-cell">Size</th>
                        <th className="px-4 py-3 text-left text-sm font-medium hidden md:table-cell">Modified</th>
                        {timestamp?.getStatus && (
                            <th className="px-4 py-3 text-center text-sm font-medium hidden lg:table-cell w-24">Timestamp</th>
                        )}
                        <th className="px-4 py-3 text-center text-sm font-medium hidden lg:table-cell w-16">Signed</th>
                        <th className="px-4 py-3 text-right text-sm font-medium w-12">Actions</th>
                    </tr>
                </thead>
                <motion.tbody
                    className="divide-y divide-border"
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                >
                    <AnimatePresence mode='popLayout'>
                        {/* Folders */}
                        {folders.map((folder) => (
                            <motion.tr
                                layout
                                variants={itemVariants}
                                key={`folder-${folder.id}`}
                                className="hover:bg-accent/50 cursor-pointer transition-colors"
                                onClick={() => onFolderClick?.(folder.id)}
                            >
                                {isSelected && onToggleSelection && (
                                    <td className="px-2 py-3" />
                                )}
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <Folder className="w-5 h-5 text-primary" />
                                        <span className="font-medium">{getFolderDisplayName ? getFolderDisplayName(folder) : folder.name}</span>
                                    </div>
                                </td>
                                {onToggleFavorite && (
                                    <td className="px-4 py-3 text-center" />
                                )}
                                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">—</td>
                                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                                    {format(new Date(folder.createdAt), 'MMM d, yyyy')}
                                </td>
                                {timestamp?.getStatus && (
                                    <td className="px-4 py-3 text-center text-muted-foreground hidden lg:table-cell">—</td>
                                )}
                                <td className="px-4 py-3 text-center text-muted-foreground hidden lg:table-cell">—</td>
                                <td className="px-4 py-3 text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Folder actions">
                                                <MoreVertical className="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {onFolderDownload && (
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onFolderDownload(folder);
                                                    }}
                                                >
                                                    <Download className="w-4 h-4 mr-2" />
                                                    Download as ZIP
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuItem
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRename(folder, 'folder');
                                                }}
                                            >
                                                <Pencil className="w-4 h-4 mr-2" />
                                                Rename
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                className="text-destructive"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDelete(folder, 'folder');
                                                }}
                                            >
                                                <Trash2 className="w-4 h-4 mr-2" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </td>
                            </motion.tr>
                        ))}

                        {/* Files */}
                        {files.map((file) => (
                            <motion.tr
                                layout
                                variants={itemVariants}
                                key={`file-${file.id}`}
                                className="hover:bg-accent/50 cursor-pointer transition-colors"
                                onClick={() => onFilePreview?.(file)}
                            >
                                {isSelected && onToggleSelection && (
                                    <td className="px-2 py-3 text-center">
                                        <input
                                            type="checkbox"
                                            checked={isSelected(file.id)}
                                            onChange={() => {}}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleSelection(file.id);
                                            }}
                                            className="w-5 h-5 cursor-pointer accent-primary"
                                        />
                                    </td>
                                )}
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        {renderFileIcon(file.fileType)}
                                        <span className="font-medium">{file.decryptedFilename || file.filename}</span>
                                    </div>
                                </td>
                                {onToggleFavorite && (
                                    <td className="px-4 py-3 text-center">
                                        <FavoriteStar
                                            isFavorite={!!file.isFavorite}
                                            onClick={() => onToggleFavorite(file.id)}
                                            size={14}
                                        />
                                    </td>
                                )}
                                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                                    {formatFileSize(file.size)}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                                    {format(new Date(file.createdAt), 'MMM d, yyyy')}
                                </td>
                                {timestamp?.getStatus && (
                                    <td className="px-4 py-3 text-center hidden lg:table-cell">
                                        {timestamp?.getStatus(file.id) ? (
                                            <div className="flex justify-center">
                                                <TimestampIcon
                                                    status={timestamp?.getStatus(file.id)}
                                                    onClick={() => timestamp?.onClick?.(file)}
                                                />
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </td>
                                )}
                                <td className="px-4 py-3 text-center hidden lg:table-cell">
                                    {file.isSigned ? (
                                        <div className="flex justify-center">
                                            <SignatureIcon signedAt={file.signedAt} />
                                        </div>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="File actions">
                                                <MoreVertical className="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onFilePreview?.(file);
                                                }}
                                            >
                                                <Eye className="w-4 h-4 mr-2" />
                                                Preview
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDownload(file);
                                                }}
                                            >
                                                <Download className="w-4 h-4 mr-2" />
                                                Download
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onShare(file);
                                                }}
                                            >
                                                <Share2 className="w-4 h-4 mr-2" />
                                                Share
                                            </DropdownMenuItem>
                                            {onDuplicate && (
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDuplicate(file);
                                                    }}
                                                >
                                                    <Copy className="w-4 h-4 mr-2" />
                                                    Duplicate
                                                </DropdownMenuItem>
                                            )}
                                            {timestamp?.onClick && (
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        timestamp.onClick?.(file);
                                                    }}
                                                >
                                                    <Clock className="w-4 h-4 mr-2" />
                                                    Blockchain Timestamp
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRename(file, 'file');
                                                }}
                                            >
                                                <Pencil className="w-4 h-4 mr-2" />
                                                Rename
                                            </DropdownMenuItem>
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
                                </td>
                            </motion.tr>
                        ))}
                    </AnimatePresence>
                </motion.tbody>
            </table>
        </div>
    );
}
