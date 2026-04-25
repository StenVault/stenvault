import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from '@stenvault/shared/lib/toast';
import { Mail, ArrowRight, Check, RefreshCw } from 'lucide-react';
import { AuthLayout, AuthCard, AuthInput, AuthButton, AuthDivider, AuthLink } from '@/components/auth';

export default function ForgotPasswordV2() {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const sendResetMutation = trpc.auth.sendPasswordReset.useMutation();

    const handleSendReset = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await sendResetMutation.mutateAsync({ email });
            setSent(true);
            toast.success('Reset email sent');
        } catch (error: any) {
            toast.error(error.message || 'Failed to send reset email');
        }
    };

    return (
        <AuthLayout>
            <AuthCard
                title={sent ? 'Check your mail' : 'Recover Access'}
                description={
                    sent
                        ? `A recovery link has been sent to ${email}.`
                        : 'Forgot your password? Enter your email to regain access.'
                }
            >
                {!sent ? (
                    <form onSubmit={handleSendReset} className="space-y-6">
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
                            Send Recovery Link
                        </AuthButton>
                    </form>
                ) : (
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                            <Check className="w-5 h-5 text-green-500" />
                            <p className="text-sm text-slate-400">If an account exists, you will receive an email shortly.</p>
                        </div>
                        <AuthButton
                            variant="secondary"
                            onClick={() => setSent(false)}
                            icon={<RefreshCw className="w-4 h-4" />}
                        >
                            Try again
                        </AuthButton>
                    </div>
                )}

                <div className="text-center">
                    <AuthLink href="/auth/recovery-code-reset" className="text-slate-400">
                        Have a recovery code?
                    </AuthLink>
                </div>

                <AuthDivider text="Preference" />

                <div className="text-center">
                    <AuthLink href="/auth/login" className="text-slate-500">
                        Back to sign in
                    </AuthLink>
                </div>
            </AuthCard>
        </AuthLayout>
    );
}
