/**
 * TextScramble — Reusable text scramble React component
 *
 * Wraps useTextScramble with IntersectionObserver auto-trigger.
 */
import { useRef, useState, useEffect } from 'react';
import { useTextScramble } from '../hooks/useTextScramble';

interface TextScrambleProps {
    text: string;
    /** Duration in ms (default: 800) */
    duration?: number;
    /** Delay before starting in ms */
    delay?: number;
    /** Auto-trigger on viewport entry (default: true) */
    autoTrigger?: boolean;
    /** Manual trigger override */
    trigger?: boolean;
    className?: string;
    as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'div';
}

export function TextScramble({
    text,
    duration = 800,
    delay = 0,
    autoTrigger = true,
    trigger: manualTrigger,
    className,
    as: Tag = 'span',
}: TextScrambleProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!autoTrigger || manualTrigger !== undefined) return;
        const el = ref.current;
        if (!el) return;

        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) {
                    setVisible(true);
                    io.disconnect();
                }
            },
            { threshold: 0.3 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [autoTrigger, manualTrigger]);

    const isTriggered = manualTrigger !== undefined ? manualTrigger : visible;

    const display = useTextScramble({
        text,
        trigger: isTriggered,
        duration,
        delay,
    });

    return (
        <Tag ref={ref as React.Ref<never>} className={className}>
            {display || '\u00A0'}
        </Tag>
    );
}
