/**
 * AttachmentPreview - Preview de arquivo anexado compartilhado
 *
 * Usado por:
 * - AI Chat (ChatInput)
 * - P2P Chat (ChatInput, MessageBubble)
 *
 * @updated 2026-02-02 - Added memoization
 */
import { memo } from "react";
import { cn } from "@stenvault/shared/utils";
import { Button } from "@stenvault/shared/ui/button";
import {
    X,
    FileText,
    Image as ImageIcon,
    Video as VideoIcon,
    Music,
    File,
    Download
} from "lucide-react";
import { formatBytes } from "@/utils/formatters";
import { type FileTypeNoFolder, getFileTypeFromMime } from "@stenvault/shared";

/**
 * Chat-specific file type - uses shared FileTypeNoFolder for consistency
 */
export type FileType = FileTypeNoFolder;

/** Determina o tipo baseado no mimeType */
export const getFileType = (mimeType: string): FileType => getFileTypeFromMime(mimeType);

/** Retorna o ícone apropriado para o tipo */
export function getFileIcon(type: FileType) {
    switch (type) {
        case "image": return ImageIcon;
        case "video": return VideoIcon;
        case "audio": return Music;
        case "document": return FileText;
        case "other":
        default: return File;
    }
}

/** Formata tamanho de arquivo para exibição - uses centralized formatBytes */
export const formatFileSize = formatBytes;

interface AttachmentPreviewProps {
    /** Nome do arquivo */
    fileName: string;
    /** Tamanho em bytes (opcional) */
    fileSize?: number;
    /** Tipo MIME ou tipo derivado */
    mimeType?: string;
    fileType?: FileType;
    /** Callback para remover */
    onRemove?: () => void;
    /** Callback para download */
    onDownload?: () => void;
    /** URL para preview/link */
    fileUrl?: string;
    /** Variante de estilo */
    variant?: "default" | "compact" | "inline";
    /** Se está própria mensagem (estilo diferente) */
    isOwn?: boolean;
    /** Classes adicionais */
    className?: string;
}

/**
 * Componente reutilizável para preview de arquivos anexados
 * Memoized to prevent unnecessary re-renders in lists
 */
export const AttachmentPreview = memo(function AttachmentPreview({
    fileName,
    fileSize,
    mimeType,
    fileType: explicitType,
    onRemove,
    onDownload,
    fileUrl,
    variant = "default",
    isOwn = false,
    className,
}: AttachmentPreviewProps) {
    const type = explicitType || (mimeType ? getFileType(mimeType) : "other");
    const Icon = getFileIcon(type);

    // Compact variant - usado em listas de anexos
    if (variant === "compact") {
        return (
            <div
                className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm",
                    isOwn ? "bg-white/10" : "bg-muted",
                    className
                )}
            >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="max-w-[150px] truncate">{fileName}</span>
                {onRemove && (
                    <button
                        onClick={onRemove}
                        className="hover:text-destructive transition-colors ml-1"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}
            </div>
        );
    }

    // Inline variant - usado em links de mensagens
    if (variant === "inline") {
        const Wrapper = fileUrl ? "a" : "div";
        const wrapperProps = fileUrl
            ? { href: fileUrl, target: "_blank", rel: "noopener noreferrer" }
            : {};

        return (
            <Wrapper
                {...wrapperProps}
                className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors",
                    fileUrl ? "hover:bg-muted/80 cursor-pointer" : "",
                    isOwn ? "bg-white/10" : "bg-muted",
                    className
                )}
            >
                <Icon className="w-3 h-3" />
                <span className="max-w-[100px] truncate">{fileName}</span>
            </Wrapper>
        );
    }

    // Default variant - preview completo com detalhes
    return (
        <div
            className={cn(
                "flex items-center gap-3 p-3 rounded-lg border-2 min-w-[200px]",
                isOwn
                    ? "bg-white/10 border-white/20"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
                className
            )}
        >
            {/* Ícone */}
            <div
                className={cn(
                    "p-2 rounded-lg",
                    isOwn
                        ? "bg-white/20"
                        : "bg-indigo-100 dark:bg-indigo-900"
                )}
            >
                <Icon
                    className={cn(
                        "h-5 w-5",
                        isOwn
                            ? "text-white"
                            : "text-indigo-600 dark:text-indigo-400"
                    )}
                />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p
                    className={cn(
                        "text-sm font-medium truncate",
                        isOwn ? "text-white" : "text-slate-900 dark:text-slate-100"
                    )}
                >
                    {fileName}
                </p>
                {fileSize !== undefined && (
                    <p
                        className={cn(
                            "text-xs",
                            isOwn ? "text-white/70" : "text-slate-500 dark:text-slate-400"
                        )}
                    >
                        {formatFileSize(fileSize)} • {type}
                    </p>
                )}
            </div>

            {/* Ações */}
            {onRemove && (
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={onRemove}
                    className={cn(
                        "flex-shrink-0",
                        isOwn
                            ? "hover:bg-white/20 text-white"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                >
                    <X className="h-4 w-4" />
                </Button>
            )}
            {onDownload && (
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={onDownload}
                    className={cn(
                        "flex-shrink-0",
                        isOwn
                            ? "hover:bg-white/20 text-white"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                >
                    <Download className="h-4 w-4" />
                </Button>
            )}
        </div>
    );
});
