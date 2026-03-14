/**
 * PreviewHeader Component
 *
 * Header for the FilePreviewModal with title, signature badge, and action buttons.
 */

import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SignatureBadge } from './SignatureBadge';
import { TimestampBadge } from '@/components/files/components/TimestampBadge';
import type { SignatureVerificationState } from '../types';
import type { TimestampStatus } from '@cloudvault/shared';

interface PreviewHeaderProps {
    filename: string;
    signatureState?: SignatureVerificationState | null;
    timestampStatus?: TimestampStatus | null;
    onTimestampClick?: () => void;
    onDownload: () => void;
    onClose: () => void;
}

export function PreviewHeader({
    filename,
    signatureState,
    timestampStatus,
    onTimestampClick,
    onDownload,
    onClose,
}: PreviewHeaderProps) {
    return (
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                    <DialogTitle className="truncate max-w-[60%]">{filename}</DialogTitle>
                    {/* Signature Badge (Phase 3.4 Sovereign) */}
                    {signatureState && (
                        <SignatureBadge signatureState={signatureState} />
                    )}
                    {/* Timestamp Badge */}
                    {timestampStatus && (
                        <TimestampBadge
                            status={timestampStatus}
                            compact
                            onClick={onTimestampClick}
                        />
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={onDownload} title="Download" aria-label="Download">
                        <Download className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={onClose} title="Close" aria-label="Close">
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </DialogHeader>
    );
}
