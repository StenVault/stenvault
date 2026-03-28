/**
 * FeatureSection — Asymmetric bento grid with micro-animations
 *
 * Card 1 spans 2 columns (hero feature). Each card has a unique
 * micro-animation replacing static Lucide icons.
 */
import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';
import { LANDING_COLORS } from '../constants';
import { FEATURES } from '../constants/copy';
import { TYPOGRAPHY } from '../constants/tokens';
import { SpotlightCard } from '../components/SpotlightCard';
import { getReducedMotion } from '@/hooks/useReducedMotion';
import { useIsMobile } from '../hooks/useIsMobile';
import { EncryptUploadIcon } from '../components/feature-icons/EncryptUploadIcon';
import { KeyIcon } from '../components/feature-icons/KeyIcon';
import { ShieldOrbitIcon } from '../components/feature-icons/ShieldOrbitIcon';
import { DeviceHandshakeIcon } from '../components/feature-icons/DeviceHandshakeIcon';
import { LocalTransferIcon } from '../components/feature-icons/LocalTransferIcon';
import { ZeroKnowledgeIcon } from '../components/feature-icons/ZeroKnowledgeIcon';

gsap.registerPlugin(ScrollTrigger);

const ICON_COMPONENTS = [
    EncryptUploadIcon,
    KeyIcon,
    ShieldOrbitIcon,
    DeviceHandshakeIcon,
    LocalTransferIcon,
    ZeroKnowledgeIcon,
];

/**
 * Bento grid layout classes for each card index:
 * Desktop:
 * ┌──────────────┬─────────┐
 * │  Card 1 (2x) │ Card 2  │
 * ├───────┬──────┼─────────┤
 * │ Card 3│Card 4│ Card 5  │
 * ├───────┴──────┤ (tall)  │
 * │    Card 6    │         │
 * └──────────────┴─────────┘
 */
const BENTO_CLASSES = [
    'md:col-span-2 lg:col-span-2',       // Card 1 — wide
    'md:col-span-1 lg:col-span-1',       // Card 2
    'md:col-span-1 lg:col-span-1',       // Card 3
    'md:col-span-1 lg:col-span-1',       // Card 4
    'md:col-span-1 lg:col-span-1 lg:row-span-2', // Card 5 — tall
    'md:col-span-2 lg:col-span-2',       // Card 6 — wide
];

export function FeatureSection() {
    const sectionRef = useRef<HTMLElement>(null);
    const headingRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const isMobile = useIsMobile();

    useEffect(() => {
        if (getReducedMotion()) return;

        const ctx = gsap.context(() => {
            if (headingRef.current) {
                gsap.fromTo(
                    headingRef.current,
                    { y: 50, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.8,
                        ease: 'expo.out',
                        scrollTrigger: {
                            trigger: headingRef.current,
                            start: 'top 85%',
                            once: true,
                        },
                    },
                );
            }

            const cards = gridRef.current?.querySelectorAll('.feature-card');
            if (cards) {
                gsap.fromTo(
                    cards,
                    { y: 50, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.7,
                        stagger: 0.1,
                        ease: 'expo.out',
                        scrollTrigger: {
                            trigger: gridRef.current,
                            start: 'top 85%',
                            once: true,
                        },
                    },
                );
            }
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    return (
        <section
            ref={sectionRef}
            className="relative py-24 md:py-32 lg:py-40"
            style={{ backgroundColor: LANDING_COLORS.surface }}
        >
            <div className="max-w-6xl mx-auto px-6">
                {/* Heading */}
                <div
                    ref={headingRef}
                    className="text-center mb-16 md:mb-20"
                >
                    <span
                        className={cn(
                            TYPOGRAPHY.sectionLabel,
                            'text-indigo-400 mb-5 block',
                        )}
                    >
                        {FEATURES.label}
                    </span>
                    <h2 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] text-white whitespace-pre-line">
                        {FEATURES.headline}
                    </h2>
                    <p className="mt-6 max-w-xl mx-auto text-base md:text-lg text-slate-400 leading-relaxed">
                        {FEATURES.subheadline}
                    </p>
                </div>

                {/* Bento grid */}
                <div
                    ref={gridRef}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5"
                >
                    {FEATURES.cards.map((card, i) => {
                        const IconComponent = ICON_COMPONENTS[i]!;
                        const bentoClass = BENTO_CLASSES[i] ?? '';
                        const isHero = i === 0;

                        return (
                            <div
                                key={card.id}
                                className={cn('feature-card', bentoClass)}
                            >
                                <SpotlightCard
                                    variant="glass"
                                    className={cn(
                                        'p-6 md:p-8 h-full group/card',
                                        isHero && 'md:flex md:items-center md:gap-8',
                                    )}
                                >
                                    {/* Animated icon */}
                                    <div
                                        className={cn(
                                            'flex items-center justify-center mb-5',
                                            isHero && 'md:mb-0 md:flex-shrink-0',
                                        )}
                                    >
                                        <div
                                            className="w-12 h-12 rounded-xl flex items-center justify-center"
                                            style={{
                                                backgroundColor:
                                                    LANDING_COLORS.accentSubtle,
                                                border: `1px solid ${LANDING_COLORS.accent}20`,
                                            }}
                                        >
                                            <IconComponent size={48} />
                                        </div>
                                    </div>
                                    <div>
                                        <h3
                                            className={cn(
                                                'font-semibold text-white mb-2 leading-snug',
                                                isHero
                                                    ? 'text-xl md:text-2xl'
                                                    : 'text-lg',
                                            )}
                                        >
                                            {card.title}
                                        </h3>
                                        <p
                                            className={cn(
                                                'text-slate-400 leading-relaxed',
                                                isHero
                                                    ? 'text-sm md:text-base'
                                                    : 'text-sm',
                                            )}
                                        >
                                            {card.description}
                                        </p>
                                    </div>
                                </SpotlightCard>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
