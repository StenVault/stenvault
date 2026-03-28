/**
 * GuestGuard - Protects guest-only routes (login, register)
 * Redirects authenticated users to the dashboard
 * 
 * Prevents logged-in users from seeing login/register pages
 * 
 * Usage:
 * <GuestGuard>
 *   <LoginPage />
 * </GuestGuard>
 */
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/_core/hooks/useAuth';
import { PageLoader } from '@/components/ui/page-loader';

interface GuestGuardProps {
    children: ReactNode;
    redirectTo?: string;
    fallback?: ReactNode;
}

export function GuestGuard({
    children,
    redirectTo = '/home',  // Default to home, not root (avoids redirect loop)
    fallback = <PageLoader />
}: GuestGuardProps) {
    const { isAuthenticated, loading } = useAuth();

    // Still checking auth status
    if (loading) {
        return <>{fallback}</>;
    }

    // Already authenticated - redirect to home/dashboard
    if (isAuthenticated) {
        return <Navigate to={redirectTo} replace />;
    }

    // Not authenticated - render children (login/register page)
    return <>{children}</>;
}

export default GuestGuard;
