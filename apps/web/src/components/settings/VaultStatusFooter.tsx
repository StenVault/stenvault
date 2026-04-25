/**
 * VaultStatusFooter — always-visible posture line at the bottom of the
 * Settings shell. Inspired by Vercel's persistent vercel-status footer:
 * a single row that summarises the configuration of the vault and links
 * to the first issue worth resolving.
 *
 * Four discrete states, ordered by severity:
 *   Critical       — encryption configured but no recovery path acknowledged
 *                    (forgetting the Encryption Password = permanent data
 *                    loss). Treated as worse than 2FA-off because it is
 *                    irreversible.
 *   Needs attention — 2FA off (account takeover risk; reversible via support
 *                    flows / email reset).
 *   Good           — at least one optional check missing.
 *   Strong         — 2FA + Trusted Circle + signature keys all configured.
 *
 * Risk asymmetry: irreversible loss outranks reversible inconvenience. A
 * single amber dot for both was misleading.
 *
 * The action target points at the first open issue so a click on the line
 * always lands somewhere useful.
 */

import { ArrowRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { hasAcknowledgedRecoveryCodes } from '@/lib/recoveryCodesAck';

export type Posture = 'strong' | 'good' | 'needs-attention' | 'critical';

export interface PostureSummary {
    state: Posture;
    label: string;
    detail: string;
    target: string;
    /** Number of unconfigured optional checks (excludes the critical 2FA gap). */
    pendingCount: number;
}

const STATE_DOT_CLASS: Record<Posture, string> = {
    strong: 'bg-[var(--theme-success)]',
    good: 'bg-[var(--theme-primary)]',
    'needs-attention': 'bg-[var(--theme-warning)]',
    critical: 'bg-[var(--theme-error)]',
};

const STATE_LABEL: Record<Posture, string> = {
    strong: 'Strong',
    good: 'Good',
    'needs-attention': 'Needs attention',
    critical: 'Critical',
};

export interface PostureInputs {
    twoFa: boolean;
    trustedCircle: boolean;
    signatureKeys: boolean;
    /** Master Key configured server-side (encryption set up). */
    encryptionConfigured: boolean;
    /** User has saved their recovery codes on this device (localStorage flag). */
    recoveryCodesSeen: boolean;
}

export function summarisePosture(inputs: PostureInputs): PostureSummary {
    const { twoFa, trustedCircle, signatureKeys, encryptionConfigured, recoveryCodesSeen } = inputs;

    // Critical: encryption is configured but there is no acknowledged recovery
    // path on this device AND no Trusted Circle. Forgetting the Encryption
    // Password in this state = permanent loss of every file. This is the only
    // irreversible failure mode in the posture model and it must outrank 2FA.
    if (encryptionConfigured && !recoveryCodesSeen && !trustedCircle) {
        return {
            state: 'critical',
            label: STATE_LABEL.critical,
            detail: 'Recovery codes not saved · permanent loss possible',
            target: '/settings/sign-in-and-recovery',
            pendingCount:
                [twoFa, trustedCircle, signatureKeys].filter((v) => v === false).length + 1,
        };
    }

    // 2FA off — account takeover risk, but reversible.
    if (!twoFa) {
        return {
            state: 'needs-attention',
            label: STATE_LABEL['needs-attention'],
            detail: 'Two-step login is off',
            target: '/settings/sign-in-and-recovery',
            pendingCount: [trustedCircle, signatureKeys].filter((v) => v === false).length + 1,
        };
    }

    const optional: Array<{ ok: boolean; detail: string; target: string }> = [
        {
            ok: trustedCircle,
            detail: 'Trusted Circle not set up',
            target: '/settings/encryption',
        },
        {
            ok: signatureKeys,
            detail: 'File verification not set up',
            target: '/settings/encryption',
        },
    ];
    const firstOpen = optional.find((o) => !o.ok);

    if (!firstOpen) {
        return {
            state: 'strong',
            label: STATE_LABEL.strong,
            detail: 'All clear',
            target: '/settings/sign-in-and-recovery',
            pendingCount: 0,
        };
    }

    const pending = optional.filter((o) => !o.ok).length;
    return {
        state: 'good',
        label: STATE_LABEL.good,
        detail: pending === 1 ? `${pending} check left` : `${pending} checks left`,
        target: firstOpen.target,
        pendingCount: pending,
    };
}

export function VaultStatusFooter() {
    const { data: mfaStatus, isLoading: mfaLoading } = trpc.mfa.getStatus.useQuery(undefined, {
        staleTime: 60_000,
    });
    const { data: shamirStatus, isLoading: shamirLoading } =
        trpc.shamirRecovery.getStatus.useQuery(undefined, {
            staleTime: 60_000,
            retry: false,
        });
    const { data: signatureStatus, isLoading: signatureLoading } =
        trpc.hybridSignature.hasKeyPair.useQuery(undefined, {
            staleTime: 60_000,
        });
    const { data: masterKeyStatus, isLoading: masterKeyLoading } =
        trpc.encryption.getMasterKeyStatus.useQuery(undefined, {
            staleTime: 60_000,
        });

    const isLoading = mfaLoading || shamirLoading || signatureLoading || masterKeyLoading;

    if (isLoading) {
        return (
            <div
                aria-live="polite"
                className="flex items-center gap-3 px-4 py-3 border-t border-border/40 text-xs text-foreground-muted"
            >
                <span className="inline-block h-2 w-2 rounded-full bg-foreground-muted/40 animate-pulse" />
                <span>Checking vault posture…</span>
            </div>
        );
    }

    const summary = summarisePosture({
        twoFa: mfaStatus?.enabled === true,
        trustedCircle: shamirStatus?.isConfigured === true,
        signatureKeys: signatureStatus?.hasKeyPair === true,
        encryptionConfigured: masterKeyStatus?.isConfigured === true,
        recoveryCodesSeen: hasAcknowledgedRecoveryCodes(),
    });

    const Icon =
        summary.state === 'needs-attention' || summary.state === 'critical'
            ? ShieldAlert
            : ShieldCheck;

    return (
        <Link
            to={summary.target}
            aria-label={`Vault posture: ${summary.label}. ${summary.detail}.`}
            className="flex items-center gap-3 px-4 py-3 border-t border-border/40 hover:bg-[var(--theme-bg-elevated)] transition-colors group"
        >
            <span
                aria-hidden="true"
                className={`inline-block h-2 w-2 rounded-full ${STATE_DOT_CLASS[summary.state]}`}
            />
            <Icon
                aria-hidden="true"
                className="h-3.5 w-3.5 text-foreground-muted shrink-0"
            />
            <span className="text-xs text-foreground-secondary">
                Vault status:{' '}
                <span className="text-foreground font-medium">{summary.label}</span>
            </span>
            <span className="text-xs text-foreground-muted ml-auto tabular-nums">
                {summary.detail}
            </span>
            <ArrowRight
                aria-hidden="true"
                className="h-3.5 w-3.5 text-foreground-muted opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0"
            />
        </Link>
    );
}
