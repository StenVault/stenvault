/**
 * File Info Card
 * Displays the file being shared with name and size
 */
import { Share2 } from "lucide-react";
import { formatBytes } from "@stenvault/shared";

interface FileInfoCardProps {
    fileName: string;
    fileSize?: number;
}

export function FileInfoCard({ fileName, fileSize }: FileInfoCardProps) {
    return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Share2 className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{fileName}</p>
                {fileSize && (
                    <p className="text-xs text-muted-foreground">
                        {formatBytes(fileSize)}
                    </p>
                )}
            </div>
        </div>
    );
}
