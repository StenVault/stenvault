import { type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { AuthInput } from './AuthCard';

interface AuthPasswordPairProps {
    label: string;
    confirmLabel: string;
    password: string;
    confirmPassword: string;
    onPasswordChange: (value: string) => void;
    onConfirmChange: (value: string) => void;
    strengthSlot?: ReactNode;
    matchAffirmation?: boolean;
    autoComplete?: string;
    passwordPlaceholder?: string;
    confirmPlaceholder?: string;
    passwordId?: string;
    confirmId?: string;
    mismatchMessage?: string;
    disabled?: boolean;
}

export function AuthPasswordPair({
    label,
    confirmLabel,
    password,
    confirmPassword,
    onPasswordChange,
    onConfirmChange,
    strengthSlot,
    matchAffirmation = false,
    autoComplete = 'new-password',
    passwordPlaceholder,
    confirmPlaceholder = 'Enter it again',
    passwordId = 'password',
    confirmId = 'confirmPassword',
    mismatchMessage = 'Passwords do not match',
    disabled,
}: AuthPasswordPairProps) {
    const hasConfirmInput = confirmPassword.length > 0;
    const matches = password === confirmPassword;
    const showMismatch = hasConfirmInput && !matches;
    const showMatch = matchAffirmation && hasConfirmInput && matches && password.length > 0;

    return (
        <div className="space-y-4">
            <AuthInput
                id={passwordId}
                type="password"
                label={label}
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder={passwordPlaceholder}
                autoComplete={autoComplete}
                disabled={disabled}
                required
            />
            {strengthSlot}
            <AuthInput
                id={confirmId}
                type="password"
                label={confirmLabel}
                value={confirmPassword}
                onChange={(e) => onConfirmChange(e.target.value)}
                placeholder={confirmPlaceholder}
                autoComplete={autoComplete}
                error={showMismatch ? mismatchMessage : undefined}
                disabled={disabled}
                required
            />
            {showMatch && (
                <p className="text-xs text-emerald-400 flex items-center gap-1 -mt-2">
                    <Check className="w-3 h-3" /> Passwords match
                </p>
            )}
        </div>
    );
}

export default AuthPasswordPair;
