/**
 * RootRedirect - Handles the "/" route intelligently
 *
 * - If authenticated: Redirects to /home
 * - If not authenticated: Redirects to /auth/login
 */
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/_core/hooks/useAuth';
import { BrandedLoader } from '@/components/ui/page-loader';

export function RootRedirect() {
    const { isAuthenticated, loading } = useAuth();

    // Show branded loader while checking auth
    if (loading) {
        return <BrandedLoader />;
    }

    // Redirect based on auth status
    if (isAuthenticated) {
        return <Navigate to="/home" replace />;
    }

    return <Navigate to="/auth/login" replace />;
}

export default RootRedirect;
