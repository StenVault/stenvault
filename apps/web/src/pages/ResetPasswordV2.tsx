import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { startRegistration, finishRegistration } from '@/lib/opaqueClient';
import { toast } from '@stenvault/shared/lib/toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AuthLayout, AuthCard, AuthButton, AuthLink, AuthPasswordPair, AuthSidePanel } from '@/components/auth';

export default function ResetPasswordV2() {
    const setLocation = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isResetting, setIsResetting] = useState(false);

    const opaqueResetStartMutation = trpc.auth.opaqueResetPasswordStart.useMutation();
    const opaqueResetFinishMutation = trpc.auth.opaqueResetPasswordFinish.useMutation();

    useEffect(() => {
        if (!token) {
            toast.error('Invalid reset link');
        }
    }, [token]);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password.length < 12) {
            toast.error('Password must be at least 12 characters');
            return;
        }

        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        try {
            setIsResetting(true);

            // OPAQUE Step 1: Client generates registrationRequest
            const clientReg = await startRegistration(password);

            // OPAQUE Step 2: Server validates token + returns registrationResponse
            const step1 = await opaqueResetStartMutation.mutateAsync({
                token: token!,
                registrationRequest: clientReg.registrationRequest,
            });

            // OPAQUE Step 3: Client finishes registration
            const clientFinish = await finishRegistration(
                password,
                clientReg.clientRegistrationState,
                step1.registrationResponse
            );

            // OPAQUE Step 4: Server stores new record
            await opaqueResetFinishMutation.mutateAsync({
                token: token!,
                registrationRecord: clientFinish.registrationRecord,
            });

            toast.success('Sign-in Password updated — sign in to continue');
            setLocation('/auth/login');
        } catch (error: any) {
            toast.error(error.message || 'Failed to update password');
        } finally {
            setIsResetting(false);
        }
    };

    const resetPasswordSidePanel = (
        <AuthSidePanel headline="Sign-in password only. Your vault is untouched." />
    );

    if (!token) {
        return (
            <AuthLayout sidePanel={resetPasswordSidePanel}>
                <AuthCard title="Invalid link" description="The recovery link is invalid or expired.">
                    <AuthButton variant="secondary" onClick={() => setLocation('/auth/forgot-password')}>Request a new link</AuthButton>
                </AuthCard>
            </AuthLayout>
        );
    }

    const isPending = isResetting || opaqueResetStartMutation.isPending || opaqueResetFinishMutation.isPending;

    return (
        <AuthLayout showBackLink={false} sidePanel={resetPasswordSidePanel}>
            <AuthCard
                title="Set a new Sign-in Password"
                description="Choose your new Sign-in Password."
            >
                <form onSubmit={handleReset} className="space-y-6">
                    <AuthPasswordPair
                        label="New Sign-in Password"
                        confirmLabel="Confirm New Sign-in Password"
                        password={password}
                        confirmPassword={confirmPassword}
                        onPasswordChange={setPassword}
                        onConfirmChange={setConfirmPassword}
                        matchAffirmation
                    />

                    <AuthButton
                        type="submit"
                        isLoading={isPending}
                        disabled={password.length < 12 || password !== confirmPassword}
                        icon={<ArrowRight className="w-4 h-4" />}
                    >
                        Save new Sign-in Password
                    </AuthButton>

                    <div className="text-center pt-2">
                        <AuthLink href="/auth/login" className="text-slate-500">
                            Back to sign in
                        </AuthLink>
                    </div>
                </form>
            </AuthCard>
        </AuthLayout>
    );
}
