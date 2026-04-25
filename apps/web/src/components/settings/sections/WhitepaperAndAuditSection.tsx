/**
 * WhitepaperAndAuditSection — external verification surface.
 *
 * Two parts:
 *   - Whitepaper link (the protocol description that describes what
 *     EncryptionDetailsSection lists).
 *   - Audit history (third-party reviews). Empty list is a legitimate
 *     state for an early-stage product — we say so plainly rather than
 *     hiding the panel.
 *
 * Whitepaper URL is a build-time constant for now. When a tRPC
 * publicContent endpoint exists this can swap to a query without
 * touching the layout. Audits read from a JSON config in @stenvault/shared
 * — non-engineering can append a row after a review.
 */

import { ExternalLink, FileText, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { AuroraCard } from '@stenvault/shared/ui/aurora-card';
import { Button } from '@stenvault/shared/ui/button';
import { getAudits, type AuditEntry } from '@stenvault/shared/config/audits';

// TODO: serve the published whitepaper from /public so this resolves to a
// real PDF instead of 404. Until then the link points at the Markdown
// source so the path stays stable.
const WHITEPAPER_URL = '/SECURITY_WHITEPAPER.md';

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return iso;
    }
}

function StatusIcon({ status }: { status: AuditEntry['status'] }) {
    switch (status) {
        case 'passed':
            return <ShieldCheck className="w-4 h-4 text-[var(--theme-success)]" aria-label="Passed" />;
        case 'passed-with-findings':
            return <ShieldAlert className="w-4 h-4 text-[var(--theme-warning)]" aria-label="Passed with findings" />;
        case 'in-progress':
            return <Loader2 className="w-4 h-4 text-foreground-muted animate-spin" aria-label="In progress" />;
    }
}

export function WhitepaperAndAuditSection() {
    const audits = getAudits();
    const hasAudits = audits.length > 0;

    return (
        <AuroraCard variant="default">
            <div className="mb-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--theme-primary)]/10 shrink-0">
                    <FileText className="w-5 h-5 text-[var(--theme-primary)]" />
                </div>
                <div>
                    <h3 className="font-semibold text-foreground">Whitepaper &amp; audits</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Read the protocol that protects your vault and review independent audits.
                    </p>
                </div>
            </div>
            <div className="space-y-6">
                <div>
                    <Button variant="outline" size="sm" asChild>
                        <a
                            href={WHITEPAPER_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2"
                        >
                            <FileText className="w-4 h-4" />
                            Read the security whitepaper
                            <ExternalLink className="w-3.5 h-3.5 text-foreground-muted" aria-hidden="true" />
                        </a>
                    </Button>
                </div>

                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-foreground">Audit history</h4>
                    {hasAudits ? (
                        <ul className="divide-y divide-border">
                            {audits.map((audit) => (
                                <li
                                    key={`${audit.date}-${audit.party}`}
                                    className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                                >
                                    <div className="flex items-start gap-2 min-w-0">
                                        <StatusIcon status={audit.status} />
                                        <div className="min-w-0 space-y-0.5">
                                            <p className="text-sm font-medium text-foreground">
                                                {audit.party}
                                            </p>
                                            <p className="text-xs text-foreground-muted">
                                                {audit.scope}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-start gap-0.5 sm:items-end">
                                        <span className="text-xs text-foreground-muted">
                                            {formatDate(audit.date)}
                                        </span>
                                        {audit.reportUrl && (
                                            <a
                                                href={audit.reportUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-xs text-[var(--theme-primary)] hover:underline"
                                            >
                                                Read report
                                                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                            </a>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-foreground-muted">
                            No third-party audits yet. The first independent review is on the
                            roadmap; the whitepaper above is the canonical specification of
                            the protocol in the meantime.
                        </p>
                    )}
                </div>
            </div>
        </AuroraCard>
    );
}
