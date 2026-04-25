/**
 * Shared "save your recovery codes" panel for dashboard-theme flows.
 *
 * Used by RecoveryCodesSection (regenerate) and
 * ChangeEncryptionPasswordDialog (rotate on password change).
 *
 * EncryptionSetup / RecoveryCodeReset use AuthRecoveryCodesGrid (auth
 * theme) and are intentionally kept separate — that component renders
 * against the violet auth background, this one against the dashboard
 * surface tokens.
 */

import { Check, Copy, Download } from 'lucide-react';
import { Button } from '@stenvault/shared/ui/button';
import { Checkbox } from '@stenvault/shared/ui/checkbox';
import { toast } from '@stenvault/shared/lib/toast';
import { useState } from 'react';
import { markRecoveryCodesAcknowledged } from '@/lib/recoveryCodesAck';

interface RecoveryCodesSaveStepProps {
    codes: string[];
    /** If provided, the "I have saved…" checkbox is rendered and wired. */
    confirmed?: boolean;
    onConfirmedChange?: (checked: boolean) => void;
    /** Download filename (defaults to stenvault-recovery-codes.txt). */
    filename?: string;
    /** Extra content rendered above the hint (e.g. an Alert). */
    slot?: React.ReactNode;
}

export function RecoveryCodesSaveStep({
    codes,
    confirmed,
    onConfirmedChange,
    filename = 'stenvault-recovery-codes.txt',
    slot,
}: RecoveryCodesSaveStepProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(codes.join('\n'));
        setCopied(true);
        markRecoveryCodesAcknowledged();
        toast.success('Recovery codes copied');
        setTimeout(() => setCopied(false), 3000);
    };

    const handleDownload = () => {
        const content = [
            'WARNING: This file is NOT encrypted. Store securely and delete after copying to a safe medium.',
            '',
            '=== StenVault Recovery Codes ===',
            '',
            'Keep these codes in a safe place.',
            'Each code can only be used once.',
            '',
            ...codes.map((c, i) => `${i + 1}. ${c}`),
            '',
            `Generated: ${new Date().toISOString()}`,
        ].join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        markRecoveryCodesAcknowledged();
        toast.success('Recovery codes downloaded');
    };

    const showCheckbox = onConfirmedChange !== undefined;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {codes.map((code, index) => (
                    <div
                        key={index}
                        className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2"
                    >
                        <span className="text-muted-foreground text-sm">{index + 1}.</span>
                        <code
                            data-testid="recovery-code"
                            className="font-mono text-sm tracking-wider"
                        >
                            {code}
                        </code>
                    </div>
                ))}
            </div>

            <div className="flex gap-2">
                <Button variant="outline" onClick={handleCopy} className="flex-1">
                    {copied ? (
                        <Check className="w-4 h-4 mr-2 text-[var(--theme-success)]" />
                    ) : (
                        <Copy className="w-4 h-4 mr-2" />
                    )}
                    {copied ? 'Copied!' : 'Copy All'}
                </Button>
                <Button variant="outline" onClick={handleDownload} className="flex-1">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                </Button>
            </div>

            <p className="text-xs text-muted-foreground">
                Store this file securely and delete after copying codes to a safe medium.
            </p>

            {slot}

            {showCheckbox && (
                <div className="flex items-center gap-3 pt-2">
                    <Checkbox
                        id="recovery-codes-saved"
                        checked={!!confirmed}
                        onCheckedChange={(c) => {
                            const checked = c === true;
                            if (checked) markRecoveryCodesAcknowledged();
                            onConfirmedChange(checked);
                        }}
                    />
                    <label
                        htmlFor="recovery-codes-saved"
                        className="text-sm cursor-pointer text-muted-foreground"
                    >
                        I have saved my recovery codes in a safe place
                    </label>
                </div>
            )}
        </div>
    );
}
