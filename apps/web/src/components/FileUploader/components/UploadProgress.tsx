/**
 * UploadProgress Component
 * 
 * Displays a list of files being uploaded with their progress.
 */

import { useState } from 'react';
import { FileIcon, CheckCircle2, AlertCircle, Loader2, X, ShieldCheck, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTheme } from '@/contexts/ThemeContext';
import type { UploadFile } from '../types';

interface UploadProgressProps {
    files: UploadFile[];
    onRemove: (id: string) => void;
    onRetry?: (id: string) => void;
}

export function UploadProgress({ files, onRemove, onRetry }: UploadProgressProps) {
    const { theme } = useTheme();

    if (files.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            {files.map((uploadFile) => (
                <UploadProgressItem
                    key={uploadFile.id}
                    file={uploadFile}
                    theme={theme}
                    onRemove={() => onRemove(uploadFile.id)}
                    onRetry={onRetry ? () => onRetry(uploadFile.id) : undefined}
                />
            ))}
        </div>
    );
}

interface UploadProgressItemProps {
    file: UploadFile;
    theme: ReturnType<typeof useTheme>['theme'];
    onRemove: () => void;
    onRetry?: () => void;
}

function UploadProgressItem({ file, theme, onRemove, onRetry }: UploadProgressItemProps) {
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const isActive = file.status === 'uploading' || file.status === 'encrypting';

    const handleRemoveClick = () => {
        if (isActive) {
            setShowCancelConfirm(true);
        } else {
            onRemove();
        }
    };

    return (
        <div className="flex items-center gap-3 p-3 rounded-sm bg-card border border-border/50">
            {/* Preview or icon */}
            {file.previewUrl ? (
                <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 border border-border/50 bg-muted">
                    <img
                        src={file.previewUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                    />
                </div>
            ) : (
                <FileIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            )}

            {/* File name and progress */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                    {file.file.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                    <Progress
                        value={file.progress}
                        className="h-1.5 flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-16 text-right">
                        {file.status === 'encrypting'
                            ? (file.progress > 0 ? `${file.progress}%` : 'Encrypting...')
                            : `${file.progress}%`}
                    </span>
                </div>
                {/* Error message */}
                {file.error && (
                    <p className="text-xs text-red-500 mt-1 truncate">
                        {file.error}
                    </p>
                )}
            </div>

            {/* Status icon and remove button */}
            <div className="flex items-center gap-2">
                {file.status === 'encrypting' && (
                    <ShieldCheck className="w-5 h-5 animate-pulse" style={{ color: theme.semantic.warning }} />
                )}
                {file.status === 'uploading' && (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: theme.brand.primary }} />
                )}
                {file.status === 'completed' && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">Encrypted on your device</span>
                        <CheckCircle2 className="w-5 h-5" style={{ color: theme.semantic.success }} />
                    </div>
                )}
                {file.status === 'error' && (
                    <AlertCircle className="w-5 h-5" style={{ color: theme.semantic.error }} />
                )}
                {file.status === 'error' && onRetry && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={onRetry}
                        title="Retry upload"
                        aria-label="Retry upload"
                    >
                        <RotateCw className="w-4 h-4" />
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleRemoveClick}
                    aria-label="Remove file"
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>

            <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel upload?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This upload is in progress. Are you sure you want to cancel?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep Uploading</AlertDialogCancel>
                        <AlertDialogAction onClick={onRemove}>Cancel Upload</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
