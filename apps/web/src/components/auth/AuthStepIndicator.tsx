import { type ComponentType, type SVGProps } from 'react';
import { cn } from '@stenvault/shared/utils';

type IconType = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

export interface AuthStep {
    icon: IconType;
    label: string;
}

interface AuthStepIndicatorProps {
    variant: 'dots' | 'bars';
    steps: AuthStep[];
    current: number;
    srLabel: string;
    id?: string;
    className?: string;
}

export function AuthStepIndicator({
    variant,
    steps,
    current,
    srLabel,
    id,
    className,
}: AuthStepIndicatorProps) {
    const safeCurrent = Math.min(Math.max(current, 0), steps.length - 1);
    const activeLabel = steps[safeCurrent]?.label ?? '';

    if (variant === 'dots') {
        return (
            <div id={id} className={cn('flex items-center gap-3', className)}>
                <span className="sr-only">{srLabel}</span>
                {steps.map((step, index) => {
                    const Icon = step.icon;
                    const isActive = index <= safeCurrent;
                    const isLast = index === steps.length - 1;
                    return (
                        <div key={`${step.label}-${index}`} className="flex items-center gap-3 flex-1 last:flex-none">
                            <div
                                aria-hidden="true"
                                className={cn(
                                    'flex items-center gap-2 transition-opacity duration-300',
                                    isActive ? 'opacity-100' : 'opacity-50'
                                )}
                            >
                                <div
                                    className={cn(
                                        'w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-300',
                                        isActive
                                            ? 'bg-violet-500/20 border border-violet-400/40'
                                            : 'bg-white/[0.03] border border-white/10'
                                    )}
                                >
                                    <Icon
                                        className={cn(
                                            'w-3.5 h-3.5 transition-colors duration-300',
                                            isActive ? 'text-violet-300' : 'text-slate-400'
                                        )}
                                    />
                                </div>
                                <span
                                    className={cn(
                                        'text-[11px] uppercase tracking-[0.2em] font-bold transition-colors duration-300',
                                        isActive ? 'text-violet-300' : 'text-slate-400'
                                    )}
                                >
                                    {step.label}
                                </span>
                            </div>
                            {!isLast && (
                                <div
                                    aria-hidden="true"
                                    className={cn(
                                        'flex-1 h-px transition-colors duration-500',
                                        isActive
                                            ? 'bg-gradient-to-r from-violet-400/40 via-white/10 to-white/5'
                                            : 'bg-white/5'
                                    )}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <div id={id} className={cn('space-y-2', className)}>
            <span className="sr-only">{srLabel}</span>
            <div className="flex items-center gap-2" aria-hidden="true">
                {steps.map((_, index) => {
                    const isActive = index <= safeCurrent;
                    return (
                        <div
                            key={index}
                            className={cn(
                                'h-1.5 flex-1 rounded-full transition-colors duration-500',
                                isActive ? 'bg-violet-400' : 'bg-white/[0.06]'
                            )}
                        />
                    );
                })}
            </div>
            <p
                aria-hidden="true"
                className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-bold"
            >
                Step {safeCurrent + 1} of {steps.length} — {activeLabel}
            </p>
        </div>
    );
}

export default AuthStepIndicator;
