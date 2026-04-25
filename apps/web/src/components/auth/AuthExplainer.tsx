import { type ComponentType, type SVGProps } from 'react';
import { cn } from '@stenvault/shared/utils';

type IconType = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

export interface AuthExplainerItem {
    icon: IconType;
    label: string;
    sub: string;
}

interface AuthExplainerProps {
    items: AuthExplainerItem[];
    /** 0-indexed; highlights the cell that represents the user's current moment. */
    current?: number;
    /** Screen-reader title. Omit to render no extra label. */
    srLabel?: string;
    className?: string;
}

/**
 * Three-cell explainer strip for telegraphing the two-password model
 * (Sign-in / Encryption / Files) in the same register as the landing hero.
 * Dumb component — no business state. Consumers own the copy.
 */
export function AuthExplainer({
    items,
    current,
    srLabel,
    className,
}: AuthExplainerProps) {
    return (
        <div
            className={cn(
                'grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-0 sm:divide-x sm:divide-white/[0.06]',
                className
            )}
        >
            {srLabel && <span className="sr-only">{srLabel}</span>}
            {items.map((item, index) => {
                const Icon = item.icon;
                const isCurrent = current === index;
                return (
                    <div
                        key={`${item.label}-${index}`}
                        aria-current={isCurrent ? 'step' : undefined}
                        className={cn(
                            'flex items-start gap-3 sm:flex-col sm:items-center sm:text-center sm:gap-2 sm:px-3 sm:first:pl-0 sm:last:pr-0',
                            'transition-opacity duration-300',
                            current !== undefined && !isCurrent && 'opacity-60'
                        )}
                    >
                        <div
                            aria-hidden="true"
                            className={cn(
                                'shrink-0 w-9 h-9 rounded-full flex items-center justify-center',
                                'bg-violet-500/10 border border-violet-400/20',
                                isCurrent && 'ring-1 ring-violet-400/40 bg-violet-500/15'
                            )}
                        >
                            <Icon className="w-4 h-4 text-violet-300" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-display text-lg leading-tight text-white">
                                {item.label}
                            </p>
                            <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                                {item.sub}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default AuthExplainer;
