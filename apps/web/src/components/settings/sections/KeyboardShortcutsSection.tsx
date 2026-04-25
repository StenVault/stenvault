/**
 * KeyboardShortcutsSection — Preferences > Keyboard shortcuts.
 *
 * Single source of truth for the bindings registered by
 * `useKeyboardShortcuts`. Anything listed here has to resolve to a
 * real handler in that hook; if a row is missing, nothing is wired up.
 * Scope column tells the user where the binding is live.
 */

import { Keyboard } from 'lucide-react';
import { AuroraCard } from '@stenvault/shared/ui/aurora-card';
import { AuroraEyebrow } from '@stenvault/shared/ui/aurora-eyebrow';
import { modKeyLabel } from '@/lib/os';

interface ShortcutRow {
    keys: string[];
    label: string;
    scope?: string;
}

interface ShortcutGroup {
    title: string;
    rows: ShortcutRow[];
}

function buildGroups(modKey: string): ShortcutGroup[] {
    return [
        {
            title: 'General',
            rows: [
                {
                    keys: [modKey, 'K'],
                    label: 'Open the command palette to search, navigate, and act.',
                },
                {
                    keys: ['Esc'],
                    label: 'Close the open dialog, panel, or popover.',
                },
            ],
        },
        {
            title: 'Files',
            rows: [
                {
                    keys: [modKey, 'U'],
                    label: 'Upload files to the current folder.',
                },
                {
                    keys: [modKey, 'N'],
                    label: 'Create a new folder.',
                },
                {
                    keys: [modKey, 'R'],
                    label: 'Refresh the file list.',
                    scope: 'Drive',
                },
                {
                    keys: ['Delete'],
                    label: 'Move selected items to Trash.',
                    scope: 'Drive',
                },
            ],
        },
    ];
}

function KeyCombo({ keys }: { keys: string[] }) {
    return (
        <span className="inline-flex items-center gap-1">
            {keys.map((key, i) => (
                <kbd
                    key={`${key}-${i}`}
                    className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-md border border-[var(--theme-border-strong)] bg-[var(--theme-bg-elevated)] px-1.5 font-mono text-[11px] font-medium text-[var(--theme-fg-primary)]"
                >
                    {key}
                </kbd>
            ))}
        </span>
    );
}

export function KeyboardShortcutsSection() {
    const groups = buildGroups(modKeyLabel());

    return (
        <AuroraCard variant="default">
            <div className="mb-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--theme-primary)]/10 shrink-0">
                    <Keyboard className="w-5 h-5 text-[var(--theme-primary)]" />
                </div>
                <div>
                    <h3 className="font-semibold text-foreground">Keyboard shortcuts</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Move around StenVault without lifting your hands from the keyboard.
                    </p>
                </div>
            </div>
            <div className="space-y-6">
                {groups.map((group) => (
                    <div key={group.title} className="space-y-3">
                        <AuroraEyebrow tone="muted">{group.title}</AuroraEyebrow>
                        <dl className="divide-y divide-border">
                            {group.rows.map((row) => (
                                <div
                                    key={row.keys.join('+')}
                                    className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                                >
                                    <dt className="flex items-center gap-3 min-w-0">
                                        <KeyCombo keys={row.keys} />
                                        <span className="text-sm text-foreground">
                                            {row.label}
                                        </span>
                                    </dt>
                                    {row.scope && (
                                        <dd className="text-xs text-foreground-muted sm:flex-shrink-0">
                                            {row.scope}
                                        </dd>
                                    )}
                                </div>
                            ))}
                        </dl>
                    </div>
                ))}
            </div>
        </AuroraCard>
    );
}
