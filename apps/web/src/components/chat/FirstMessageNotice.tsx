/**
 * System bubble that anchors the top of a Chat conversation — rendered
 * once the message list has reached the beginning of the thread (no more
 * older messages to load). Mirrors the Signal-style "messages and calls
 * are end-to-end encrypted" bubble, but framed around the "from this
 * point forward" moment that matches StenVault's encryption contract:
 * past messages (before the channel was set up) are not visible.
 */

import { Lock } from 'lucide-react';

interface FirstMessageNoticeProps {
    peerName: string;
}

export function FirstMessageNotice({ peerName }: FirstMessageNoticeProps) {
    return (
        <div className="flex justify-center py-4">
            <div className="flex items-start gap-2.5 max-w-md px-4 py-3 rounded-xl bg-[var(--theme-bg-elevated)] border border-[var(--theme-border)] text-xs text-[var(--theme-fg-muted)]">
                <Lock
                    className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--theme-primary)]"
                    aria-hidden="true"
                />
                <div className="space-y-1">
                    <p>
                        Messages to <span className="text-[var(--theme-fg-secondary)]">{peerName}</span> are encrypted from this point forward.
                    </p>
                    <p>Past messages (before encryption) are not visible.</p>
                </div>
            </div>
        </div>
    );
}
