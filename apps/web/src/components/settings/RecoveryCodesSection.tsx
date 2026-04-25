/**
 * Shows recovery code status and handles regeneration. Codes are hashed
 * client-side so the server only stores the hash.
 */

import { useState } from "react";
import { Button } from "@stenvault/shared/ui/button";
import { Badge } from "@stenvault/shared/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@stenvault/shared/ui/card";
import { Input } from "@stenvault/shared/ui/input";
import { Label } from "@stenvault/shared/ui/label";
import { Checkbox } from "@stenvault/shared/ui/checkbox";
import {
    Loader2,
    Key,
    RefreshCw,
    Copy,
    Check,
    AlertTriangle,
    Eye,
    EyeOff,
    Download,
    ShieldCheck,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "@stenvault/shared/lib/toast";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@stenvault/shared/ui/dialog";
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from "@/components/ui/alert";
import { useTheme } from "@/contexts/ThemeContext";
import { useMasterKey } from "@/hooks/useMasterKey";
import { deriveRawMasterKeyBytes, generateRecoveryWraps } from "@/hooks/masterKeyCrypto";
import { base64ToArrayBuffer } from "@/lib/platform";
import { generateRecoveryCodes, RECOVERY_CODE_COUNT } from "@/lib/recoveryCodeUtils";
import type { Argon2Params } from "@stenvault/shared/platform/crypto";

/**
 * RecoveryCodesSection Component
 * 
 * Shows recovery codes status and regeneration flow.
 */
export function RecoveryCodesSection() {
    const { theme } = useTheme();
    const { isUnlocked } = useMasterKey();

    // Dialog state
    const [regenerateOpen, setRegenerateOpen] = useState(false);
    const [step, setStep] = useState<'confirm' | 'codes'>('confirm');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [newCodes, setNewCodes] = useState<string[]>([]);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [copiedAll, setCopiedAll] = useState(false);
    const [savedConfirmed, setSavedConfirmed] = useState(false);

    // Get master key status
    const { data: masterKeyStatus, refetch: refetchStatus } = trpc.encryption.getMasterKeyStatus.useQuery();
    // Encryption config gives us the salt + argon2Params + wrapped MK for raw-byte derivation
    const { data: encryptionConfig } = trpc.encryption.getEncryptionConfig.useQuery();

    // Dedicated recovery codes regeneration (no session revocation)
    const regenerateCodesMutation = trpc.encryption.regenerateRecoveryCodes.useMutation();

    const remainingCodes = masterKeyStatus?.recoveryCodesRemaining ?? 0;
    const totalCodes = RECOVERY_CODE_COUNT;

    // Handle regeneration.
    //
    // With dual-wrap, regenerating recovery codes requires re-wrapping the MK once
    // per new code. That requires the RAW MK bytes, which are only recoverable via
    // the password (the cached bundle is non-extractable for XSS hardening). Hence
    // the password prompt — this is both a technical necessity and a security win
    // (stops session-hijack attackers from DoS'ing real codes).
    const handleRegenerate = async () => {
        if (!password.trim()) {
            toast.error('Please enter your Master Password');
            return;
        }

        if (!encryptionConfig?.masterKeyEncrypted || !encryptionConfig?.salt || !encryptionConfig?.argon2Params) {
            toast.error('Encryption config not loaded. Please try again.');
            return;
        }

        setIsRegenerating(true);
        let mkRaw: Uint8Array | null = null;
        try {
            // 1. Derive raw MK bytes (Argon2id → unwrap). Also implicitly verifies password.
            const saltBytes = new Uint8Array(base64ToArrayBuffer(encryptionConfig.salt));
            const argon2Params = encryptionConfig.argon2Params as Argon2Params;
            mkRaw = await deriveRawMasterKeyBytes(
                password,
                saltBytes,
                argon2Params,
                encryptionConfig.masterKeyEncrypted,
            );

            // 2. Generate new recovery codes + aligned wraps (using the same MK bytes).
            const newCodesPlain = generateRecoveryCodes();
            const newRecoveryWraps = await generateRecoveryWraps(
                mkRaw,
                newCodesPlain,
                argon2Params,
            );

            // 3. Atomic replace on the server: codes + wraps.
            await regenerateCodesMutation.mutateAsync({
                newRecoveryCodes: newCodesPlain,
                recoveryWraps: newRecoveryWraps,
            });

            // 4. Show new codes
            setNewCodes(newCodesPlain);
            setStep('codes');
            refetchStatus();
            toast.success('Recovery codes regenerated');
        } catch (error) {
            console.error('Failed to regenerate codes:', error);
            if (error instanceof Error && error.message.includes('OperationError')) {
                toast.error('Incorrect Master Password');
            } else {
                toast.error('Failed to regenerate recovery codes');
            }
        } finally {
            mkRaw?.fill(0);
            setIsRegenerating(false);
        }
    };

    // Copy all codes
    const handleCopyAll = async () => {
        const text = newCodes.join('\n');
        await navigator.clipboard.writeText(text);
        setCopiedAll(true);
        toast.success('Recovery codes copied');
        setTimeout(() => setCopiedAll(false), 3000);
    };

    // Download codes
    const handleDownload = () => {
        const content = [
            'WARNING: This file is NOT encrypted. Store it in a secure location and delete after copying to a safe medium.',
            '',
            '=== StenVault Recovery Codes ===',
            '',
            'Keep these codes in a safe place.',
            'Each code can only be used once.',
            '',
            ...newCodes.map((code, i) => `${i + 1}. ${code}`),
            '',
            `Generated: ${new Date().toISOString()}`,
        ].join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'stenvault-recovery-codes.txt';
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Recovery codes downloaded');
    };

    // Close dialog and reset
    const handleClose = () => {
        setRegenerateOpen(false);
        setStep('confirm');
        setPassword('');
        setNewCodes([]);
        setSavedConfirmed(false);
    };

    // Complete button
    const handleComplete = () => {
        if (!savedConfirmed) {
            toast.error('Please confirm you have saved the codes');
            return;
        }
        handleClose();
    };

    // Don't show if Master Key not configured
    if (!masterKeyStatus?.isConfigured) {
        return null;
    }

    return (
        <>
            <Card className="border-border-strong shadow-sm overflow-hidden">
                <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div
                                className="p-2 rounded-lg shrink-0"
                                style={{ backgroundColor: `${theme.brand.primary}15` }}
                            >
                                <Key
                                    className="w-6 h-6"
                                    style={{ color: theme.brand.primary }}
                                />
                            </div>
                            <div className="min-w-0">
                                <CardTitle>Recovery Codes</CardTitle>
                                <CardDescription>
                                    One-time codes to recover your vault if you forget your password
                                </CardDescription>
                            </div>
                        </div>
                        <Badge
                            variant="secondary"
                            className={`shrink-0 ${remainingCodes < 3 ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : ''}`}
                        >
                            {remainingCodes} / {totalCodes} remaining
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            {remainingCodes < 3 ? (
                                <span className="text-red-600 dark:text-red-400 font-medium">
                                    Low on recovery codes. Consider regenerating before you run out.
                                </span>
                            ) : (
                                'You can regenerate all codes at any time. Old codes will stop working.'
                            )}
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRegenerateOpen(true)}
                            disabled={!isUnlocked}
                        >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Regenerate All
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Regenerate Dialog */}
            <Dialog open={regenerateOpen} onOpenChange={(open) => !open && handleClose()}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {step === 'confirm' ? (
                                <>
                                    <RefreshCw className="w-5 h-5" />
                                    Regenerate Recovery Codes
                                </>
                            ) : (
                                <>
                                    <ShieldCheck className="w-5 h-5 text-green-600" />
                                    New Recovery Codes
                                </>
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            {step === 'confirm'
                                ? 'Enter your Master Password to generate new recovery codes.'
                                : 'Save these codes in a safe place. Your old codes no longer work.'}
                        </DialogDescription>
                    </DialogHeader>

                    {step === 'confirm' ? (
                        <div className="space-y-4">
                            <Alert>
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Warning</AlertTitle>
                                <AlertDescription>
                                    This will invalidate all your existing recovery codes.
                                </AlertDescription>
                            </Alert>

                            <div className="space-y-2">
                                <Label htmlFor="master-password">Master Password</Label>
                                <div className="relative">
                                    <Input
                                        id="master-password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Enter your Master Password"
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={handleClose}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleRegenerate}
                                    disabled={!password.trim() || isRegenerating}
                                >
                                    {isRegenerating ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Regenerating...
                                        </>
                                    ) : (
                                        'Regenerate Codes'
                                    )}
                                </Button>
                            </DialogFooter>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Codes grid */}
                            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                                {newCodes.map((code, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2"
                                    >
                                        <span className="text-muted-foreground text-sm">{index + 1}.</span>
                                        <code data-testid="recovery-code" className="font-mono text-sm tracking-wider">{code}</code>
                                    </div>
                                ))}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={handleCopyAll}
                                    className="flex-1"
                                >
                                    {copiedAll ? (
                                        <Check className="w-4 h-4 mr-2 text-green-600" />
                                    ) : (
                                        <Copy className="w-4 h-4 mr-2" />
                                    )}
                                    {copiedAll ? 'Copied!' : 'Copy All'}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={handleDownload}
                                    className="flex-1"
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Download
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Store this file securely and delete after copying codes to a safe medium.
                            </p>

                            {/* Confirmation checkbox */}
                            <div className="flex items-center gap-3 pt-2">
                                <Checkbox
                                    id="confirm-saved"
                                    checked={savedConfirmed}
                                    onCheckedChange={(checked) => setSavedConfirmed(checked === true)}
                                />
                                <label
                                    htmlFor="confirm-saved"
                                    className="text-sm cursor-pointer text-muted-foreground"
                                >
                                    I have saved my recovery codes in a safe place
                                </label>
                            </div>

                            <DialogFooter>
                                <Button
                                    onClick={handleComplete}
                                    disabled={!savedConfirmed}
                                    className="w-full"
                                >
                                    <Check className="w-4 h-4 mr-2" />
                                    Done
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
