/**
 * WelcomeHeader
 *
 * Personalized greeting rendered at the top of the Home hub.
 * Display title in Instrument Serif, sentence case. Keeps the date
 * caption and "System active" chip for context.
 */

import { motion } from 'framer-motion';
import { cn } from '@stenvault/shared/utils';

interface WelcomeHeaderProps {
    userName: string | null;
    className?: string;
}

export function WelcomeHeader({ userName, className }: WelcomeHeaderProps) {
    const displayName = userName || 'there';
    const currentDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
                'relative overflow-hidden rounded-2xl p-6 md:p-8',
                'bg-card/50 backdrop-blur-xl border border-border',
                className,
            )}
        >
            <div className="relative flex flex-col gap-3">
                <motion.h1
                    className="font-display font-normal tracking-tight text-foreground text-[32px] md:text-[40px] leading-[1.15]"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1, duration: 0.4 }}
                >
                    Welcome back, {displayName}.
                </motion.h1>

                <motion.p
                    className="text-sm md:text-base text-muted-foreground capitalize"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                >
                    {currentDate}
                </motion.p>

                <motion.div
                    className="mt-1 inline-flex w-fit items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                >
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                    System active
                </motion.div>
            </div>
        </motion.div>
    );
}
