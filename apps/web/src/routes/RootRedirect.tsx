/**
 * RootRedirect - Handles the "/" route intelligently
 * 
 * - If authenticated: Shows Home/Dashboard
 * - If not authenticated: Redirects to Landing Page
 * 
 * This provides seamless UX without flash of wrong content.
 */
import { Redirect } from 'wouter';
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
        return <Redirect to="/home" />;
    }

    return <Redirect to="/landing" />;
}

export default RootRedirect;
