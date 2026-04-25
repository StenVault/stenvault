/**
 * MasterKeyGuard - Redirects to Master Key setup if not configured,
 * blocks unverified emails, and shows device verification modal
 * for unrecognized devices.
 *
 * Prevents page components from mounting (and firing tRPC queries)
 * until: email is verified, Master Key is configured, and device is verified.
 *
 * Guard chain: AuthGuard → MasterKeyGuard (email + device verify + MK check) → Content
 */
import { ReactNode, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMasterKey } from '@/hooks/useMasterKey';
import { useAuth } from '@/_core/hooks/useAuth';
import { useDeviceVerification } from '@/hooks/useDeviceVerification';
import { DeviceVerificationModal } from '@/components/device-verification/DeviceVerificationModal';
import { EmailVerificationModal } from '@/components/email-verification/EmailVerificationModal';
import { useEmailVerificationContext } from '@/components/email-verification';
import { AuthLoader } from '@stenvault/shared/ui/page-loader';

interface MasterKeyGuardProps {
    children: ReactNode;
}

export function MasterKeyGuard({ children }: MasterKeyGuardProps) {
    const { isConfigured, isLoading, deviceVerificationRequired, emailSendFailed, deviceFingerprint } = useMasterKey();
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const {
        isLoading: isVerifying,
        cooldown,
        verifyWithOTP,
        resendEmail,
    } = useDeviceVerification(deviceFingerprint, deviceVerificationRequired);

    const emailVerification = useEmailVerificationContext();

    const handleLogout = useCallback(() => {
        logout();
    }, [logout]);

    const handleUseRecoveryCode = useCallback(() => {
        navigate('/auth/recovery-code-reset');
    }, [navigate]);

    // Still loading encryption config - don't render children yet
    if (isLoading) {
        return <AuthLoader />;
    }

    // Email not verified — block dashboard to prevent query storm
    if (user && !user.emailVerified) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="w-full max-w-md">
                    <EmailVerificationModal
                        isOpen={true}
                        onClose={() => {}}
                        email={user.email}
                        onVerify={emailVerification.verifyWithOTP}
                        onResend={emailVerification.resendEmail}
                        isLoading={emailVerification.isLoading}
                        cooldown={emailVerification.cooldown}
                        dismissible={false}
                        onLogout={handleLogout}
                    />
                </div>
            </div>
        );
    }

    // Device verification required — show verification modal
    if (deviceVerificationRequired && user) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <DeviceVerificationModal
                    isOpen={true}
                    email={user.email}
                    onVerify={verifyWithOTP}
                    onResend={resendEmail}
                    isLoading={isVerifying}
                    cooldown={cooldown}
                    emailFailed={emailSendFailed}
                    onLogout={handleLogout}
                    onUseRecoveryCode={handleUseRecoveryCode}
                />
            </div>
        );
    }

    // Master Key not configured - redirect to setup
    if (!isConfigured) {
        return <Navigate to="/master-key-setup" replace />;
    }

    // Configured and verified - render children
    return <>{children}</>;
}
