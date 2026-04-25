import { useState } from 'react';
import { Copy, Check, Download } from 'lucide-react';
import { toast } from '@stenvault/shared/lib/toast';
import { AuthButton } from './AuthCard';

interface AuthRecoveryCodesGridProps {
    codes: string[];
    filename?: string;
    onCopied?: () => void;
    onDownloaded?: () => void;
}

export function AuthRecoveryCodesGrid({
    codes,
    filename = 'stenvault-recovery-codes.txt',
    onCopied,
    onDownloaded,
}: AuthRecoveryCodesGridProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(codes.join('\n'));
        setCopied(true);
        toast.success('Recovery codes copied to clipboard');
        onCopied?.();
        setTimeout(() => setCopied(false), 3000);
    };

    const handleDownload = () => {
        const content = [
            '=== StenVault Recovery Codes ===',
            '',
            'Keep these codes in a safe place.',
            'Each code can only be used once.',
            '',
            ...codes.map((code, i) => `${i + 1}. ${code}`),
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
        toast.success('Recovery codes downloaded');
        onDownloaded?.();
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {codes.map((code, index) => (
                    <div
                        key={index}
                        className="flex items-center justify-between bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2"
                    >
                        <span className="text-slate-500 text-sm mr-2">{index + 1}.</span>
                        <code
                            data-testid="recovery-code"
                            className="font-mono text-emerald-300 text-sm tracking-wider"
                        >
                            {code}
                        </code>
                    </div>
                ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
                <AuthButton
                    variant="secondary"
                    onClick={handleCopy}
                    icon={copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                >
                    {copied ? 'Copied!' : 'Copy all'}
                </AuthButton>
                <AuthButton
                    variant="secondary"
                    onClick={handleDownload}
                    icon={<Download className="w-4 h-4" />}
                >
                    Download
                </AuthButton>
            </div>
        </div>
    );
}

export default AuthRecoveryCodesGrid;
