import { ReactNode, useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@stenvault/shared/utils';

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH CARD (Header & Container)
// ═══════════════════════════════════════════════════════════════════════════════

// Staggered entrance: heading first, then content. The timing sits inside
// the 500ms AuthLayout outer reveal, so the orchestration feels deliberate
// without dragging the total animation budget past half a second.
const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12, delayChildren: 0.08 } },
};
const item = {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

interface AuthCardProps {
    children: ReactNode;
    title: string;
    description?: string;
    className?: string;
    /** `compact` drops the display-size headline for modal usage. Default `default`. */
    size?: 'default' | 'compact';
    /** Staggered entrance. Disable when hosted inside a Dialog whose Radix animation
     *  already handles mount — stacking both causes a double-flicker on open. */
    animate?: boolean;
}

export function AuthCard({
    children,
    title,
    description,
    className,
    size = 'default',
    animate = true,
}: AuthCardProps) {
    const isCompact = size === 'compact';
    const rootClass = cn('relative', isCompact ? 'space-y-6' : 'space-y-8', className);
    // Instrument Serif via base layer (h1 rule); weight stays normal (400) to match the loaded face.
    const titleClass = cn(
        'font-display text-white tracking-tight bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent',
        isCompact ? 'text-2xl' : 'text-4xl'
    );
    const headerClass = 'space-y-3 text-center sm:text-left';
    const contentClass = 'relative z-20';

    const header = (
        <>
            <h1 className={titleClass}>{title}</h1>
            {description && (
                <p className="text-slate-400 font-light leading-relaxed text-sm sm:text-base">
                    {description}
                </p>
            )}
        </>
    );

    if (!animate) {
        return (
            <div className={rootClass}>
                <div className={headerClass}>{header}</div>
                <div className={contentClass}>{children}</div>
            </div>
        );
    }

    return (
        <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className={rootClass}
        >
            <motion.div variants={item} className={headerClass}>
                {header}
            </motion.div>
            <motion.div variants={item} className={contentClass}>
                {children}
            </motion.div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH INPUT 
// ═══════════════════════════════════════════════════════════════════════════════

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string;
    error?: string;
    icon?: ReactNode;
    rightIcon?: ReactNode;
}

export function AuthInput({
    label,
    error,
    icon,
    rightIcon,
    className,
    id,
    type,
    ...props
}: AuthInputProps) {
    const [isFocused, setIsFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const isPassword = type === 'password';

    return (
        <div className="space-y-2.5">
            <label
                htmlFor={id}
                className="block text-xs uppercase tracking-[0.2em] font-bold text-slate-400 ml-1"
            >
                {label}
            </label>
            <div className="relative group">
                {/* Active Border Glow */}
                <div className={cn(
                    "absolute -inset-[1px] rounded-xl bg-gradient-to-r from-violet-500/50 to-teal-500/50 opacity-0 transition-opacity duration-300 blur-[2px]",
                    isFocused && "opacity-100"
                )} />

                <input
                    id={id}
                    type={isPassword ? (showPassword ? 'text' : 'password') : type}
                    className={cn(
                        'relative w-full h-13 rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 text-sm text-white',
                        'transition-all duration-300 outline-none placeholder:text-slate-600 focus-visible:ring-2 focus-visible:ring-violet-500/50',
                        'focus:bg-slate-900/80',
                        isPassword && 'pr-12',
                        error && 'border-red-500/50',
                        className
                    )}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    {...props}
                />

                {isPassword ? (
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-slate-300 transition-colors z-30 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                        {showPassword ? (
                            <EyeOff className="w-5 h-5" />
                        ) : (
                            <Eye className="w-5 h-5" />
                        )}
                    </button>
                ) : rightIcon ? (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-slate-300 transition-colors">
                        {rightIcon}
                    </div>
                ) : null}
            </div>
            {error && <p className="text-xs text-red-400/80 font-medium ml-1">{error}</p>}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH BUTTON
// ═══════════════════════════════════════════════════════════════════════════════

interface AuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: ReactNode;
    variant?: 'primary' | 'secondary' | 'ghost';
    isLoading?: boolean;
    icon?: ReactNode;
    /** Text shown next to the spinner while `isLoading` is true. */
    loadingText?: string;
}

export function AuthButton({
    children,
    variant = 'primary',
    isLoading,
    icon,
    loadingText = 'Loading…',
    className,
    disabled,
    ...props
}: AuthButtonProps) {
    return (
        <button
            className={cn(
                'relative w-full h-13 rounded-xl font-bold text-sm transition-all duration-300',
                'flex items-center justify-center gap-2 overflow-hidden group focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
                'disabled:opacity-50 disabled:cursor-not-allowed',

                variant === 'primary' && [
                    'bg-violet-600 text-white shadow-lg shadow-violet-500/20',
                    'hover:bg-violet-500 hover:shadow-violet-500/40 hover:-translate-y-0.5',
                    'active:translate-y-0 active:brightness-90'
                ],

                variant === 'secondary' && [
                    'bg-white/[0.04] text-white border border-white/[0.08] backdrop-blur-md',
                    'hover:bg-white/[0.08] hover:border-white/[0.15]',
                ],

                variant === 'ghost' && 'bg-transparent text-slate-500 hover:text-white',

                className
            )}
            disabled={disabled || isLoading}
            {...props}
        >
            {/* Shimmer effect for primary button */}
            {variant === 'primary' && !isLoading && !disabled && (
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
            )}

            {isLoading ? (
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span className="uppercase tracking-widest text-[11px]">{loadingText}</span>
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <span className={variant === 'primary' ? 'uppercase tracking-widest text-[12px]' : ''}>
                        {children}
                    </span>
                    {icon && <span className="group-hover:translate-x-0.5 transition-transform">{icon}</span>}
                </div>
            )}
        </button>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH DIVIDER
// ═══════════════════════════════════════════════════════════════════════════════

export function AuthDivider({ text = 'Alternatives' }: { text?: string }) {
    return (
        <div className="relative flex items-center py-6">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
            <span className="px-4 text-[11px] uppercase tracking-[0.3em] text-slate-600 font-black">
                {text}
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH LINK
// ═══════════════════════════════════════════════════════════════════════════════

export function AuthLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
    return (
        <a
            href={href}
            className={cn(
                'inline-block origin-left text-[12px] font-bold text-slate-500',
                'transition-[color,transform] duration-300 hover:text-violet-400 hover:scale-x-[1.03]',
                className
            )}
        >
            {children}
        </a>
    );
}

export default AuthCard;
