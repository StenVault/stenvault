import { cn } from '@/lib/utils';
import { getPasswordStrengthUI } from '@/lib/passwordValidation';

interface PasswordStrengthMeterProps {
    password: string;
    className?: string;
}

export function PasswordStrengthMeter({ password, className }: PasswordStrengthMeterProps) {
    if (!password) return null;

    const strength = getPasswordStrengthUI(password);

    return (
        <div className={cn('space-y-1', className)}>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                    className={cn('h-full transition-all duration-300', strength.color)}
                    style={{ width: strength.width }}
                />
            </div>
            <p className="text-xs text-slate-400">
                Strength: <span className="font-medium">{strength.label}</span>
            </p>
        </div>
    );
}
