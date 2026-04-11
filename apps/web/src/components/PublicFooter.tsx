/**
 * PublicFooter — Simplified footer for public pages.
 */
import { Shield, Github } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LANDING_COLORS } from '@/lib/constants/themeColors';
import { EXTERNAL_URLS } from '@/lib/constants/externalUrls';

const COLUMNS = [
    {
        title: 'Product',
        links: [
            { label: 'Secure Send', href: '/send' },
            { label: 'Local Transfer', href: '/send/local' },
            { label: 'Pricing', href: EXTERNAL_URLS.pricing, external: true },
        ],
    },
    {
        title: 'Legal',
        links: [
            { label: 'Terms of Service', href: '/terms' },
            { label: 'Privacy Policy', href: '/privacy' },
            { label: 'Contact', href: 'mailto:privacy@stenvault.com', external: true },
        ],
    },
];

export function PublicFooter() {
    const year = new Date().getFullYear();

    return (
        <footer style={{ backgroundColor: LANDING_COLORS.bg, borderTop: `1px solid ${LANDING_COLORS.border}` }}>
            <div className="max-w-7xl mx-auto px-6 py-16 md:py-20">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8">
                    {/* Brand */}
                    <div className="md:col-span-6">
                        <a href={EXTERNAL_URLS.home} className="inline-flex items-center gap-2 mb-4 group">
                            <Shield className="w-4 h-4 text-violet-400 transition-transform group-hover:scale-110" />
                            <span className="font-bold text-base tracking-tight text-white">
                                Sten<span className="text-violet-400">Vault</span>
                            </span>
                        </a>
                        <p className="text-sm text-slate-400 max-w-xs mb-4">
                            Your moments. Carved in stone.
                        </p>
                        <a
                            href={EXTERNAL_URLS.github}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-500 hover:text-slate-300 transition-colors"
                            aria-label="GitHub"
                        >
                            <Github className="w-5 h-5" />
                        </a>
                    </div>

                    {/* Nav columns */}
                    {COLUMNS.map((col) => (
                        <div key={col.title} className="md:col-span-3">
                            <h4 className="text-xs tracking-wider uppercase text-slate-400 font-medium mb-4">
                                {col.title}
                            </h4>
                            <ul className="space-y-3">
                                {col.links.map((link) => (
                                    <li key={link.label}>
                                        {'external' in link && link.external ? (
                                            <a
                                                href={link.href}
                                                className="text-sm text-slate-400 hover:text-slate-200 transition-colors duration-200"
                                                {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                                            >
                                                {link.label}
                                            </a>
                                        ) : (
                                            <Link
                                                to={link.href}
                                                className="text-sm text-slate-400 hover:text-slate-200 transition-colors duration-200"
                                            >
                                                {link.label}
                                            </Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>

            {/* Copyright */}
            <div className="px-6 py-5" style={{ borderTop: `1px solid ${LANDING_COLORS.border}50` }}>
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">&copy; {year} StenVault. All rights reserved.</span>
                    <span className="text-xs text-slate-500">Private by design. Not by promise.</span>
                </div>
            </div>
        </footer>
    );
}
