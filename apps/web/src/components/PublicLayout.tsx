/**
 * PublicLayout — Shared layout for all public-facing pages.
 *
 * Provides a consistent Header (navbar) and Footer across
 * landing, pricing, send, legal, and other public routes.
 * Handles hash-based scroll navigation (e.g. /landing#features).
 */
import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from '@/components/landing-v3/sections/Header';
import { Footer } from '@/components/landing-v3/sections/Footer';
import { LANDING_COLORS } from '@/components/landing-v3/constants';

export function PublicLayout() {
    const { hash, pathname } = useLocation();

    // Scroll to hash target after navigation (e.g. /landing#features from /pricing)
    useEffect(() => {
        if (!hash) return;
        const id = hash.slice(1);
        // Small delay to let the target page render its sections
        const timer = setTimeout(() => {
            const el = document.getElementById(id);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [hash, pathname]);

    return (
        <div
            className="min-h-screen flex flex-col"
            style={{ backgroundColor: LANDING_COLORS.bg }}
        >
            <Header />
            <main className="flex-1">
                <Outlet />
            </main>
            <Footer />
        </div>
    );
}
