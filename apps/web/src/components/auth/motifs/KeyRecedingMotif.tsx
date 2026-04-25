import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@stenvault/shared/utils';

interface KeyRecedingMotifProps {
    className?: string;
}

/**
 * Side-panel motif for EncryptionSetup. A single lock that drifts softly
 * away and back — the brand beat for "this is the one we never see".
 * Scale and opacity oscillate together so the glyph feels like it's
 * almost out of reach, then almost present, without ever leaving.
 */
export function KeyRecedingMotif({ className }: KeyRecedingMotifProps) {
    const reducedMotion = useReducedMotion();

    const lockAnimate = reducedMotion
        ? { scale: 1, opacity: 0.9 }
        : { scale: [1, 0.92, 1], opacity: [1, 0.55, 1] };

    const lockTransition = reducedMotion
        ? { duration: 0.01 }
        : {
              duration: 3.2,
              ease: 'easeInOut' as const,
              repeat: Infinity,
          };

    const glowAnimate = reducedMotion
        ? { opacity: 0.35, scale: 1 }
        : { opacity: [0.2, 0.45, 0.2], scale: [1, 1.08, 1] };

    return (
        <div className={cn('relative w-[140px] h-[140px]', className)}>
            <motion.div
                className="absolute inset-0 rounded-full bg-violet-500/25 blur-3xl"
                animate={glowAnimate}
                transition={lockTransition}
            />
            <motion.svg
                viewBox="0 0 120 120"
                width="140"
                height="140"
                className="relative"
                fill="none"
                animate={lockAnimate}
                transition={lockTransition}
                style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
            >
                {/* Shackle — static, closed */}
                <path
                    d="M 40 56 V 38 A 20 20 0 0 1 80 38 V 56"
                    stroke="currentColor"
                    strokeWidth={5.5}
                    strokeLinecap="round"
                    className="text-violet-300/75"
                />

                {/* Body */}
                <rect
                    x={28}
                    y={52}
                    width={64}
                    height={56}
                    rx={10}
                    stroke="currentColor"
                    strokeWidth={2.5}
                    className="text-violet-400/90"
                    fill="rgba(139, 92, 246, 0.14)"
                />

                {/* Keyhole */}
                <circle cx={60} cy={76} r={5} className="text-violet-200" fill="currentColor" />
                <rect
                    x={58}
                    y={76}
                    width={4}
                    height={14}
                    rx={2}
                    className="text-violet-200"
                    fill="currentColor"
                />
            </motion.svg>
        </div>
    );
}

export default KeyRecedingMotif;
