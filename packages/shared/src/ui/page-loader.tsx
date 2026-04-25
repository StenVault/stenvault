/**
 * PageLoader - Shared loading component for route guards and lazy loading
 */
import { Loader2, Shield } from "lucide-react";
import { cn } from "../utils/cn";

export interface PageLoaderProps {
    message?: string;
    branded?: boolean;
    className?: string;
}

export function PageLoader({
    message,
    branded = false,
    className,
}: PageLoaderProps) {
    if (branded) {
        return (
            <div className={cn(
                "min-h-screen flex items-center justify-center bg-[#0F172A]",
                className,
            )}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-[#1E293B] border border-[#334155] flex items-center justify-center animate-pulse">
                        <Shield className="w-8 h-8 text-[#FF4444]" />
                    </div>
                    <div className="flex items-center gap-2 text-[#64748B]">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">{message ?? "Loading..."}</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={cn(
            "min-h-screen flex items-center justify-center bg-background",
            className,
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

export function AuthLoader({ message = "Verifying authentication..." }: { message?: string }) {
    return <PageLoader message={message} />;
}

export function BrandedLoader({ message = "Loading..." }: { message?: string }) {
    return <PageLoader message={message} branded />;
}

export default PageLoader;
