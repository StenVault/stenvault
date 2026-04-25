/**
 * One-time caption that teaches ⌘K to first-time visitors. The retention
 * lever is the command palette — users who discover it stay. Shown inline
 * at the bottom of Home, auto-dismisses after five seconds so it never
 * becomes furniture, and persists dismissal across sessions.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { modKeyLabel } from '@/lib/os';

const STORAGE_KEY = 'commandPaletteHintDismissed';
const AUTO_DISMISS_MS = 5_000;

function readDismissed(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

function writeDismissed(): void {
    try {
        localStorage.setItem(STORAGE_KEY, '1');
    } catch {
        // Private mode — hint reappears next session, acceptable.
    }
}

export function CommandPaletteHint() {
    // Honour the dismissal synchronously on first render so the hint never
    // flashes for returning visitors.
    const [visible, setVisible] = useState<boolean>(() => !readDismissed());

    useEffect(() => {
        if (!visible) return;
        const id = window.setTimeout(() => {
            writeDismissed();
            setVisible(false);
        }, AUTO_DISMISS_MS);
        return () => window.clearTimeout(id);
    }, [visible]);

    const handleOpen = () => {
        writeDismissed();
        setVisible(false);
        // DashboardLayout owns the palette state and listens for this event.
        // Using a DOM event avoids dragging context or a store in for a hint.
        window.dispatchEvent(new CustomEvent('stenvault:open-command-palette'));
    };

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        writeDismissed();
        setVisible(false);
    };

    const modKey = modKeyLabel();

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.2 }}
                    className="flex justify-center"
                >
                    <div className="inline-flex items-center gap-2 text-xs text-[var(--theme-fg-muted)]">
                        <button
                            type="button"
                            onClick={handleOpen}
                            className="inline-flex items-center hover:text-[var(--theme-fg-secondary)] transition-colors"
                        >
                            Press{' '}
                            <kbd className="mx-0.5 px-1.5 py-0.5 text-[11px] font-mono rounded border border-[var(--theme-border-strong)] bg-[var(--theme-bg-elevated)] text-[var(--theme-fg-secondary)]">
                                {modKey}
                            </kbd>
                            <kbd className="mx-0.5 px-1.5 py-0.5 text-[11px] font-mono rounded border border-[var(--theme-border-strong)] bg-[var(--theme-bg-elevated)] text-[var(--theme-fg-secondary)]">
                                K
                            </kbd>{' '}
                            to search anything.
                        </button>
                        <button
                            type="button"
                            onClick={handleDismiss}
                            aria-label="Dismiss hint"
                            className="text-[var(--theme-fg-subtle)] hover:text-[var(--theme-fg-muted)] transition-colors"
                        >
                            ×
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
