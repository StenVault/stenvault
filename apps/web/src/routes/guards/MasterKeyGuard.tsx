/**
 * MasterKeyGuard - Redirects to Master Key setup if not configured,
 * and shows device verification modal for unrecognized devices.
 *
 * Prevents page components from mounting (and firing tRPC queries)
 * until the Master Key is confirmed as configured and the device is verified.
 *
 * Guard chain: AuthGuard → MasterKeyGuard (device verify + MK check) → Content
 */
import { ReactNode, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMasterKey } from '@/hooks/useMasterKey';
import { useAuth } from '@/_core/hooks/useAuth';
import { useDeviceVerification } from '@/hooks/useDeviceVerification';
import { DeviceVerificationModal } from '@/components/device-verification/DeviceVerificationModal';
import { AuthLoader } from '@/components/ui/page-loader';

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
