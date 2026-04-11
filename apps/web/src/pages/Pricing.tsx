/**
 * Pricing Page
 * Shows subscription plans with per-seat pricing for Business.
 * Visual style matches the dark obsidian landing page.
 */

import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { Shield, Check, Zap, Crown, Users, Loader2, ArrowLeft, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

const PENDING_CHECKOUT_KEY = "stenvault_pending_checkout";
const RETURN_URL_KEY = "stenvault_return_url";
const PENDING_CHECKOUT_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface PendingCheckout {
    plan: "pro" | "business";
    billingCycle: "monthly" | "yearly";
    seats?: number;
    ts: number;
}

export default function Pricing() {
    const navigate = useNavigate();
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
    const [seats, setSeats] = useState(3);

    const { data: user } = trpc.auth.me.useQuery();
    const { data: pricing, isLoading: loadingPricing } = trpc.stripe.getPricing.useQuery();
    const { data: subscription } = trpc.stripe.getSubscription.useQuery(
        undefined,
        { enabled: !!user }
    );

    const checkoutInFlight = useRef(false);
    const prevEmailVerified = useRef<boolean | null>(null);

    const createCheckout = trpc.stripe.createCheckout.useMutation({
        onSuccess: (data) => {
            checkoutInFlight.current = false;
            sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
            if (data.url) {
                window.location.href = data.url;
            }
        },
        onError: (error) => {
            checkoutInFlight.current = false;
            const isEmailError = error.message?.includes('EMAIL_NOT_VERIFIED');
            if (!isEmailError) {
                sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
                toast.error(error.message || "Failed to create checkout");
            }
            setSelectedPlan(null);
        },
    });

    // Auto-trigger pending checkout after email verification.
    // Only fires on the unverified→verified transition, not on mount for already-verified users.
    const emailVerified = !!user?.emailVerified;
    useEffect(() => {
        if (!user || checkoutInFlight.current) return;

        // Track transition: only fire when emailVerified changes from false→true,
        // or on first mount when user just arrived from registration (not yet verified).
        const wasVerified = prevEmailVerified.current;
        prevEmailVerified.current = emailVerified;

        // Skip if user was already verified on initial mount (not a fresh registration flow)
        if (wasVerified === null && emailVerified) return;

        const raw = sessionStorage.getItem(PENDING_CHECKOUT_KEY);
        if (!raw) return;

        try {
            const pending = JSON.parse(raw);
            // Validate shape and TTL
            if (
                (pending.plan !== "pro" && pending.plan !== "business") ||
                (pending.billingCycle !== "monthly" && pending.billingCycle !== "yearly") ||
                (pending.ts && Date.now() - pending.ts > PENDING_CHECKOUT_TTL_MS)
            ) {
                sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
                return;
            }

            setSelectedPlan(pending.plan);
            setBillingCycle(pending.billingCycle);
            if (pending.seats) setSeats(pending.seats);
            checkoutInFlight.current = true;
            createCheckout.mutate({
                plan: pending.plan,
                billingCycle: pending.billingCycle,
                ...(pending.plan === "business" && pending.seats ? { seats: pending.seats } : {}),
            });
        } catch {
            sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
        }
    }, [emailVerified]); // eslint-disable-line react-hooks/exhaustive-deps

    const startCheckout = async (plan: "pro" | "business") => {
        setSelectedPlan(plan);
        try {
            await createCheckout.mutateAsync({
                plan,
                billingCycle,
                ...(plan === "business" ? { seats } : {}),
            });
        } catch {
            // Error handled in onError
        }
    };

    const handleSelectPlan = async (planId: string) => {
        if (planId === "free") {
            if (!user) {
                navigate("/auth/register");
            }
            return;
        }

        if (!user) {
            const pending: PendingCheckout = {
                plan: planId as "pro" | "business",
                billingCycle,
                ...(planId === "business" ? { seats } : {}),
                ts: Date.now(),
            };
            sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(pending));
            sessionStorage.setItem(RETURN_URL_KEY, "/pricing");
            navigate("/auth/register");
            return;
        }

        if (planId === subscription?.plan) {
            toast.info("You already have this plan active!");
            return;
        }

        await startCheckout(planId as "pro" | "business");
    };

    const getIcon = (planId: string) => {
        switch (planId) {
            case "free":
                return Zap;
            case "pro":
                return Crown;
            case "business":
                return Users;
            default:
                return Zap;
        }
    };

    const getButtonText = (planId: string) => {
        if (!user) {
            return planId === "free" ? "Create Free Account" : "Get Started";
        }

        if (subscription?.plan === planId) {
            return "Current Plan";
        }

        if (planId === "free") {
            return subscription?.plan !== "free" ? "Downgrade" : "Current Plan";
        }

        return "Start 14-Day Trial";
    };

    const getDisplayPrice = (plan: NonNullable<typeof pricing>["plans"][number]) => {
        const price = billingCycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
        if (price === 0) return { main: "Free", suffix: "", total: "" };

        if (plan.perUser && plan.id === "business") {
            const total = price * seats;
            return {
                main: `€${price}`,
                suffix: billingCycle === "monthly" ? "/user/mo" : "/user/yr",
                total: `€${total}${billingCycle === "monthly" ? "/mo" : "/yr"} for ${seats} users`,
            };
        }

        return {
            main: `€${price}`,
            suffix: billingCycle === "monthly" ? "/mo" : "/yr",
            total: billingCycle === "yearly" ? `€${(price / 12).toFixed(2)}/mo` : "",
        };
    };

    if (loadingPricing) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#020617" }}>
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <div className="min-h-screen" style={{ backgroundColor: "#020617" }}>
            {/* Header bar */}
            <nav className="border-b border-slate-800/60 backdrop-blur-xl" style={{ backgroundColor: "rgba(15, 23, 42, 0.6)" }}>
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <Link to="/landing" className="flex items-center gap-2.5 group">
                        <Shield className="w-5 h-5 text-indigo-400 transition-transform duration-300 group-hover:scale-110" />
                        <span className="font-bold text-lg tracking-tight text-white">
                            Sten<span className="text-indigo-400">Vault</span>
                        </span>
                    </Link>
                    <button
                        onClick={() => navigate("/settings?tab=subscription")}
                        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </button>
                </div>
            </nav>

            <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
                {/* Header */}
                <div className="text-center mb-16">
                    <span className="font-mono text-xs tracking-[0.3em] uppercase text-indigo-400 mb-5 block">
                        PRICING
                    </span>
                    <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] text-white mb-6">
                        Simple, transparent
                        <br />
                        <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
                            pricing.
                        </span>
                    </h1>
                    <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
                        Start free. Upgrade when you need to. No surprises.
                    </p>

                    {/* Billing cycle toggle */}
                    <div className="flex items-center justify-center gap-4 mt-10">
                        <span className={`text-sm font-medium transition-colors ${billingCycle === "monthly" ? "text-white" : "text-slate-500"}`}>
                            Monthly
                        </span>
                        <button
                            onClick={() => setBillingCycle(prev => prev === "monthly" ? "yearly" : "monthly")}
                            className="relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617] cursor-pointer"
                            style={{ backgroundColor: billingCycle === "yearly" ? "#6366F1" : "#1E293B" }}
                        >
                            <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${billingCycle === "yearly" ? "translate-x-8" : "translate-x-1"}`}
                            />
                        </button>
                        <span className={`text-sm font-medium transition-colors ${billingCycle === "yearly" ? "text-white" : "text-slate-500"}`}>
                            Yearly
                        </span>
                        {billingCycle === "yearly" && (
                            <span className="text-xs font-medium px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Save up to 20%
                            </span>
                        )}
                    </div>

                    {subscription && subscription.plan !== "free" && (
                        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-500/30 bg-emerald-500/5">
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="text-sm text-emerald-400">
                                Current plan: {subscription.plan.toUpperCase()} ({subscription.status})
                            </span>
                        </div>
                    )}
                </div>

                {/* Pricing Cards */}
                <div className="grid md:grid-cols-3 gap-6 md:gap-8">
                    {pricing?.plans.map((plan) => {
                        const Icon = getIcon(plan.id);
                        const isCurrentPlan = subscription?.plan === plan.id;
                        const isLoading = selectedPlan === plan.id && createCheckout.isPending;
                        const displayPrice = getDisplayPrice(plan);
                        const isHighlighted = plan.highlighted;

                        return (
                            <div
                                key={plan.id}
                                className={`relative flex flex-col rounded-2xl transition-all duration-300 ${
                                    isHighlighted
                                        ? "scale-[1.02] md:scale-105"
                                        : "hover:border-indigo-500/30"
                                } ${isCurrentPlan ? "ring-2 ring-emerald-500/50" : ""}`}
                                style={{
                                    backgroundColor: "rgba(15, 23, 42, 0.6)",
                                    border: `1px solid ${isHighlighted ? "rgba(99, 102, 241, 0.4)" : "rgba(30, 41, 59, 0.8)"}`,
                                    boxShadow: isHighlighted ? "0 0 40px rgba(99, 102, 241, 0.1), 0 0 80px rgba(99, 102, 241, 0.05)" : "none",
                                }}
                            >
                                {/* Popular Badge */}
                                {isHighlighted && (
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-4 py-1 rounded-full text-sm font-medium whitespace-nowrap shadow-lg shadow-indigo-600/20">
                                        Most Popular
                                    </div>
                                )}

                                {/* Current Plan Badge */}
                                {isCurrentPlan && (
                                    <div className="absolute -top-4 right-4 bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-medium">
                                        Active
                                    </div>
                                )}

                                {/* Card Header */}
                                <div className="text-center p-8 pb-4">
                                    <div className="flex items-center justify-center gap-2.5 mb-4">
                                        <div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                                            style={{
                                                backgroundColor: isHighlighted ? "rgba(99, 102, 241, 0.15)" : "rgba(30, 41, 59, 0.8)",
                                                border: `1px solid ${isHighlighted ? "rgba(99, 102, 241, 0.3)" : "rgba(51, 65, 85, 0.5)"}`,
                                            }}
                                        >
                                            <Icon className={`h-5 w-5 ${isHighlighted ? "text-indigo-400" : "text-slate-400"}`} />
                                        </div>
                                        <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                                    </div>

                                    <div className="mt-6">
                                        <span className="text-5xl font-bold text-white tracking-tight">
                                            {displayPrice.main}
                                        </span>
                                        {displayPrice.suffix && (
                                            <span className="text-slate-400 text-lg ml-1">{displayPrice.suffix}</span>
                                        )}
                                        {displayPrice.total && (
                                            <div className="text-slate-500 text-sm mt-1">
                                                {displayPrice.total}
                                            </div>
                                        )}
                                    </div>

                                    {/* Seat stepper for Business */}
                                    {plan.perUser && plan.id === "business" && (
                                        <div className="mt-5 flex items-center justify-center gap-3">
                                            <button
                                                className="h-8 w-8 rounded-lg border border-slate-700 flex items-center justify-center text-slate-300 hover:border-slate-500 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                                onClick={() => setSeats(s => Math.max(plan.minUsers || 3, s - 1))}
                                                disabled={seats <= (plan.minUsers || 3)}
                                            >
                                                <Minus className="h-4 w-4" />
                                            </button>
                                            <span className="text-lg font-semibold w-12 text-center text-white">{seats}</span>
                                            <button
                                                className="h-8 w-8 rounded-lg border border-slate-700 flex items-center justify-center text-slate-300 hover:border-slate-500 hover:text-white transition-colors cursor-pointer"
                                                onClick={() => setSeats(s => s + 1)}
                                            >
                                                <Plus className="h-4 w-4" />
                                            </button>
                                            <span className="text-sm text-slate-500">users</span>
                                        </div>
                                    )}

                                    <p className="mt-3 text-sm text-slate-500">
                                        {plan.id === "free" && "Perfect to get started"}
                                        {plan.id === "pro" && "For power users"}
                                        {plan.id === "business" && `For teams (min ${plan.minUsers || 3} users)`}
                                    </p>
                                </div>

                                {/* Divider */}
                                <div className="mx-8 h-px" style={{ backgroundColor: "rgba(30, 41, 59, 0.8)" }} />

                                {/* Features */}
                                <div className="p-8 pt-6 flex-1">
                                    <ul className="space-y-4">
                                        {plan.features.map((feature, i) => (
                                            <li key={i} className="flex items-start gap-3">
                                                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-emerald-500/10">
                                                    <Check className="h-3 w-3 text-emerald-400" />
                                                </div>
                                                <span className="text-sm text-slate-300 leading-relaxed">{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* CTA */}
                                <div className="p-8 pt-0">
                                    <button
                                        className={`w-full h-12 rounded-xl text-base font-semibold transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                            isHighlighted
                                                ? "bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/20"
                                                : "border border-slate-700 text-white hover:border-indigo-500/50 hover:bg-indigo-500/5"
                                        }`}
                                        onClick={() => handleSelectPlan(plan.id)}
                                        disabled={isCurrentPlan || isLoading || (!pricing?.stripeConfigured && plan.id !== "free")}
                                    >
                                        {isLoading ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Processing...
                                            </span>
                                        ) : (
                                            getButtonText(plan.id)
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="text-center mt-16 space-y-4">
                    {!pricing?.stripeConfigured && (
                        <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4 max-w-md mx-auto">
                            <p className="text-amber-400 text-sm">
                                Payments are not configured. Contact the administrator.
                            </p>
                        </div>
                    )}

                    <p className="text-sm text-slate-500">
                        All plans include end-to-end encryption and post-quantum cryptography.
                    </p>
                    <p className="text-sm text-slate-500">
                        Need more?{" "}
                        <a
                            href="mailto:privacy@stenvault.com"
                            className="text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                            Contact us
                        </a>{" "}
                        for Enterprise plans.
                    </p>
                </div>
            </div>
        </div>
    );
}
