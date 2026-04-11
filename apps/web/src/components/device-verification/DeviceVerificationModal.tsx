import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Monitor, Loader2, ShieldCheck } from 'lucide-react';

interface Props {
    isOpen: boolean;
    email: string;
    onVerify: (otp: string) => void;
    onResend: () => void;
    isLoading: boolean;
    cooldown: number;
}

export function DeviceVerificationModal({
    isOpen,
    email,
    onVerify,
    onResend,
    isLoading,
    cooldown,
}: Props) {
    const [otp, setOtp] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (otp.length === 6) {
            onVerify(otp);
        }
    };

    return (
        <Dialog open={isOpen}>
            <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 ring-4 ring-primary/5">
                        <Monitor className="h-7 w-7 text-primary" />
                    </div>
                    <DialogTitle className="text-center text-xl">New device detected</DialogTitle>
                    <DialogDescription className="text-center">
                        We sent a verification code to
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
                            aria-describedby="device-otp-description"
                        />
                        <p id="device-otp-description" className="text-xs text-muted-foreground text-center">
                            Enter the 6-digit code or click the link in the email
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Button
                            type="submit"
                            disabled={otp.length !== 6 || isLoading}
                            className="h-11"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Verifying...
                                </>
                            ) : (
                                'Verify device'
                            )}
                        </Button>

                        <Button
                            type="button"
                            variant="outline"
                            onClick={onResend}
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
            </DialogContent>
        </Dialog>
    );
}
