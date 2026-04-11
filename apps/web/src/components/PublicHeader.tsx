/**
 * PublicHeader — Simplified navbar for public pages (/send, /terms, /privacy).
 * Landing-specific navigation removed (now served by Next.js at stenvault.com).
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Menu, X } from 'lucide-react';
import { useAuth } from '@/_core/hooks/useAuth';
import { LANDING_COLORS } from '@/lib/constants/themeColors';

const NAV_LINKS = [
    { label: 'Secure Send', href: '/send' },
    { label: 'Local Transfer', href: '/send/local' },
    { label: 'Pricing', href: 'https://stenvault.com/pricing', external: true },
];

export function PublicHeader() {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <nav
            className="sticky top-0 z-50 py-4 backdrop-blur-2xl"
            style={{
                backgroundColor: LANDING_COLORS.glassBg,
                borderBottom: `1px solid ${LANDING_COLORS.glassBorder}`,
            }}
        >
            <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
                {/* Logo → marketing site */}
                <a href="https://stenvault.com" className="flex items-center gap-2.5 group">
                    <div className="relative">
                        <Shield className="w-5 h-5 text-indigo-400 transition-transform duration-300 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-indigo-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity" />
                    </div>
                    <span className="font-bold text-lg tracking-tight text-white">
                        Sten<span className="text-indigo-400">Vault</span>
                    </span>
                </a>

                {/* Desktop nav */}
                <div className="hidden md:flex items-center gap-8">
                    {NAV_LINKS.map((link) =>
                        link.external ? (
                            <a
                                key={link.label}
                                href={link.href}
                                className="text-sm text-slate-400 hover:text-white transition-colors duration-300"
                            >
                                {link.label}
                            </a>
                        ) : (
                            <Link
                                key={link.label}
                                to={link.href}
                                className="text-sm text-slate-400 hover:text-white transition-colors duration-300"
                            >
                                {link.label}
                            </Link>
                        )
                    )}
                </div>

                {/* Desktop auth */}
                <div className="hidden md:flex items-center gap-3">
                    {isAuthenticated ? (
                        <button
                            onClick={() => navigate('/')}
                            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20 cursor-pointer"
                        >
                            Dashboard
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={() => navigate('/auth/login')}
                                className="text-sm text-slate-400 hover:text-white transition-colors cursor-pointer"
                            >
                                Log in
                            </button>
                            <button
                                onClick={() => navigate('/auth/register')}
                                className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all cursor-pointer"
                                style={{
                                    backgroundColor: LANDING_COLORS.accent,
                                    boxShadow: `0 0 20px ${LANDING_COLORS.accentGlow}`,
                                }}
                            >
                                Get Started
                            </button>
                        </>
                    )}
                </div>

                {/* Mobile toggle */}
                <button
                    className="md:hidden text-white p-3 cursor-pointer"
                    onClick={() => setMobileOpen(!mobileOpen)}
                    aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                >
                    {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
            </div>

            {/* Mobile menu */}
            {mobileOpen && (
                <div
                    className="md:hidden absolute top-full left-0 right-0 backdrop-blur-2xl p-6 flex flex-col gap-4"
                    style={{
                        backgroundColor: LANDING_COLORS.glassBg,
                        borderBottom: `1px solid ${LANDING_COLORS.glassBorder}`,
                    }}
                >
                    {NAV_LINKS.map((link) =>
                        link.external ? (
                            <a
                                key={link.label}
                                href={link.href}
                                className="text-sm text-slate-300 hover:text-white py-2"
                                onClick={() => setMobileOpen(false)}
                            >
                                {link.label}
                            </a>
                        ) : (
                            <Link
                                key={link.label}
                                to={link.href}
                                className="text-sm text-slate-300 hover:text-white py-2"
                                onClick={() => setMobileOpen(false)}
                            >
                                {link.label}
                            </Link>
                        )
                    )}
                    <div className="h-px bg-white/10 my-1" />
                    {isAuthenticated ? (
                        <button
                            onClick={() => { navigate('/'); setMobileOpen(false); }}
                            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold cursor-pointer"
                        >
                            Dashboard
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={() => { navigate('/auth/login'); setMobileOpen(false); }}
                                className="w-full py-3 rounded-xl border border-white/10 text-white font-medium cursor-pointer"
                            >
                                Log in
                            </button>
                            <button
                                onClick={() => { navigate('/auth/register'); setMobileOpen(false); }}
                                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold cursor-pointer"
                            >
                                Get Started
                            </button>
                        </>
                    )}
                </div>
            )}
        </nav>
    );
}
