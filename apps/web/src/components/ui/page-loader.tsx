/**
 * PageLoader - Shared loading component for route guards and lazy loading
 * 
 * Replaces duplicated DefaultLoader in AuthGuard, GuestGuard, AdminGuard, RootRedirect
 */
import { Loader2, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageLoaderProps {
    /** Text to display below the spinner */
    message?: string;
    /** Whether to show the branded logo version */
    branded?: boolean;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Simple loader for general use
 */
export function PageLoader({
    message,
    branded = false,
    className
}: PageLoaderProps) {
    if (branded) {
        return (
            <div className={cn(
                "min-h-screen flex items-center justify-center bg-[#0F172A]",
                className
            )}>
                <div className="flex flex-col items-center gap-4">
                    {/* Logo */}
                    <div className="w-16 h-16 rounded-2xl bg-[#1E293B] border border-[#334155] flex items-center justify-center animate-pulse">
                        <Shield className="w-8 h-8 text-[#FF4444]" />
                    </div>

                    {/* Loading indicator */}
                    <div className="flex items-center gap-2 text-[#64748B]">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">{message ?? 'Loading...'}</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={cn(
            "min-h-screen flex items-center justify-center bg-background",
            className
        )}>
            <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                {message && (
                    <p className="text-sm text-muted-foreground">{message}</p>
                )}
            </div>
        </div>
    );
}

/**
 * Auth-specific loader with verification message
 */
export function AuthLoader({ message = 'Verifying authentication...' }: { message?: string }) {
    return <PageLoader message={message} />;
}

/**
 * Branded loader for root redirect
 */
export function BrandedLoader({ message = 'Loading...' }: { message?: string }) {
    return <PageLoader message={message} branded />;
}

export default PageLoader;
