import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft, Cpu } from 'lucide-react';
import { LANDING_COLORS } from '@/lib/constants/themeColors';
import { EXTERNAL_URLS } from '@/lib/constants/externalUrls';
import { cn } from '@stenvault/shared/utils';

interface AuthLayoutProps {
    children: ReactNode;
    showBackLink?: boolean;
    backLinkUrl?: string;
    backLinkText?: string;
    /** Decorative desktop companion rendered at lg+ only. Omit for centred layout. */
    sidePanel?: ReactNode;
}

function AuthBackground() {
    // Composition is deliberately quiet: obsidian field + two low-opacity
    // radial glows, nothing else. A grid used to live here but it competed
    // with the glass card's own rectangles and pulled the whole surface
    // toward "dashboard template". The ambient nebula + card + motif already
    // carry the brand's tectonic register — the emptiness is the feature.
    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none bg-[#020617]">
            <div
                className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full blur-[150px] opacity-[0.1]"
                style={{ background: `radial-gradient(circle, ${LANDING_COLORS.accent} 0%, transparent 70%)` }}
            />
            <div
                className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[150px] opacity-[0.05]"
                style={{ background: `radial-gradient(circle, ${LANDING_COLORS.success} 0%, transparent 70%)` }}
            />
        </div>
    );
}

function BrandLogo() {
    return (
        <a href={EXTERNAL_URLS.home} className="inline-flex items-center gap-2 group">
            <div className="relative">
                <Shield className="w-8 h-8 text-violet-500 transition-transform group-hover:scale-110" />
                <div className="absolute inset-0 bg-violet-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity" />
            </div>
            <span className="text-2xl font-bold text-white tracking-tighter">
                Sten<span className="text-violet-500">Vault</span>
            </span>
        </a>
    );
}

export function AuthLayout({
    children,
    showBackLink = true,
    backLinkUrl = EXTERNAL_URLS.home,
    backLinkText = 'Back to stenvault.com',
    sidePanel,
}: AuthLayoutProps) {
    const card = (
        <div className="relative group w-full">
            <div className="absolute -inset-1 bg-gradient-to-r from-violet-500/10 to-teal-500/10 rounded-[2rem] blur-2xl opacity-50 group-hover:opacity-100 transition duration-1000" />

            <div className="relative bg-slate-950/40 backdrop-blur-3xl border border-white/[0.05] rounded-[2rem] p-8 sm:p-10 shadow-2xl overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent opacity-20" />

                {children}
            </div>
        </div>
    );

    return (
        <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-4 overscroll-none selection:bg-violet-500/30 font-sans antialiased">
            <AuthBackground />

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className={cn(
                    'relative z-10 w-full max-w-[440px]',
                    // Widen the track only when a side panel is provided, so pages
                    // without a panel stay centred at 440px exactly like before.
                    // Activates at md (768px) so the panel is actually visible on
                    // typical laptop/browser-window widths, not just ≥1024.
                    sidePanel && 'md:max-w-[960px]'
                )}
            >
                {/* Header sits above the grid so the brand reads as a masthead
                    spanning both columns on desktop, not a fixture of the card. */}
                <div className="flex flex-col items-center mb-10 sm:mb-12 space-y-4">
                    <BrandLogo />
                    {showBackLink && (
                        <a
                            href={backLinkUrl}
                            className="flex items-center gap-1.5 text-[12px] uppercase tracking-widest text-slate-500 hover:text-violet-400 transition-colors font-medium"
                        >
                            <ArrowLeft className="w-3 h-3" />
                            <span>{backLinkText}</span>
                        </a>
                    )}
                </div>

                <div
                    className={cn(
                        sidePanel &&
                            'md:grid md:grid-cols-[440px_minmax(280px,420px)] md:gap-8 md:items-stretch md:justify-center lg:gap-12'
                    )}
                >
                    {card}
                    {sidePanel && (
                        <div className="hidden md:flex">
                            {sidePanel}
                        </div>
                    )}
                </div>

                {/* Footer also spans the full widened track so the trust badge
                    anchors both card and panel, not just the card column. */}
                <div className="mt-6 sm:mt-12 text-center">
                    <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-white/[0.03] bg-white/[0.01] backdrop-blur-sm">
                        <Cpu className="w-3.5 h-3.5 text-violet-500" />
                        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold">
                            Quantum-Resistant Encryption Active
                        </span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

export default AuthLayout;
