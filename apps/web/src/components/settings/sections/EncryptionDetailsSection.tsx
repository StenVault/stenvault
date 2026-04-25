/**
 * EncryptionDetailsSection — vault crypto, in plain language.
 *
 * Reads the live Argon2id parameters from @stenvault/shared so the displayed
 * values can never drift from what the client actually runs. Algorithm
 * identifiers (CVEF version, KEM, AEAD) are spec-fixed strings from the
 * whitepaper — hardcoded here to keep the surface stable across crypto
 * refactors. If a constant moves, this file must move with it.
 *
 * Differentiator (I11): no zero-knowledge competitor surfaces this. Users
 * who want to verify the protocol can read the rows; everyone else just
 * sees a quiet, self-confident block of facts.
 */

import { ShieldCheck } from 'lucide-react';
import { AuroraCard } from '@stenvault/shared/ui/aurora-card';
import { TrustPill } from '@stenvault/shared/ui/trust-pill';
import { ARGON2_PARAMS } from '@stenvault/shared/platform/crypto';

interface DetailRow {
    label: string;
    value: string;
    note?: string;
}

const DETAIL_ROWS: ReadonlyArray<DetailRow> = [
    {
        label: 'Vault file format',
        value: 'CVEF v1.4',
        note: 'AAD-protected metadata, container v2',
    },
    {
        label: 'Key wrapping',
        value: 'X25519 + ML-KEM-768',
        note: 'Hybrid post-quantum',
    },
    {
        label: 'File encryption',
        value: 'AES-256-GCM',
        note: '12-byte IV · 32-byte key',
    },
    {
        label: 'Password derivation',
        value: 'Argon2id',
        note: `${(ARGON2_PARAMS.memoryCost / 1024).toFixed(0)} MiB · t=${ARGON2_PARAMS.timeCost} · p=${ARGON2_PARAMS.parallelism}`,
    },
    {
        label: 'Master key',
        value: '32 bytes',
        note: '256-bit symmetric key, never leaves your device',
    },
    {
        label: 'Filename encryption',
        value: 'AES-256-GCM',
        note: 'Per-folder key, separate from file body',
    },
    {
        label: 'File signatures',
        value: 'Ed25519 + ML-DSA-65',
        note: 'Hybrid post-quantum, opt-in',
    },
];

export function EncryptionDetailsSection() {
    return (
        <AuroraCard variant="default">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[var(--theme-primary)]/10 shrink-0">
                        <ShieldCheck className="w-5 h-5 text-[var(--theme-primary)]" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-foreground">Encryption details</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            The cryptographic primitives your vault is using right now.
                        </p>
                    </div>
                </div>
                <TrustPill variant="encrypted">End-to-end encrypted</TrustPill>
            </div>
            <dl className="divide-y divide-border">
                {DETAIL_ROWS.map((row) => (
                    <div
                        key={row.label}
                        className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                    >
                        <dt className="flex items-center gap-2 text-sm text-foreground-secondary">
                            <span
                                aria-hidden="true"
                                className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--theme-primary)]"
                            />
                            {row.label}
                        </dt>
                        <dd className="flex flex-col gap-0.5 sm:items-end">
                            <span className="font-mono text-sm text-foreground">
                                {row.value}
                            </span>
                            {row.note && (
                                <span className="text-xs text-foreground-muted">
                                    {row.note}
                                </span>
                            )}
                        </dd>
                    </div>
                ))}
            </dl>
            <p className="mt-4 text-xs text-foreground-muted">
                These parameters match the protocols described in the security whitepaper.
            </p>
        </AuroraCard>
    );
}
