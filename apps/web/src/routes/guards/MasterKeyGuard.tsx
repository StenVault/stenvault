/**
 * MasterKeyGuard - Redirects to Master Key setup if not configured
 *
 * Prevents page components from mounting (and firing tRPC queries)
 * until the Master Key is confirmed as configured. This avoids race
 * conditions where protectedVerifiedProcedure queries trigger the
 * email verification modal before the redirect can happen.
 *
 * Usage:
 * <AuthGuard>
 *   <MasterKeyGuard>
 *     <ProtectedComponent />
 *   </MasterKeyGuard>
 * </AuthGuard>
 */
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useMasterKey } from '@/hooks/useMasterKey';
import { AuthLoader } from '@/components/ui/page-loader';

interface MasterKeyGuardProps {
    children: ReactNode;
}

export function MasterKeyGuard({ children }: MasterKeyGuardProps) {
    const { isConfigured, isLoading } = useMasterKey();

    // Still loading encryption config - don't render children yet
    if (isLoading) {
        return <AuthLoader />;
    }

    // Master Key not configured - redirect to setup
    if (!isConfigured) {
        return <Navigate to="/master-key-setup" replace />;
    }

    // Configured - render children
    return <>{children}</>;
}
