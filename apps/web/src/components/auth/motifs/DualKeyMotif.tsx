import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@stenvault/shared/utils';

interface DualKeyMotifProps {
    className?: string;
}

/**
 * Side-panel motif for Register. Two stylised keys side by side — the
 * Sign-in key on the left (cooler, fainter) and the Encryption key on
 * the right (brighter, closer to hand). They oscillate in opposite
 * phase so the eye reads them as two distinct objects, never a pair.
 */
export function DualKeyMotif({ className }: DualKeyMotifProps) {
    const reducedMotion = useReducedMotion();

    const leftAnimate = reducedMotion ? { rotate: 0 } : { rotate: [-2, 2, -2] };
    const rightAnimate = reducedMotion ? { rotate: 0 } : { rotate: [2, -2, 2] };

    const transition = reducedMotion
        ? { duration: 0.01 }
        : {
              duration: 4.2,
              ease: 'easeInOut' as const,
              repeat: Infinity,
          };

    const glowAnimate = reducedMotion
        ? { opacity: 0.4 }
        : { opacity: [0.25, 0.45, 0.25] };

    return (
        <div className={cn('relative w-[180px] h-[120px]', className)}>
            <motion.div
                className="absolute inset-0 rounded-full bg-violet-500/15 blur-3xl"
                animate={glowAnimate}
                transition={transition}
            />
            <svg
                viewBox="0 0 180 120"
                width="180"
                height="120"
                className="relative"
                fill="none"
            >
                {/* Left key — Sign-in, subdued */}
                <motion.g
                    style={{ transformOrigin: '50px 60px', transformBox: 'fill-box' }}
                    animate={leftAnimate}
                    transition={transition}
                >
                    <circle
                        cx={50}
                        cy={60}
                        r={18}
                        stroke="currentColor"
                        strokeWidth={3}
                        className="text-violet-400/55"
                        fill="rgba(139, 92, 246, 0.08)"
                    />
                    <circle
                        cx={50}
                        cy={60}
                        r={5}
                        className="text-violet-300/70"
                        fill="currentColor"
                    />
                    <rect
                        x={66}
                        y={57}
                        width={22}
                        height={6}
                        rx={2}
                        className="text-violet-400/55"
                        fill="currentColor"
                    />
                    <rect
                        x={80}
                        y={63}
                        width={4}
                        height={8}
                        rx={1}
                        className="text-violet-400/55"
                        fill="currentColor"
                    />
                </motion.g>

                {/* Right key — Encryption, emphatic */}
                <motion.g
                    style={{ transformOrigin: '130px 60px', transformBox: 'fill-box' }}
                    animate={rightAnimate}
                    transition={transition}
                >
                    <circle
                        cx={130}
                        cy={60}
                        r={20}
                        stroke="currentColor"
                        strokeWidth={3.5}
                        className="text-violet-300"
                        fill="rgba(139, 92, 246, 0.18)"
                    />
                    <circle
                        cx={130}
                        cy={60}
                        r={6}
                        className="text-violet-100"
                        fill="currentColor"
                    />
                    <rect
                        x={148}
                        y={56}
                        width={24}
                        height={8}
                        rx={2}
                        className="text-violet-300"
                        fill="currentColor"
                    />
                    <rect
                        x={163}
                        y={64}
                        width={5}
                        height={10}
                        rx={1.5}
                        className="text-violet-300"
                        fill="currentColor"
                    />
                </motion.g>
            </svg>
        </div>
    );
}

export default DualKeyMotif;
