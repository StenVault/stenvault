/**
 * AuthGuard - Protects private routes
 * Redirects unauthenticated users to the login page
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
    redirectTo = '/auth/login',
    fallback = <AuthLoader />
}: AuthGuardProps) {
    const { isAuthenticated, loading } = useAuth();

    // Still checking auth status
    if (loading) {
        return <>{fallback}</>;
    }

    // Not authenticated - save return URL (strip hash to avoid leaking sensitive fragments)
    if (!isAuthenticated) {
        const returnUrl = window.location.pathname + window.location.search;
        if (returnUrl !== '/auth/login' && returnUrl !== '/') {
            sessionStorage.setItem('stenvault_return_url', returnUrl);
        }
        return <Navigate to={redirectTo} replace />;
    }

    // Authenticated - render children
    return <>{children}</>;
}

export default AuthGuard;
