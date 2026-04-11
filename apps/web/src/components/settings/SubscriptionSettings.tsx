import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Shield, Zap, Check, Lock, AlertTriangle, ArrowRight, Crown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { formatBytes } from "@/utils/formatters";

import type { SubscriptionData } from "@/types/settings";

interface SubscriptionSettingsProps {
    isAdmin: boolean;
    subscription: SubscriptionData | undefined;
    isStripeActive: boolean;
}

// ─── Plan comparison data ───────────────────────────────────────
const planComparison = {
    limits: [
        { label: "Storage", free: "5 GB", pro: "200 GB", business: "500 GB" },
        { label: "Max file size", free: "2 GB", pro: "10 GB", business: "25 GB" },
        { label: "Shared links", free: "5", pro: "Unlimited", business: "Unlimited" },
        { label: "Organizations", free: "—", pro: "1 (5 members)", business: "Unlimited" },
        { label: "Trash retention", free: "30 days", pro: "90 days", business: "180 days" },
        { label: "Version history", free: "—", pro: "30 days", business: "90 days" },
    ],
    features: [
        { label: "End-to-end encryption", free: true, pro: true, business: true },
        { label: "Zero-knowledge architecture", free: true, pro: true, business: true },
        { label: "Public Send", free: true, pro: true, business: true },
        { label: "Private Chat", free: true, pro: true, business: true },
        { label: "Password-protected shares", free: false, pro: true, business: true },
        { label: "Custom share expiry", free: false, pro: true, business: true },
        { label: "Share download limits", free: false, pro: true, business: true },
        { label: "Quantum Mesh P2P", free: false, pro: true, business: true },
        { label: "Shamir secret recovery", free: false, pro: true, business: true },
        { label: "Hybrid post-quantum signatures", free: false, pro: true, business: true },
        { label: "Priority support", free: false, pro: true, business: true },
        { label: "Org admin console", free: false, pro: true, business: true },
        { label: "Audit logs", free: false, pro: false, business: true },
        { label: "SSO / SAML", free: false, pro: false, business: true },
    ],
} as const;

type PlanKey = "free" | "pro" | "business";

function CellCheck({ enabled }: { enabled: boolean }) {
    return enabled ? (
        <Check className="h-4 w-4 text-emerald-500" />
    ) : (
        <span className="text-[var(--nocturne-500)]">—</span>
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

    const handleUpgrade = async (plan: "pro" | "business") => {
        try {
            const opts: { plan: "pro" | "business"; seats?: number } = { plan };
            if (plan === "business") opts.seats = 3;
            const { url } = await createCheckoutMutation.mutateAsync(opts);
            if (url) window.location.href = url;
        } catch (error: any) {
            toast.error(error.message || "Failed to start checkout");
        }
    };

    // ─── Loading ────────────────────────────────────────────────
    if (!subscription) {
        return (
            <div className="rounded-xl border border-[rgba(212,175,55,0.1)] bg-[var(--nocturne-900)]/50 py-16 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--gold-400)]" />
                    <p className="text-sm text-[var(--nocturne-400)]">Loading plan...</p>
                </div>
            </div>
        );
    }

    // ─── Admin view ─────────────────────────────────────────────
    if (isAdmin) {
        return (
            <div className="space-y-4">
                <div className="rounded-xl border border-[rgba(212,175,55,0.2)] bg-gradient-to-br from-[rgba(212,175,55,0.06)] to-transparent p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-[var(--gold-500)] to-[var(--gold-600)] shadow-[0_0_12px_rgba(212,175,55,0.3)]">
                            <Shield className="w-5 h-5 text-[var(--nocturne-950)]" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-[var(--nocturne-100)]">Administrator</h2>
                            <p className="text-sm text-[var(--nocturne-400)]">Unrestricted access — quotas configurable via Admin Panel</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="rounded-lg border border-[rgba(212,175,55,0.1)] bg-[var(--nocturne-800)]/50 p-3">
                            <p className="text-xs text-[var(--nocturne-400)] mb-1">Storage</p>
                            <p className="text-sm font-medium text-[var(--nocturne-100)]">{formatBytes(subscription.limits.storageQuota)}</p>
                        </div>
                        <div className="rounded-lg border border-[rgba(212,175,55,0.1)] bg-[var(--nocturne-800)]/50 p-3">
                            <p className="text-xs text-[var(--nocturne-400)] mb-1">Max file</p>
                            <p className="text-sm font-medium text-[var(--nocturne-100)]">{formatBytes(subscription.limits.maxFileSize)}</p>
                        </div>
                        <div className="rounded-lg border border-[rgba(212,175,55,0.1)] bg-[var(--nocturne-800)]/50 p-3">
                            <p className="text-xs text-[var(--nocturne-400)] mb-1">Shares</p>
                            <p className="text-sm font-medium text-[var(--nocturne-100)]">{subscription.limits.maxShares === -1 ? "Unlimited" : String(subscription.limits.maxShares)}</p>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-2 text-sm text-emerald-400">
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
                <div className="flex items-center gap-2 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg mb-4">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Account in <strong>read-only mode</strong> — uploads blocked. Update your payment method to restore access.</span>
                </div>
            );
        }
        if (subscription.accessLevel === "suspended") {
            return (
                <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 p-3 rounded-lg mb-4">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Account <strong>suspended</strong>. Update your payment method immediately.</span>
                </div>
            );
        }
        if (subscription.overQuota) {
            return (
                <div className="flex items-center gap-2 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg mb-4">
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
            return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Active</Badge>;
        }
        if (subscription.status === "trialing") {
            return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">Trial</Badge>;
        }
        if (subscription.status === "past_due") {
            return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">Past Due</Badge>;
        }
        if (subscription.cancelAtPeriodEnd && subscription.subscriptionEndsAt) {
            return (
                <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/30">
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
            <div className="rounded-xl border border-[rgba(212,175,55,0.12)] bg-[var(--nocturne-800)]/30 p-6">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div
                            className="p-2 rounded-lg"
                            style={{
                                backgroundColor: isPaid ? "rgba(212,175,55,0.12)" : "rgba(148,163,184,0.1)",
                            }}
                        >
                            {isPaid ? (
                                <Crown className="h-5 w-5 text-[var(--gold-400)]" />
                            ) : (
                                <Zap className="h-5 w-5 text-[var(--nocturne-400)]" />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-semibold text-[var(--nocturne-100)]">
                                    {currentPlan === "free" ? "Free" : currentPlan === "pro" ? "Pro" : "Business"}
                                </h2>
                                <StatusBadge />
                            </div>
                            <p className="text-sm text-[var(--nocturne-400)]">
                                {currentPlan === "free"
                                    ? "Encrypted storage with zero-knowledge security"
                                    : currentPlan === "pro"
                                        ? "Advanced features for power users"
                                        : "Full team features unlocked"}
                            </p>
                        </div>
                    </div>

                    {/* Action button */}
                    {isPaid ? (
                        <Button
                            variant="outline"
                            onClick={handleManageSubscription}
                            disabled={openPortalMutation.isPending}
                            className="border-[rgba(212,175,55,0.2)] text-[var(--nocturne-200)] hover:bg-[rgba(212,175,55,0.08)] hover:text-[var(--gold-300)]"
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <LimitCard label="Storage" value={formatBytes(subscription.limits.storageQuota)} />
                    <LimitCard label="Max file" value={formatBytes(subscription.limits.maxFileSize)} />
                    <LimitCard label="Shares" value={subscription.limits.maxShares === -1 ? "Unlimited" : String(subscription.limits.maxShares)} />
                    <LimitCard label="Organizations" value={subscription.limits.maxOrganizations === -1 ? "Unlimited" : subscription.limits.maxOrganizations === 0 ? "—" : String(subscription.limits.maxOrganizations)} />
                </div>
            </div>

            {/* Upgrade cards (free users only) */}
            {currentPlan === "free" && (
                <div className="grid md:grid-cols-2 gap-4">
                    {/* Pro card */}
                    <button
                        onClick={() => handleUpgrade("pro")}
                        disabled={createCheckoutMutation.isPending || !isStripeActive}
                        className="group relative rounded-xl border border-[rgba(212,175,55,0.2)] bg-gradient-to-br from-[rgba(212,175,55,0.06)] to-transparent p-5 text-left transition-all hover:border-[rgba(212,175,55,0.4)] hover:shadow-[0_0_24px_rgba(212,175,55,0.08)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Crown className="h-4 w-4 text-[var(--gold-400)]" />
                                <span className="font-semibold text-[var(--nocturne-100)]">Pro</span>
                            </div>
                            <span className="text-sm text-[var(--gold-400)] font-medium">
                                {createCheckoutMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    "€5/mo"
                                )}
                            </span>
                        </div>
                        <p className="text-sm text-[var(--nocturne-400)] mb-3">200 GB storage, unlimited shares, P2P, Shamir recovery</p>
                        <div className="flex items-center gap-1 text-xs text-[var(--gold-400)] group-hover:text-[var(--gold-300)] transition-colors">
                            <span>Upgrade</span>
                            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                        </div>
                    </button>

                    {/* Business card */}
                    <button
                        onClick={() => handleUpgrade("business")}
                        disabled={createCheckoutMutation.isPending || !isStripeActive}
                        className="group relative rounded-xl border border-[rgba(148,163,184,0.15)] bg-[var(--nocturne-800)]/30 p-5 text-left transition-all hover:border-[rgba(148,163,184,0.3)] hover:shadow-[0_0_24px_rgba(148,163,184,0.05)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4 text-[var(--nocturne-300)]" />
                                <span className="font-semibold text-[var(--nocturne-100)]">Business</span>
                            </div>
                            <span className="text-sm text-[var(--nocturne-300)] font-medium">€8/user/mo</span>
                        </div>
                        <p className="text-sm text-[var(--nocturne-400)] mb-3">500 GB, unlimited orgs, audit logs, SSO/SAML</p>
                        <div className="flex items-center gap-1 text-xs text-[var(--nocturne-400)] group-hover:text-[var(--nocturne-200)] transition-colors">
                            <span>Upgrade</span>
                            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                        </div>
                    </button>
                </div>
            )}

            {!isStripeActive && currentPlan === "free" && (
                <p className="text-xs text-center text-amber-400/70">
                    Payments temporarily unavailable.
                </p>
            )}

            {/* Plan comparison table */}
            <div className="rounded-xl border border-[rgba(212,175,55,0.08)] overflow-hidden">
                <div className="px-5 py-3 border-b border-[rgba(212,175,55,0.08)]">
                    <h3 className="text-sm font-medium text-[var(--nocturne-200)]">Compare plans</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[rgba(212,175,55,0.08)]">
                                <th className="text-left py-3 px-5 text-[var(--nocturne-400)] font-normal w-[40%]" />
                                <th className={`text-center py-3 px-3 font-medium w-[20%] ${currentPlan === "free" ? "text-[var(--nocturne-100)]" : "text-[var(--nocturne-400)]"}`}>
                                    Free
                                    {currentPlan === "free" && <span className="block text-[10px] text-[var(--gold-400)] mt-0.5">Current</span>}
                                </th>
                                <th className={`text-center py-3 px-3 font-medium w-[20%] ${currentPlan === "pro" ? "text-[var(--nocturne-100)]" : "text-[var(--nocturne-400)]"}`}>
                                    Pro
                                    {currentPlan === "pro" && <span className="block text-[10px] text-[var(--gold-400)] mt-0.5">Current</span>}
                                </th>
                                <th className={`text-center py-3 px-3 font-medium w-[20%] ${currentPlan === "business" ? "text-[var(--nocturne-100)]" : "text-[var(--nocturne-400)]"}`}>
                                    Business
                                    {currentPlan === "business" && <span className="block text-[10px] text-[var(--gold-400)] mt-0.5">Current</span>}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Limits section */}
                            <tr>
                                <td colSpan={4} className="px-5 pt-4 pb-1 text-xs font-medium uppercase tracking-wider text-[var(--gold-400)]/60">
                                    Limits
                                </td>
                            </tr>
                            {planComparison.limits.map((row) => (
                                <tr key={row.label} className="border-t border-[rgba(212,175,55,0.05)]">
                                    <td className="py-2.5 px-5 text-[var(--nocturne-300)]">{row.label}</td>
                                    <td className="py-2.5 px-3 text-center text-[var(--nocturne-300)]">{row.free}</td>
                                    <td className="py-2.5 px-3 text-center text-[var(--nocturne-300)]">{row.pro}</td>
                                    <td className="py-2.5 px-3 text-center text-[var(--nocturne-300)]">{row.business}</td>
                                </tr>
                            ))}

                            {/* Features section */}
                            <tr>
                                <td colSpan={4} className="px-5 pt-5 pb-1 text-xs font-medium uppercase tracking-wider text-[var(--gold-400)]/60">
                                    Features
                                </td>
                            </tr>
                            {planComparison.features.map((row) => (
                                <tr key={row.label} className="border-t border-[rgba(212,175,55,0.05)]">
                                    <td className="py-2.5 px-5 text-[var(--nocturne-300)]">{row.label}</td>
                                    <td className="py-2.5 px-3"><div className="flex justify-center"><CellCheck enabled={row.free} /></div></td>
                                    <td className="py-2.5 px-3"><div className="flex justify-center"><CellCheck enabled={row.pro} /></div></td>
                                    <td className="py-2.5 px-3"><div className="flex justify-center"><CellCheck enabled={row.business} /></div></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer with pricing link */}
                <div className="px-5 py-3 border-t border-[rgba(212,175,55,0.08)] flex justify-end">
                    <button
                        onClick={() => window.location.href = "https://stenvault.com/pricing"}
                        className="text-xs text-[var(--nocturne-400)] hover:text-[var(--gold-400)] transition-colors flex items-center gap-1"
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
        <div className="rounded-lg border border-[rgba(212,175,55,0.08)] bg-[var(--nocturne-800)]/40 px-3 py-2.5">
            <p className="text-xs text-[var(--nocturne-400)] mb-0.5">{label}</p>
            <p className="text-sm font-medium text-[var(--nocturne-100)]">{value}</p>
        </div>
    );
}
