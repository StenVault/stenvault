/**
 * Modal presented after login when the vault is locked — unlocks by
 * deriving KEK from the master password client-side and unwrapping the
 * master key. Password never leaves the browser.
 */

import { useState, useCallback, useEffect } from 'react';
import { ShieldCheck, KeyRound } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@stenvault/shared/ui/dialog';
import { AuthCard, AuthInput, AuthButton } from '@/components/auth';
import { cn } from '@stenvault/shared/utils';
import { useMasterKey } from '@/hooks/useMasterKey';
import { toast } from '@stenvault/shared/lib/toast';
import { toUserMessage } from '@/lib/errorMessages';
import { uiDescription, type UiDescription } from '@stenvault/shared/lib/uiMessage';
import { devLog } from '@/lib/debugLogger';

interface VaultUnlockModalProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Callback when vault is successfully unlocked */
    onUnlock: () => void;
    /** Callback to close the modal without unlocking */
    onClose?: () => void;
    /** Callback for forgot password flow (recovery codes) */
    onForgotPassword?: () => void;
}

export function VaultUnlockModal({
    isOpen,
    onUnlock,
    onClose,
    onForgotPassword,
}: VaultUnlockModalProps) {
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSlowHint, setShowSlowHint] = useState(false);

    const { deriveMasterKey, isDerivingKey, isUnlocked, config } = useMasterKey();

    // Show slow-path hint after 1s of key derivation
    useEffect(() => {
        if (!isDerivingKey) {
            setShowSlowHint(false);
            return;
        }
        const timer = setTimeout(() => setShowSlowHint(true), 1000);
        return () => clearTimeout(timer);
    }, [isDerivingKey]);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setPassword('');
            setShowPassword(false);
            setError(null);
        }
    }, [isOpen]);

    // Auto-close modal if already unlocked
    useEffect(() => {
        if (isOpen && isUnlocked) {
            onUnlock();
        }
    }, [isOpen, isUnlocked, onUnlock]);

    const handleUnlock = useCallback(async () => {
        if (import.meta.env.DEV) devLog('[VaultUnlock] handleUnlock called', { passwordLength: password.length, isDerivingKey, configLoaded: !!config });

        if (!password.trim()) {
            setError('Enter your Encryption Password');
            return;
        }

        setError(null);

        try {
            if (import.meta.env.DEV) devLog('[VaultUnlock] Calling deriveMasterKey...');
            await deriveMasterKey(password);
            if (import.meta.env.DEV) devLog('[VaultUnlock] deriveMasterKey succeeded');
            toast.success('Vault unlocked');
            onUnlock();
        } catch (err) {
            console.error('[VaultUnlock] Failed to unlock:', err);

            let errorMessage: UiDescription;
            if (err instanceof Error) {
                if (err.message.includes('OperationError')) {
                    errorMessage = uiDescription('Incorrect Encryption Password. Try again.');
                } else if (err.message.includes('not configured')) {
                    errorMessage = uiDescription('Encryption not configured. Set it up first.');
                } else {
                    errorMessage = toUserMessage(err).description;
                }
            } else {
                errorMessage = uiDescription('Failed to unlock vault. Try again.');
            }

            setError(errorMessage);
            toast.error('Unlock failed', { description: errorMessage });
        }
    }, [password, deriveMasterKey, onUnlock, isDerivingKey, config]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isDerivingKey) {
            handleUnlock();
        }
    }, [handleUnlock, isDerivingKey]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open && onClose) onClose(); }}>
            <DialogContent
                className="sm:max-w-[440px]"
                showCloseButton={!!onClose}
                onInteractOutside={(e) => { if (!onClose) e.preventDefault(); }}
                onEscapeKeyDown={(e) => { if (!onClose) e.preventDefault(); }}
            >
                {/* DialogTitle kept for a11y (Radix expects it inside DialogContent);
                    visually the AuthCard heading below renders the actual title. */}
                <DialogTitle className="sr-only">Unlock Your Vault</DialogTitle>

                <AuthCard
                    title="Unlock your vault"
                    description="Enter your Encryption Password. It never leaves this device."
                    size="compact"
                    animate={false}
                >
                    <div className="space-y-5">
                        <AuthInput
                            id="master-password"
                            type="password"
                            label="Encryption Password"
                            placeholder="Your encryption password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isDerivingKey}
                            error={error ?? undefined}
                            autoFocus
                            autoComplete="current-password"
                        />

                        {/* Hint surfaces only after a failed attempt, so users don't leak it to shoulder-surfers. */}
                        {error && config?.passwordHint && (
                            <p className="text-xs text-muted-foreground -mt-2">
                                <KeyRound className="inline h-3 w-3 mr-1" />
                                Hint: {config.passwordHint}
                            </p>
                        )}

                        <AuthButton
                            type="button"
                            onClick={handleUnlock}
                            isLoading={isDerivingKey}
                            disabled={!password.trim()}
                            loadingText={showSlowHint ? 'Deriving encryption key…' : 'Unlocking…'}
                            icon={!isDerivingKey ? <ShieldCheck className="w-4 h-4" /> : undefined}
                        >
                            Unlock vault
                        </AuthButton>

                        {!isDerivingKey && (
                            <p className="text-xs text-center text-slate-400 -mt-1">
                                Runs entirely in your browser. Password never transmitted.
                            </p>
                        )}

                        {isDerivingKey && showSlowHint && (
                            <p className="text-xs text-center text-slate-400 -mt-1">
                                Normal on first unlock. Future unlocks are faster.
                            </p>
                        )}

                        {onForgotPassword && (
                            <div className="text-center pt-1">
                                <button
                                    type="button"
                                    onClick={onForgotPassword}
                                    disabled={isDerivingKey}
                                    className={cn(
                                        'inline-block origin-center text-[12px] font-bold py-2 px-1',
                                        'transition-[color,transform] duration-300',
                                        'text-amber-400/80 hover:text-amber-300 hover:scale-x-[1.03]',
                                        'disabled:opacity-50 disabled:cursor-not-allowed',
                                    )}
                                >
                                    Forgot your Encryption Password? Use a recovery code
                                </button>
                            </div>
                        )}
                    </div>
                </AuthCard>
            </DialogContent>
        </Dialog>
    );
}
