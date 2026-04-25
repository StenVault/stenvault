import { useEffect, useRef, type InputHTMLAttributes } from 'react';
import { cn } from '@stenvault/shared/utils';

type OTPVariant = 'numeric' | 'alphanumeric-with-backup';

interface AuthOTPInputProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type' | 'maxLength' | 'pattern' | 'inputMode' | 'autoComplete'> {
    length: number;
    value: string;
    onChange: (value: string) => void;
    onComplete?: (value: string) => void;
    variant?: OTPVariant;
    error?: string;
}

const sanitize = (raw: string, variant: OTPVariant, length: number): string => {
    if (variant === 'numeric') {
        return raw.replace(/\D/g, '').slice(0, length);
    }
    return raw.replace(/[^0-9A-Za-z-]/g, '').slice(0, length);
};

export function AuthOTPInput({
    length,
    value,
    onChange,
    onComplete,
    variant = 'numeric',
    error,
    autoFocus,
    disabled,
    placeholder,
    className,
    id,
    ...rest
}: AuthOTPInputProps) {
    const firedForValueRef = useRef<string | null>(null);

    useEffect(() => {
        if (!onComplete) return;
        if (value.length !== length) {
            firedForValueRef.current = null;
            return;
        }
        if (firedForValueRef.current === value) return;
        firedForValueRef.current = value;
        onComplete(value);
    }, [value, length, onComplete]);

    const resolvedPlaceholder =
        placeholder ?? (variant === 'numeric' ? '0'.repeat(length) : undefined);

    const inputMode = variant === 'numeric' ? 'numeric' : 'text';
    const pattern = variant === 'numeric' ? '[0-9]*' : undefined;

    return (
        <div className="space-y-2">
            <input
                id={id}
                type="text"
                value={value}
                onChange={(e) => onChange(sanitize(e.target.value, variant, length))}
                placeholder={resolvedPlaceholder}
                maxLength={length}
                inputMode={inputMode}
                pattern={pattern}
                autoComplete="one-time-code"
                autoFocus={autoFocus}
                disabled={disabled}
                className={cn(
                    'w-full text-center font-mono h-14 rounded-xl border bg-slate-800/50 text-slate-100 placeholder:text-slate-600',
                    'text-xl tracking-[0.4em] sm:text-2xl sm:tracking-[0.5em]',
                    'outline-none transition-all duration-300 focus:bg-slate-900/80 focus-visible:ring-2 focus-visible:ring-violet-500/50',
                    error ? 'border-red-500/50' : 'border-slate-700/50 focus:border-violet-500/50',
                    disabled && 'opacity-50 cursor-not-allowed',
                    className
                )}
                aria-invalid={Boolean(error)}
                {...rest}
            />
            {error && <p className="text-xs text-red-400/80 font-medium text-center">{error}</p>}
        </div>
    );
}

export default AuthOTPInput;
