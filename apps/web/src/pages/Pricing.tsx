/**
 * Pricing Page
 * Shows subscription plans with per-seat pricing for Business
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, Crown, Users, Loader2, ArrowLeft, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

export default function Pricing() {
    const [, navigate] = useLocation();
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
    const [seats, setSeats] = useState(3);

    const { data: user } = trpc.auth.me.useQuery();
    const { data: pricing, isLoading: loadingPricing } = trpc.stripe.getPricing.useQuery();
    const { data: subscription } = trpc.stripe.getSubscription.useQuery(
        undefined,
        { enabled: !!user }
    );

    const createCheckout = trpc.stripe.createCheckout.useMutation({
        onSuccess: (data) => {
            if (data.url) {
                window.location.href = data.url;
            }
        },
        onError: (error) => {
            toast.error(error.message || "Failed to create checkout");
            setSelectedPlan(null);
        },
    });

    const handleSelectPlan = async (planId: string) => {
        if (planId === "free") {
            if (!user) {
                navigate("/auth/register");
            }
            return;
        }

        if (!user) {
            navigate("/auth/login");
            return;
        }

        if (planId === subscription?.plan) {
            toast.info("You already have this plan active!");
            return;
        }

        setSelectedPlan(planId);
        try {
            await createCheckout.mutateAsync({
                plan: planId as "pro" | "business",
                billingCycle,
                ...(planId === "business" ? { seats } : {}),
            });
        } catch {
            // Error handled in onError
        }
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
            return planId === "free" ? "Create Free Account" : "Log In to Continue";
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
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
            <div className="container mx-auto px-4 py-8 md:py-16">
                {/* Back button */}
                <Button
                    variant="ghost"
                    onClick={() => navigate("/")}
                    className="mb-8"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                </Button>

                {/* Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                        Simple and Transparent Pricing
                    </h1>
                    <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                        Start free. Upgrade when you need to. No surprises.
                    </p>

                    {/* Billing cycle toggle */}
                    <div className="flex items-center justify-center gap-3 mt-6">
                        <span className={`text-sm font-medium ${billingCycle === "monthly" ? "text-foreground" : "text-muted-foreground"}`}>
                            Monthly
                        </span>
                        <button
                            onClick={() => setBillingCycle(prev => prev === "monthly" ? "yearly" : "monthly")}
                            className="relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            style={{ backgroundColor: billingCycle === "yearly" ? "hsl(var(--primary))" : "hsl(var(--muted))" }}
                        >
                            <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${billingCycle === "yearly" ? "translate-x-8" : "translate-x-1"}`}
                            />
                        </button>
                        <span className={`text-sm font-medium ${billingCycle === "yearly" ? "text-foreground" : "text-muted-foreground"}`}>
                            Yearly
                        </span>
                        {billingCycle === "yearly" && (
                            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                Save up to 20%
                            </Badge>
                        )}
                    </div>

                    {subscription && subscription.plan !== "free" && (
                        <Badge variant="outline" className="mt-4">
                            Current plan: {subscription.plan.toUpperCase()} ({subscription.status})
                        </Badge>
                    )}
                </div>

                {/* Pricing Cards */}
                <div className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
                    {pricing?.plans.map((plan) => {
                        const Icon = getIcon(plan.id);
                        const isCurrentPlan = subscription?.plan === plan.id;
                        const isLoading = selectedPlan === plan.id && createCheckout.isPending;
                        const displayPrice = getDisplayPrice(plan);

                        return (
                            <Card
                                key={plan.id}
                                className={`relative flex flex-col transition-all duration-300 ${plan.highlighted
                                    ? "border-primary shadow-xl shadow-primary/20 scale-[1.02] md:scale-105"
                                    : "border-border hover:border-primary/50"
                                    } ${isCurrentPlan ? "ring-2 ring-green-500" : ""}`}
                            >
                                {/* Popular Badge */}
                                {plan.highlighted && (
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium whitespace-nowrap">
                                        Most Popular
                                    </div>
                                )}

                                {/* Current Plan Badge */}
                                {isCurrentPlan && (
                                    <div className="absolute -top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-medium">
                                        Active
                                    </div>
                                )}

                                <CardHeader className="text-center pb-4">
                                    <div className="flex items-center justify-center gap-2 mb-2">
                                        <Icon className={`h-6 w-6 ${plan.highlighted ? "text-primary" : "text-muted-foreground"}`} />
                                        <CardTitle className="text-2xl">{plan.name}</CardTitle>
                                    </div>

                                    <div className="mt-4">
                                        <span className="text-5xl font-bold">
                                            {displayPrice.main}
                                        </span>
                                        {displayPrice.suffix && (
                                            <span className="text-muted-foreground text-lg">{displayPrice.suffix}</span>
                                        )}
                                        {displayPrice.total && (
                                            <div className="text-muted-foreground text-sm mt-1">
                                                {displayPrice.total}
                                            </div>
                                        )}
                                    </div>

                                    {/* Seat stepper for Business */}
                                    {plan.perUser && plan.id === "business" && (
                                        <div className="mt-4 flex items-center justify-center gap-3">
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => setSeats(s => Math.max(plan.minUsers || 3, s - 1))}
                                                disabled={seats <= (plan.minUsers || 3)}
                                            >
                                                <Minus className="h-4 w-4" />
                                            </Button>
                                            <span className="text-lg font-semibold w-12 text-center">{seats}</span>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => setSeats(s => s + 1)}
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                            <span className="text-sm text-muted-foreground">users</span>
                                        </div>
                                    )}

                                    <CardDescription className="mt-2">
                                        {plan.id === "free" && "Perfect to get started"}
                                        {plan.id === "pro" && "For power users"}
                                        {plan.id === "business" && `For teams (min ${plan.minUsers || 3} users)`}
                                    </CardDescription>
                                </CardHeader>

                                <CardContent className="flex-1">
                                    <ul className="space-y-3">
                                        {plan.features.map((feature, i) => (
                                            <li key={i} className="flex items-start gap-3">
                                                <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                                                <span className="text-sm">{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>

                                <CardFooter>
                                    <Button
                                        className="w-full h-12 text-base"
                                        variant={plan.highlighted ? "default" : "outline"}
                                        onClick={() => handleSelectPlan(plan.id)}
                                        disabled={isCurrentPlan || isLoading || (!pricing?.stripeConfigured && plan.id !== "free")}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Processing...
                                            </>
                                        ) : (
                                            getButtonText(plan.id)
                                        )}
                                    </Button>
                                </CardFooter>
                            </Card>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="text-center mt-12 space-y-4">
                    {!pricing?.stripeConfigured && (
                        <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 max-w-md mx-auto">
                            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                                Payments are not configured. Contact the administrator.
                            </p>
                        </div>
                    )}

                    <p className="text-sm text-muted-foreground">
                        All plans include end-to-end encryption and post-quantum cryptography.
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Need more?{" "}
                        <a
                            href="mailto:sales@cloudvault.io"
                            className="text-primary underline hover:no-underline"
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
