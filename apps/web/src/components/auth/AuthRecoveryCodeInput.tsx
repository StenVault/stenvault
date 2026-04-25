import { type InputHTMLAttributes } from 'react';
import { Key } from 'lucide-react';
import { cn } from '@stenvault/shared/utils';

interface AuthRecoveryCodeInputProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type' | 'maxLength' | 'pattern' | 'autoComplete' | 'autoCapitalize'> {
    length: number;
    value: string;
    onChange: (value: string) => void;
    label?: string;
    helperText?: string;
    error?: string;
}

export function AuthRecoveryCodeInput({
    length,
    value,
    onChange,
    label = 'Recovery Code',
    helperText,
    error,
    id = 'recovery-code',
    className,
    disabled,
    autoFocus,
    ...rest
}: AuthRecoveryCodeInputProps) {
    return (
        <div className="space-y-2.5">
            <label
                htmlFor={id}
                className="block text-xs uppercase tracking-[0.2em] font-bold text-slate-400 ml-1"
            >
                {label}
            </label>
            {helperText && (
                <p className="text-xs text-slate-400 ml-1">{helperText}</p>
            )}
            <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 z-10" />
                <input
                    id={id}
                    type="text"
                    value={value}
                    onChange={(e) =>
                        onChange(
                            e.target.value
                                .toUpperCase()
                                .replace(/[^A-Z0-9]/g, '')
                                .slice(0, length)
                        )
                    }
                    placeholder={'X'.repeat(length)}
                    maxLength={length}
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoFocus={autoFocus}
                    disabled={disabled}
                    aria-invalid={Boolean(error)}
                    className={cn(
                        'relative w-full h-13 rounded-xl border bg-white/[0.03] pl-11 pr-5 font-mono text-white placeholder:text-slate-600',
                        'text-center text-lg tracking-wide sm:text-xl sm:tracking-widest',
                        'outline-none transition-all duration-300 focus:bg-slate-900/80 focus-visible:ring-2 focus-visible:ring-violet-500/50',
                        error ? 'border-red-500/50' : 'border-white/[0.08]',
                        disabled && 'opacity-50 cursor-not-allowed',
                        className
                    )}
                    {...rest}
                />
            </div>
            {error && <p className="text-xs text-red-400/80 font-medium ml-1">{error}</p>}
        </div>
    );
}

export default AuthRecoveryCodeInput;
