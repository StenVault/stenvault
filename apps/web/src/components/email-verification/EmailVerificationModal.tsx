import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@stenvault/shared/ui/dialog';
import { Button } from '@stenvault/shared/ui/button';
import { Input } from '@stenvault/shared/ui/input';
import { Mail, Loader2, ShieldCheck, LogOut } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    email: string;
    onVerify: (params: { email: string; otp: string }) => void;
    onResend: (params: { email: string }) => void;
    isLoading: boolean;
    cooldown: number;
    dismissible?: boolean;
    onLogout?: () => void;
}

export function EmailVerificationModal({
    isOpen,
    onClose,
    email,
    onVerify,
    onResend,
    isLoading,
    cooldown,
    dismissible = true,
    onLogout,
}: Props) {
    const [otp, setOtp] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (otp.length === 6) {
            onVerify({ email, otp });
        }
    };

    const handleResend = () => {
        onResend({ email });
    };

    return (
        <Dialog open={isOpen} onOpenChange={dismissible ? onClose : undefined}>
            <DialogContent
                className="sm:max-w-md"
                showCloseButton={dismissible}
                onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
                onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
                onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
            >
                <DialogHeader>
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-violet-500/10 ring-4 ring-violet-500/5">
                        <Mail className="h-7 w-7 text-violet-500" />
                    </div>
                    <DialogTitle className="text-center text-xl">Verify your email</DialogTitle>
                    <DialogDescription className="text-center">
                        {dismissible
                            ? 'To use this feature, you need to verify your email.'
                            : 'We sent a verification code to'}
                        <br />
                        <span className="font-medium text-foreground">{email}</span>
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div className="space-y-3">
                        <label className="text-sm font-medium flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                            Verification code
                        </label>
                        <Input
                            type="text"
                            placeholder="000000"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                            maxLength={6}
                            autoFocus
                            aria-describedby="otp-description"
                        />
                        <p id="otp-description" className="text-xs text-muted-foreground text-center">
                            Enter the 6-digit code sent to your email
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Button
                            type="submit"
                            disabled={otp.length !== 6 || isLoading}
                            className="h-11 bg-violet-600 text-white shadow-lg shadow-violet-500/20 hover:bg-violet-500 hover:shadow-violet-500/40"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Verifying...
                                </>
                            ) : (
                                'Verify'
                            )}
                        </Button>

                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleResend}
                            disabled={cooldown > 0 || isLoading}
                            className="h-11"
                        >
                            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
                        </Button>
                    </div>
                </form>

                <p className="text-xs text-muted-foreground text-center mt-2">
                    Didn't receive the email? Check your spam folder.
                </p>

                {onLogout && (
                    <div className="flex flex-col items-center gap-2 mt-2 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground text-center">
                            Wrong email? Sign out and create a new account with the correct address.
                        </p>
                        <button
                            type="button"
                            onClick={onLogout}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                            <LogOut className="h-3.5 w-3.5" />
                            Sign out
                        </button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
