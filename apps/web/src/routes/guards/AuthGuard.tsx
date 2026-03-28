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
import { Navigate } from 'react-router-dom';
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
        return <Navigate to={redirectTo} replace />;
    }

    // Authenticated - render children
    return <>{children}</>;
}

export default AuthGuard;
