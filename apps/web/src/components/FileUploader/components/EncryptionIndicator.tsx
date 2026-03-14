/**
 * EncryptionIndicator Component
 *
 * Shows a banner with per-file encryption progress during upload.
 */

import { ShieldCheck } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useTheme } from '@/contexts/ThemeContext';
import type { EncryptionState } from '../types';

interface EncryptionIndicatorProps {
    encryptionState: EncryptionState;
}

export function EncryptionIndicator({ encryptionState }: EncryptionIndicatorProps) {
    const { theme } = useTheme();
    const { isEncrypting, encryptingCount, totalCount, progress } = encryptionState;

    if (!isEncrypting) {
        return null;
    }

    const label = encryptingCount === 1
        ? 'Encrypting 1 file locally...'
        : `Encrypting ${encryptingCount} of ${totalCount} files locally...`;

    return (
        <div
            className="p-3 rounded-lg border"
            style={{
                backgroundColor: `${theme.semantic.warning}10`,
                borderColor: `${theme.semantic.warning}30`
            }}
        >
            <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 animate-pulse flex-shrink-0" style={{ color: theme.semantic.warning }} />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: theme.semantic.warning }}>
                        {label}
                    </p>
                    {progress > 0 && (
                        <div className="flex items-center gap-2 mt-1.5">
                            <Progress value={progress} className="h-1.5 flex-1" />
                            <span className="text-xs flex-shrink-0" style={{ color: `${theme.semantic.warning}CC` }}>
                                {progress}%
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
