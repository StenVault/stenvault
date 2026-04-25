import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { AuthLayout, AuthCard, AuthButton, AuthSidePanel } from '@/components/auth';

export default function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const setLocation = useNavigate();
    const token = searchParams.get('token');

    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState('');

    const verifyMutation = trpc.auth.verifyEmailToken.useMutation();

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setErrorMessage('Verification token missing');
            return;
        }

        const verify = async () => {
            try {
                const result = await verifyMutation.mutateAsync({ token }) as any;

                // MFA gate: redirect to login with MFA challenge
                if (result?.mfaRequired) {
                    sessionStorage.setItem('mfaToken', result.mfaToken);
                    setLocation('/auth/login?mfa=true');
                    return;
                }

                setStatus('success');
                setTimeout(() => setLocation('/home'), 2000);
            } catch (error: any) {
                setStatus('error');
                setErrorMessage(error.message || 'Try again or request a new verification link.');
            }
        };

        verify();
    }, [token]);

    const verifyEmailSidePanel = (
        <AuthSidePanel
            headline={
                status === 'error' ? "Link didn't work. Ask for a new one." :
                    status === 'success' ? "You're in." :
                        "Confirming your email."
            }
        />
    );

    return (
        <AuthLayout showBackLink={status === 'error'} sidePanel={verifyEmailSidePanel}>
            <AuthCard
                title={
                    status === 'loading' ? 'Verifying…' :
                        status === 'success' ? 'Email verified' : 'Verification failed'
                }
                description={
                    status === 'loading' ? 'Wait a second while we confirm your identity.' :
                        status === 'success' ? 'Your account is now active. Redirecting…' :
                            errorMessage
                }
            >
                <div className="flex justify-center py-6">
                    {status === 'loading' && <Loader2 className="w-12 h-12 animate-spin text-violet-500" />}
                    {status === 'success' && <CheckCircle className="w-12 h-12 text-emerald-500" />}
                    {status === 'error' && <XCircle className="w-12 h-12 text-red-500" />}
                </div>

                {status === 'error' && (
                    <AuthButton onClick={() => setLocation('/auth/login')}>
                        Back to sign in
                    </AuthButton>
                )}

                {status === 'success' && (
                    <AuthButton variant="secondary" onClick={() => setLocation('/home')}>
                        Go to home
                    </AuthButton>
                )}
            </AuthCard>
        </AuthLayout>
    );
}
