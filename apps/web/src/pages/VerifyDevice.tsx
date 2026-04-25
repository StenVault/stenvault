import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { AuthLayout, AuthCard, AuthButton } from '@/components/auth';

export default function VerifyDevice() {
    const [searchParams] = useSearchParams();
    const setLocation = useNavigate();
    const token = searchParams.get('token');

    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState('');

    const verifyMutation = trpc.auth.verifyDeviceToken.useMutation({
        onSuccess: () => {
            setStatus('success');
        },
        onError: (error) => {
            setStatus('error');
            setErrorMessage(error.message || 'Verification failed');
        },
    });

    useEffect(() => {
        if (token) {
            verifyMutation.mutate({ token });
        } else {
            setStatus('error');
            setErrorMessage('Verification token missing');
        }
     
    }, [token]);

    return (
        <AuthLayout showBackLink={status === 'error'}>
            <AuthCard
                title={
                    status === 'loading' ? 'Verifying device...' :
                        status === 'success' ? 'Device verified' : 'Error'
                }
                description={
                    status === 'loading' ? 'Please wait while we verify your device.' :
                        status === 'success' ? 'Your device has been verified. You can close this tab and return to the original browser.' :
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
                        Back to login
                    </AuthButton>
                )}
            </AuthCard>
        </AuthLayout>
    );
}
