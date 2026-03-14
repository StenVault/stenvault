/**
 * EncryptionPanel Component
 *
 * Displays encryption status for file uploads.
 * Encryption is always mandatory via Master Key - no toggle needed.
 */

import { KeyRound, Lock } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';

export function EncryptionPanel() {
    const { theme } = useTheme();

    return (
        <div className={cn(
            'p-4 rounded-lg border transition-all duration-300',
            'border-green-500/50 bg-green-500/5'
        )}>
            <div className="flex items-center gap-3">
                <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${theme.semantic.success}20` }}
                >
                    <KeyRound className="w-5 h-5" style={{ color: theme.semantic.success }} />
                </div>
                <div>
                    <Label className="text-sm font-medium">
                        Automatic Encryption Active
                    </Label>
                    <p className="text-xs text-muted-foreground">
                        Files are encrypted with your Master Key before upload
                    </p>
                </div>
                <div className="ml-auto">
                    <Lock className="w-4 h-4 text-green-500" />
                </div>
            </div>

            {/* Security Info */}
            <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <p className="text-xs text-green-600 dark:text-green-400 leading-relaxed">
                    <strong>Zero-Knowledge:</strong> Your files are encrypted locally using your Master Key.
                    Only you can decrypt them with your Master Password.
                </p>
            </div>
        </div>
    );
}
