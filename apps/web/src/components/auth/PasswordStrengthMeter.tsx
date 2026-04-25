import { cn } from '@stenvault/shared/utils';
import { getPasswordStrengthUI, type PasswordStrengthScore } from '@/lib/passwordValidation';

interface PasswordStrengthMeterProps {
    password: string;
    className?: string;
}

const TOTAL_SEGMENTS = 8;

// Tiers increment discretely: Weak/Weak/Fair/Good/Strong/Excellent.
// A continuous bar made Fair and Good look nearly identical; segmented
// steps read as tier jumps the way 1Password's meter does.
const SCORE_TO_FILLED: Record<PasswordStrengthScore, number> = {
    0: 0,
    1: 2,
    2: 3,
    3: 5,
    4: 7,
    5: 8,
};

export function PasswordStrengthMeter({ password, className }: PasswordStrengthMeterProps) {
    if (!password) return null;

    const strength = getPasswordStrengthUI(password);
    const filled = SCORE_TO_FILLED[strength.score];

    return (
        <div className={cn('space-y-1', className)}>
            <div
                className="flex items-center gap-1"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={TOTAL_SEGMENTS}
                aria-valuenow={filled}
                aria-label={`Password strength: ${strength.label}`}
            >
                {Array.from({ length: TOTAL_SEGMENTS }).map((_, i) => (
                    <div
                        key={i}
                        className={cn(
                            'h-1.5 flex-1 rounded-full transition-colors duration-200',
                            i < filled ? strength.color : 'bg-white/[0.05]'
                        )}
                    />
                ))}
            </div>
            <p className="text-xs text-slate-400">
                Strength: <span className={cn('font-medium', strength.labelColor)}>{strength.label}</span>
            </p>
        </div>
    );
}
