/**
 * AuthGuard - Protects private routes
 * Redirects unauthenticated users to the landing page
 * 
 * Usage:
 * <AuthGuard>
 *   <ProtectedComponent />
 * </AuthGuard>
 */
import { ReactNode } from 'react';
import { Redirect } from 'wouter';
import { useAuth } from '@/_core/hooks/useAuth';
import { AuthLoader } from '@/components/ui/page-loader';

interface AuthGuardProps {
    children: ReactNode;
    redirectTo?: string;
    fallback?: ReactNode;
}

export function AuthGuard({
    children,
    redirectTo = '/landing',
    fallback = <AuthLoader />
}: AuthGuardProps) {
    const { isAuthenticated, loading } = useAuth();

    // Still checking auth status
    if (loading) {
        return <>{fallback}</>;
    }

    // Not authenticated - redirect to landing
    if (!isAuthenticated) {
        return <Redirect to={redirectTo} />;
    }

    // Authenticated - render children
    return <>{children}</>;
}

export default AuthGuard;
