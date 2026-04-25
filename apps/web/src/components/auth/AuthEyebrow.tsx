import { type ReactNode } from 'react';
import { cn } from '@stenvault/shared/utils';

interface AuthEyebrowProps {
    children: ReactNode;
    className?: string;
    id?: string;
}

/**
 * Small uppercase label sitting above a screen or section title to carry
 * secondary context (step number, verification stage, etc.). Matches the
 * tracking and weight of AuthDivider and AuthStepIndicator bars so
 * meta-information reads as one visual family across the funnel.
 */
export function AuthEyebrow({ children, className, id }: AuthEyebrowProps) {
    return (
        <p
            id={id}
            className={cn(
                'text-[11px] uppercase tracking-[0.2em] font-bold text-slate-500',
                className
            )}
        >
            {children}
        </p>
    );
}

export default AuthEyebrow;
