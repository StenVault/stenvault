import { Badge } from "@stenvault/shared/ui/badge";
import { Button } from "@stenvault/shared/ui/button";
import { Loader2, Shield, Zap, Check, Lock, AlertTriangle, ArrowRight, Crown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { EXTERNAL_URLS } from "@/lib/constants/externalUrls";
import { toast } from "@stenvault/shared/lib/toast";
import { formatBytes } from "@/utils/formatters";
import { PLAN_TIERS } from "@stenvault/shared";

import type { SubscriptionData } from "@/types/settings";

interface SubscriptionSettingsProps {
    isAdmin: boolean;
    subscription: SubscriptionData | undefined;
    isStripeActive: boolean;
}

type PlanKey = "free" | "pro";

const formatDays = (n: number): string =>
    n === 0 ? "—" : n === -1 ? "Unlimited" : `${n} days`;

const formatCount = (n: number): string =>
    n === -1 ? "Unlimited" : n === 0 ? "—" : String(n);

// ─── Plan comparison rows — derived from PLAN_TIERS ──────────────
const limitRows: readonly { label: string; getValue: (p: PlanKey) => string }[] = [
    { label: "Storage",         getValue: (p) => formatBytes(PLAN_TIERS[p].limits.storageQuota, 0) },
    { label: "Max file size",   getValue: (p) => formatBytes(PLAN_TIERS[p].limits.maxFileSize, 0) },
    { label: "Shared links",    getValue: (p) => formatCount(PLAN_TIERS[p].limits.maxShares) },
    { label: "Trash retention", getValue: (p) => formatDays(PLAN_TIERS[p].features.trashRetentionDays) },
    { label: "Version history", getValue: (p) => formatDays(PLAN_TIERS[p].features.versionHistoryDays) },
];

// First four rows are product-wide features every plan always has — intentionally hardcoded.
const featureRows: readonly { label: string; getValue: (p: PlanKey) => boolean }[] = [
    { label: "End-to-end encryption",          getValue: () => true },
    { label: "Zero-knowledge architecture",    getValue: () => true },
    { label: "Public Send",                    getValue: () => true },
    { label: "Password-protected shares",      getValue: (p) => PLAN_TIERS[p].features.sharePasswordProtection },
    { label: "Custom share expiry",            getValue: (p) => PLAN_TIERS[p].features.shareCustomExpiry },
    { label: "Share download limits",          getValue: (p) => PLAN_TIERS[p].features.shareDownloadLimits },
    { label: "Trusted Circle Recovery",        getValue: (p) => PLAN_TIERS[p].features.shamirRecovery },
    { label: "Hybrid post-quantum signatures", getValue: (p) => PLAN_TIERS[p].features.hybridSignatures },
    { label: "Priority support",               getValue: (p) => PLAN_TIERS[p].features.prioritySupport },
];

function CellCheck({ enabled }: { enabled: boolean }) {
    return enabled ? (
        <Check className="h-4 w-4 text-[var(--theme-success)]" />
    ) : (
        <span className="text-[var(--theme-fg-disabled)]">—</span>
    );
}

export function SubscriptionSettings({ isAdmin, subscription, isStripeActive }: SubscriptionSettingsProps) {
    const createCheckoutMutation = trpc.stripe.createCheckout.useMutation();
    const openPortalMutation = trpc.stripe.openPortal.useMutation();

    const handleManageSubscription = async () => {
        try {
            const { url } = await openPortalMutation.mutateAsync();
            if (url) window.location.href = url;
        } catch (error: any) {
            toast.error(error.message || "Failed to open subscription portal");
        }
    };

    const handleUpgrade = async (plan: "pro") => {
        try {
            const { url } = await createCheckoutMutation.mutateAsync({ plan });
            if (url) window.location.href = url;
        } catch (error: any) {
            toast.error(error.message || "Failed to start checkout");
        }
    };

    // ─── Loading ────────────────────────────────────────────────
    if (!subscription) {
        return (
            <div className="rounded-xl border border-[var(--theme-primary-tint)] bg-[var(--theme-bg-base)]/50 py-16 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--theme-primary-hover)]" />
                    <p className="text-sm text-[var(--theme-fg-subtle)]">Loading plan...</p>
                </div>
            </div>
        );
    }

    // ─── Admin view ─────────────────────────────────────────────
    if (isAdmin) {
        return (
            <div className="space-y-4">
                <div className="rounded-xl border border-[var(--theme-primary-tint-strong)] bg-gradient-to-br from-[var(--theme-primary-tint-soft)] to-transparent p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-[var(--theme-primary)] to-[var(--theme-primary-active)] shadow-[0_0_12px_var(--theme-primary-tint-deep)]">
                            <Shield className="w-5 h-5 text-[var(--theme-bg-base)]" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-[var(--theme-fg-secondary)]">Administrator</h2>
                            <p className="text-sm text-[var(--theme-fg-subtle)]">Unrestricted access — quotas configurable via Admin Panel</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="rounded-lg border border-[var(--theme-primary-tint)] bg-[var(--theme-bg-elevated)]/50 p-3">
                            <p className="text-xs text-[var(--theme-fg-subtle)] mb-1">Storage</p>
                            <p className="text-sm font-medium text-[var(--theme-fg-secondary)]">{formatBytes(subscription.limits.storageQuota, 0)}</p>
                        </div>
                        <div className="rounded-lg border border-[var(--theme-primary-tint)] bg-[var(--theme-bg-elevated)]/50 p-3">
                            <p className="text-xs text-[var(--theme-fg-subtle)] mb-1">Max file</p>
                            <p className="text-sm font-medium text-[var(--theme-fg-secondary)]">{formatBytes(subscription.limits.maxFileSize, 0)}</p>
                        </div>
                        <div className="rounded-lg border border-[var(--theme-primary-tint)] bg-[var(--theme-bg-elevated)]/50 p-3">
                            <p className="text-xs text-[var(--theme-fg-subtle)] mb-1">Shares</p>
                            <p className="text-sm font-medium text-[var(--theme-fg-secondary)]">{subscription.limits.maxShares === -1 ? "Unlimited" : String(subscription.limits.maxShares)}</p>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-[var(--theme-success)]/20 bg-[var(--theme-success)]/10 p-4 flex items-center gap-2 text-sm text-[var(--theme-success)]">
                    <Check className="w-4 h-4 shrink-0" />
                    Account active and in good standing.
                </div>
            </div>
        );
    }

    // ─── Access banners ─────────────────────────────────────────
    const AccessBanner = () => {
        if (subscription.accessLevel === "read_only") {
            return (
                <div className="flex items-center gap-2 text-sm text-[var(--theme-warning)] bg-[var(--theme-warning)]/10 border border-[var(--theme-warning)]/20 p-3 rounded-lg mb-4">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Account in <strong>read-only mode</strong> — uploads blocked. Update your payment method to restore access.</span>
                </div>
            );
        }
        if (subscription.accessLevel === "suspended") {
            return (
                <div className="flex items-center gap-2 text-sm text-[var(--theme-error)] bg-[var(--theme-error)]/10 border border-[var(--theme-error)]/20 p-3 rounded-lg mb-4">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Account <strong>suspended</strong>. Update your payment method immediately.</span>
                </div>
            );
        }
        if (subscription.overQuota) {
            return (
                <div className="flex items-center gap-2 text-sm text-[var(--theme-warning)] bg-[var(--theme-warning)]/10 border border-[var(--theme-warning)]/20 p-3 rounded-lg mb-4">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Over storage quota — uploads blocked. Free up space or upgrade.</span>
                </div>
            );
        }
        return null;
    };

    const currentPlan = subscription.plan as PlanKey;
    const isPaid = currentPlan !== "free";

    // ─── Status badge ───────────────────────────────────────────
    const StatusBadge = () => {
        if (subscription.status === "active") {
            return <Badge className="bg-[var(--theme-success)]/15 text-[var(--theme-success)] border-[var(--theme-success)]/30">Active</Badge>;
        }
        if (subscription.status === "trialing") {
            return <Badge className="bg-[var(--theme-info)]/15 text-[var(--theme-info)] border-[var(--theme-info)]/30">Trial</Badge>;
        }
        if (subscription.status === "past_due") {
            return <Badge className="bg-[var(--theme-warning)]/15 text-[var(--theme-warning)] border-[var(--theme-warning)]/30">Past Due</Badge>;
        }
        if (subscription.cancelAtPeriodEnd && subscription.subscriptionEndsAt) {
            return (
                <Badge className="bg-[var(--theme-warning)]/15 text-[var(--theme-warning)] border-[var(--theme-warning)]/30">
                    Cancels {new Date(subscription.subscriptionEndsAt).toLocaleDateString()}
                </Badge>
            );
        }
        return null;
    };

    // ─── Regular user view ──────────────────────────────────────
    return (
        <div className="space-y-6">
            <AccessBanner />

            {/* Current plan header */}
            <div className="rounded-xl border border-[var(--theme-glow)] bg-[var(--theme-bg-elevated)]/30 p-6">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div
                            className="p-2 rounded-lg"
                            style={{
                                backgroundColor: isPaid ? "var(--theme-glow)" : "rgba(148,163,184,0.1)",
                            }}
                        >
                            {isPaid ? (
                                <Crown className="h-5 w-5 text-[var(--theme-primary-hover)]" />
                            ) : (
                                <Zap className="h-5 w-5 text-[var(--theme-fg-subtle)]" />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-semibold text-[var(--theme-fg-secondary)]">
                                    {currentPlan === "free" ? "Free" : "Pro"}
                                </h2>
                                <StatusBadge />
                            </div>
                            <p className="text-sm text-[var(--theme-fg-subtle)]">
                                {currentPlan === "free"
                                    ? "Encrypted storage with zero-knowledge security"
                                    : "Advanced features for power users"}
                            </p>
                        </div>
                    </div>

                    {/* Action button */}
                    {isPaid ? (
                        <Button
                            variant="outline"
                            onClick={handleManageSubscription}
                            disabled={openPortalMutation.isPending}
                            className="border-[var(--theme-primary-tint-strong)] text-[var(--theme-fg-secondary)] hover:bg-[var(--theme-primary-tint)] hover:text-[var(--theme-primary-hover)]"
                        >
                            {openPortalMutation.isPending ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening...</>
                            ) : (
                                "Manage Billing"
                            )}
                        </Button>
                    ) : null}
                </div>

                {/* Current limits — compact grid */}
                <div className="grid grid-cols-3 gap-3">
                    <LimitCard label="Storage" value={formatBytes(subscription.limits.storageQuota, 0)} />
                    <LimitCard label="Max file" value={formatBytes(subscription.limits.maxFileSize, 0)} />
                    <LimitCard label="Shares" value={subscription.limits.maxShares === -1 ? "Unlimited" : String(subscription.limits.maxShares)} />
                </div>
            </div>

            {/* Upgrade card (free users only) */}
            {currentPlan === "free" && (
                <button
                    onClick={() => handleUpgrade("pro")}
                    disabled={createCheckoutMutation.isPending || !isStripeActive}
                    className="group relative w-full rounded-xl border border-[var(--theme-primary-tint-strong)] bg-gradient-to-br from-[var(--theme-primary-tint-soft)] to-transparent p-5 text-left transition-all hover:border-[color-mix(in srgb, var(--theme-primary) 40%, transparent)] hover:shadow-[0_0_24px_var(--theme-primary-tint)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Crown className="h-4 w-4 text-[var(--theme-primary-hover)]" />
                            <span className="font-semibold text-[var(--theme-fg-secondary)]">Pro</span>
                        </div>
                        <span className="text-sm text-[var(--theme-primary-hover)] font-medium">
                            {createCheckoutMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                "€5/mo"
                            )}
                        </span>
                    </div>
                    <p className="text-sm text-[var(--theme-fg-subtle)] mb-3">{formatBytes(PLAN_TIERS.pro.limits.storageQuota, 0)} storage, unlimited shares, Trusted Circle Recovery</p>
                    <div className="flex items-center gap-1 text-xs text-[var(--theme-primary-hover)] group-hover:text-[var(--theme-primary-hover)] transition-colors">
                        <span>Upgrade</span>
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </div>
                </button>
            )}

            {!isStripeActive && currentPlan === "free" && (
                <p className="text-xs text-center text-[var(--theme-warning)]">
                    Payments temporarily unavailable.
                </p>
            )}

            {/* Plan comparison table */}
            <div className="rounded-xl border border-[var(--theme-primary-tint)] overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--theme-primary-tint)]">
                    <h3 className="text-sm font-medium text-[var(--theme-fg-secondary)]">Compare plans</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[var(--theme-primary-tint)]">
                                <th className="text-left py-3 px-5 text-[var(--theme-fg-subtle)] font-normal w-[60%]" />
                                <th className={`text-center py-3 px-3 font-medium w-[20%] ${currentPlan === "free" ? "text-[var(--theme-fg-secondary)]" : "text-[var(--theme-fg-subtle)]"}`}>
                                    Free
                                    {currentPlan === "free" && <span className="block text-[10px] text-[var(--theme-primary-hover)] mt-0.5">Current</span>}
                                </th>
                                <th className={`text-center py-3 px-3 font-medium w-[20%] ${currentPlan === "pro" ? "text-[var(--theme-fg-secondary)]" : "text-[var(--theme-fg-subtle)]"}`}>
                                    Pro
                                    {currentPlan === "pro" && <span className="block text-[10px] text-[var(--theme-primary-hover)] mt-0.5">Current</span>}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Limits section */}
                            <tr>
                                <td colSpan={3} className="px-5 pt-4 pb-1 text-xs font-medium uppercase tracking-wider text-[var(--theme-primary-hover)]/60">
                                    Limits
                                </td>
                            </tr>
                            {limitRows.map((row) => (
                                <tr key={row.label} className="border-t border-[var(--theme-primary-tint-soft)]">
                                    <td className="py-2.5 px-5 text-[var(--theme-fg-muted)]">{row.label}</td>
                                    <td className="py-2.5 px-3 text-center text-[var(--theme-fg-muted)]">{row.getValue("free")}</td>
                                    <td className="py-2.5 px-3 text-center text-[var(--theme-fg-muted)]">{row.getValue("pro")}</td>
                                </tr>
                            ))}

                            {/* Features section */}
                            <tr>
                                <td colSpan={3} className="px-5 pt-5 pb-1 text-xs font-medium uppercase tracking-wider text-[var(--theme-primary-hover)]/60">
                                    Features
                                </td>
                            </tr>
                            {featureRows.map((row) => (
                                <tr key={row.label} className="border-t border-[var(--theme-primary-tint-soft)]">
                                    <td className="py-2.5 px-5 text-[var(--theme-fg-muted)]">{row.label}</td>
                                    <td className="py-2.5 px-3"><div className="flex justify-center"><CellCheck enabled={row.getValue("free")} /></div></td>
                                    <td className="py-2.5 px-3"><div className="flex justify-center"><CellCheck enabled={row.getValue("pro")} /></div></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer with pricing link */}
                <div className="px-5 py-3 border-t border-[var(--theme-primary-tint)] flex justify-end">
                    <button
                        onClick={() => window.location.href = EXTERNAL_URLS.pricing}
                        className="text-xs text-[var(--theme-fg-subtle)] hover:text-[var(--theme-primary-hover)] transition-colors flex items-center gap-1"
                    >
                        Full pricing details
                        <ArrowRight className="h-3 w-3" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Small components ───────────────────────────────────────────

function LimitCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-[var(--theme-primary-tint)] bg-[var(--theme-bg-elevated)]/40 px-3 py-2.5">
            <p className="text-xs text-[var(--theme-fg-subtle)] mb-0.5">{label}</p>
            <p className="text-sm font-medium text-[var(--theme-fg-secondary)]">{value}</p>
        </div>
    );
}
