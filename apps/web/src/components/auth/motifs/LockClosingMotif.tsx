import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@stenvault/shared/utils';

interface LockClosingMotifProps {
    className?: string;
}

/**
 * Side-panel motif for Login. A stylised padlock whose shackle leans
 * gently back and forth, reading as "the lock just closed, again" — the
 * memory metaphor for returning users whose files are waiting for them.
 */
export function LockClosingMotif({ className }: LockClosingMotifProps) {
    const reducedMotion = useReducedMotion();

    const shackleAnimate = reducedMotion
        ? { rotate: 0 }
        : { rotate: [0, -10, 0] };

    const shackleTransition = reducedMotion
        ? { duration: 0.01 }
        : {
              duration: 3.2,
              ease: [0.16, 1, 0.3, 1] as const,
              repeat: Infinity,
              repeatDelay: 0.8,
          };

    const glowAnimate = reducedMotion
        ? { opacity: 0.4 }
        : { opacity: [0.25, 0.5, 0.25] };

    const glowTransition = reducedMotion
        ? { duration: 0.01 }
        : {
              duration: 3.6,
              ease: 'easeInOut' as const,
              repeat: Infinity,
          };

    return (
        <div className={cn('relative w-[180px] h-[180px]', className)}>
            <motion.div
                className="absolute inset-0 rounded-full bg-violet-500/20 blur-3xl"
                animate={glowAnimate}
                transition={glowTransition}
            />
            <svg
                viewBox="0 0 120 140"
                className="relative w-full h-full"
                fill="none"
                stroke="currentColor"
            >
                {/* Shackle — hinged at the base of the U, tilts subtly */}
                <motion.path
                    d="M 40 62 V 44 A 20 20 0 0 1 80 44 V 62"
                    className="text-violet-300/70"
                    strokeWidth={6}
                    strokeLinecap="round"
                    style={{ transformOrigin: '60px 62px', transformBox: 'fill-box' }}
                    animate={shackleAnimate}
                    transition={shackleTransition}
                />

                {/* Body */}
                <rect
                    x={26}
                    y={58}
                    width={68}
                    height={60}
                    rx={10}
                    className="text-violet-400/90"
                    strokeWidth={2}
                    fill="rgba(139, 92, 246, 0.12)"
                />

                {/* Keyhole */}
                <circle
                    cx={60}
                    cy={82}
                    r={5}
                    className="text-violet-200"
                    fill="currentColor"
                />
                <rect
                    x={58}
                    y={82}
                    width={4}
                    height={14}
                    rx={2}
                    className="text-violet-200"
                    fill="currentColor"
                />
            </svg>
        </div>
    );
}

export default LockClosingMotif;
