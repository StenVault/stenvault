/**
 * PublicLayout — Shared layout for public pages (/send, /terms, /privacy).
 */
import { Outlet } from 'react-router-dom';
import { PublicHeader } from '@/components/PublicHeader';
import { PublicFooter } from '@/components/PublicFooter';
import { LANDING_COLORS } from '@/lib/constants/themeColors';

export function PublicLayout() {
    return (
        <div
            className="min-h-screen flex flex-col"
            style={{ backgroundColor: LANDING_COLORS.bg }}
        >
            <PublicHeader />
            <main className="flex-1">
                <Outlet />
            </main>
            <PublicFooter />
        </div>
    );
}
