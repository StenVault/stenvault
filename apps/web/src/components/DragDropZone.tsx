/**
 * Drag and Drop Zone for Chat Attachments
 */
import { useCallback, useState } from "react";
import { Upload, FileIcon, Image as ImageIcon, FileText, Code } from "lucide-react";
import { cn } from "@stenvault/shared/utils";

interface DragDropZoneProps {
    onFilesSelected: (files: File[]) => void;
    maxFiles?: number;
    accept?: string;
    disabled?: boolean;
    children?: React.ReactNode;
    className?: string;
}

export function DragDropZone({
    onFilesSelected,
    maxFiles = 5,
    accept,
    disabled = false,
    children,
    className,
}: DragDropZoneProps) {
    const [isDragging, setIsDragging] = useState(false);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDragIn = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0 && !disabled) {
            setIsDragging(true);
        }
    }, [disabled]);

    const handleDragOut = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (disabled) return;

        const files = Array.from(e.dataTransfer.files);
        if (files && files.length > 0) {
            const selectedFiles = files.slice(0, maxFiles);
            onFilesSelected(selectedFiles);
        }
    }, [disabled, maxFiles, onFilesSelected]);

    return (
        <div
            onDragEnter={handleDragIn}
            onDragLeave={handleDragOut}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn("relative w-full h-full", className)}
        >
            {children}

            {/* Drag Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 bg-indigo-500/10 backdrop-blur-sm border-2 border-dashed border-indigo-500 rounded-xl flex items-center justify-center animate-in fade-in duration-200">
                    <div className="text-center p-8">
                        <div className="mb-4 flex justify-center">
                            <div className="p-4 rounded-full bg-indigo-500/20">
                                <Upload className="w-12 h-12 text-indigo-600 dark:text-indigo-400 animate-bounce" />
                            </div>
                        </div>
                        <p className="text-lg font-semibold text-indigo-700 dark:text-indigo-300 mb-1">
                            Drop files here
                        </p>
                        <p className="text-sm text-indigo-600/70 dark:text-indigo-400/70">
                            Up to {maxFiles} file(s)
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

interface FilePreviewCardProps {
    fileName: string;
    fileSize: number;
    fileType: 'image' | 'document' | 'code' | 'other';
    preview?: string;
    progress?: number;
    onRemove?: () => void;
}

export function FilePreviewCard({
    fileName,
    fileSize,
    fileType,
    preview,
    progress,
    onRemove,
}: FilePreviewCardProps) {
    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const getIcon = () => {
        switch (fileType) {
            case 'image':
                return <ImageIcon className="w-5 h-5 text-blue-500" />;
            case 'document':
                return <FileText className="w-5 h-5 text-orange-500" />;
            case 'code':
                return <Code className="w-5 h-5 text-purple-500" />;
            default:
                return <FileIcon className="w-5 h-5 text-gray-500" />;
        }
    };

    return (
        <div className="relative group bg-muted/50 border rounded-lg p-3 flex items-center gap-3 hover:bg-muted transition-colors">
            {/* Icon or Image Preview */}
            <div className="w-12 h-12 rounded bg-background flex items-center justify-center shrink-0 overflow-hidden">
                {preview && fileType === 'image' ? (
                    <img src={preview} alt={fileName} className="w-full h-full object-cover" />
                ) : (
                    getIcon()
                )}
            </div>

            {/* File Info */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground">{formatSize(fileSize)}</p>

                {/* Progress Bar */}
                {progress !== undefined && progress < 100 && (
                    <div className="mt-1 w-full bg-muted-foreground/20 rounded-full h-1 overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}
            </div>

            {/* Remove Button */}
            {onRemove && (
                <button
                    onClick={onRemove}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded text-destructive"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}
        </div>
    );
}
