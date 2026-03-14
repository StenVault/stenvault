/**
 * DocumentViewer Component
 * 
 * Document viewer for PDFs and other document types.
 */

import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DocumentViewerProps {
    mediaUrl: string;
    mimeType?: string;
    onLoad: () => void;
    onDownload: () => void;
}

export function DocumentViewer({
    mediaUrl,
    mimeType,
    onLoad,
    onDownload,
}: DocumentViewerProps) {
    // PDF files can be displayed in an iframe
    if (mimeType === 'application/pdf') {
        return (
            <iframe
                src={mediaUrl}
                className="w-full h-full"
                onLoad={onLoad}
            />
        );
    }

    // Other document types show a download prompt
    return (
        <div className="flex flex-col items-center justify-center gap-4 text-white">
            <FileText className="w-16 h-16" />
            <p>Preview not available</p>
            <Button onClick={onDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download
            </Button>
        </div>
    );
}

/**
 * UnsupportedFile Component
 * 
 * Displayed when file type cannot be previewed.
 */
export function UnsupportedFile({ onDownload }: { onDownload: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center gap-4 text-white">
            <FileText className="w-16 h-16" />
            <p>Preview not available for this file type</p>
            <Button onClick={onDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download
            </Button>
        </div>
    );
}
