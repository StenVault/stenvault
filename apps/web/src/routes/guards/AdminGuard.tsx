/**
 * AdminGuard - Protects admin-only routes
 * Requires authentication AND admin role
 * 
 * Usage:
 * <AdminGuard>
 *   <AdminPanel />
 * </AdminGuard>
 */
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/_core/hooks/useAuth';
import { PageLoader } from '@/components/ui/page-loader';
import { ShieldX } from 'lucide-react';

interface AdminGuardProps {
    children: ReactNode;
    redirectTo?: string;
    fallback?: ReactNode;
}

function AccessDenied() {
    return (
        <div className="min-h-[60vh] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center px-4">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                    <ShieldX className="w-8 h-8 text-destructive" />
                </div>
                <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
                <p className="text-muted-foreground max-w-md">
                    You do not have permission to access this page.
                    Only administrators can access this resource.
                </p>
                <a
                    href="/"
                    className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                    Back to Home
                </a>
            </div>
        </div>
    );
}

export function AdminGuard({
    children,
    redirectTo,
    fallback = <PageLoader message="Verifying permissions..." />
}: AdminGuardProps) {
    const { user, isAuthenticated, loading } = useAuth();

    // Still checking auth status
    if (loading) {
        return <>{fallback}</>;
    }

    // Not authenticated - redirect to login
    if (!isAuthenticated) {
        return <Navigate to={redirectTo ?? '/auth/login'} replace />;
    }

    // Not admin - show access denied or redirect
    if (user?.role !== 'admin') {
        if (redirectTo) {
            return <Navigate to={redirectTo} replace />;
        }
        return <AccessDenied />;
    }

    // Authenticated AND admin - render children
    return <>{children}</>;
}

export default AdminGuard;
