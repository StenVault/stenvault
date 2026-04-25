import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from '@stenvault/shared/lib/toast';
import { ArrowRight, ShieldCheck, AlertTriangle } from 'lucide-react';
import { AuthLayout, AuthCard, AuthInput, AuthButton, AuthDivider, AuthLink, AuthSidePanel } from '@/components/auth';

export default function ForgotPasswordV2() {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const sendResetMutation = trpc.auth.sendPasswordReset.useMutation();

    const handleSendReset = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await sendResetMutation.mutateAsync({ email });
            setSent(true);
            toast.success('Reset link sent — check your email');
        } catch (error: any) {
            toast.error(error.message || 'Failed to send reset email');
        }
    };

    const forgotPasswordSidePanel = (
        <AuthSidePanel headline="A new sign-in key. Your files stay where they are." />
    );

    return (
        <AuthLayout showBackLink={!sent} sidePanel={forgotPasswordSidePanel}>
            <AuthCard
                title={sent ? 'Check your email' : 'Reset your Sign-in Password'}
                description={
                    sent
                        ? `If ${email} has an account, you'll receive a reset link shortly.`
                        : "We'll email a reset link. Files live behind a different key."
                }
            >
                {!sent ? (
                    <form onSubmit={handleSendReset} className="space-y-6">
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-200/90">
                                <p className="font-medium text-amber-200 mb-1">
                                    Lost your Encryption Password instead?
                                </p>
                                <p>
                                    Sign in first with your Sign-in Password — your recovery code option appears once the vault asks you to unlock.
                                </p>
                            </div>
                        </div>
                        <AuthInput
                            id="email"
                            type="email"
                            label="Email Address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@gmail.com"
                            required
                        />

                        <AuthButton
                            type="submit"
                            isLoading={sendResetMutation.isPending}
                            icon={<ArrowRight className="w-4 h-4" />}
                        >
                            Email me a reset link
                        </AuthButton>
                    </form>
                ) : (
                    <div className="space-y-6">
                        <div className="flex flex-col items-center gap-4 py-2 text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15">
                                <ShieldCheck className="w-8 h-8 text-emerald-300" />
                            </div>
                            <p className="text-sm text-slate-400 max-w-xs">
                                If an account exists, you will receive an email shortly.
                            </p>
                        </div>
                        <div className="text-center">
                            <button
                                type="button"
                                onClick={() => setSent(false)}
                                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                            >
                                Can&apos;t find it? Try again.
                            </button>
                        </div>
                    </div>
                )}

                <AuthDivider text="Alternatives" />

                <div className="text-center space-y-2">
                    <AuthLink href="/auth/login" className="text-slate-400">
                        Back to sign in
                    </AuthLink>
                    <p className="text-[11px] text-slate-400">
                        Have a Trusted Circle set up?{' '}
                        <AuthLink href="/recover" className="text-slate-300">
                            Recover with your circle
                        </AuthLink>
                    </p>
                </div>
            </AuthCard>
        </AuthLayout>
    );
}
