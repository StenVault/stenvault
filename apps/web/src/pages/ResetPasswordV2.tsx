import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { startRegistration, finishRegistration } from '@/lib/opaqueClient';
import { toast } from '@stenvault/shared/lib/toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AuthLayout, AuthCard, AuthInput, AuthButton, AuthLink } from '@/components/auth';

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

            toast.success('Password updated');
            setLocation('/auth/login');
        } catch (error: any) {
            toast.error(error.message || 'Failed to update password');
        } finally {
            setIsResetting(false);
        }
    };

    if (!token) {
        return (
            <AuthLayout>
                <AuthCard title="Invalid Link" description="The recovery link is invalid or expired.">
                    <AuthButton variant="secondary" onClick={() => setLocation('/auth/forgot-password')}>Request New Link</AuthButton>
                </AuthCard>
            </AuthLayout>
        );
    }

    const isPending = isResetting || opaqueResetStartMutation.isPending || opaqueResetFinishMutation.isPending;

    return (
        <AuthLayout showBackLink={false}>
            <AuthCard
                title="New Password"
                description="Secure your account with a new master password."
            >
                <form onSubmit={handleReset} className="space-y-6">
                    <AuthInput
                        id="password"
                        type="password"
                        label="New Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                    />

                    <AuthInput
                        id="confirmPassword"
                        type="password"
                        label="Repeat Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                    />

                    <AuthButton
                        type="submit"
                        isLoading={isPending}
                        icon={<ArrowRight className="w-4 h-4" />}
                    >
                        Update Password
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
