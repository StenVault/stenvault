import { Button } from "@stenvault/shared/ui/button";
import { Badge } from "@stenvault/shared/ui/badge";
import { AuroraCard } from "@stenvault/shared/ui/aurora-card";
import { Loader2, Mail, MailCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "@stenvault/shared/lib/toast";
import { useAuth } from "@/_core/hooks/useAuth";

export function EmailVerificationSection() {
    const { user } = useAuth();
    const resendVerificationMutation = trpc.auth.sendVerificationEmail.useMutation();
    const isVerified = user?.emailVerified ?? false;

    const handleResendVerification = async () => {
        try {
            await resendVerificationMutation.mutateAsync({ email: user?.email || "" });
            toast.success("Verification email resent! Please check your inbox.");
        } catch (error: any) {
            toast.error(error.message || "Error sending email");
        }
    };

    return (
        <AuroraCard variant="default">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className={
                            isVerified
                                ? "p-2 rounded-lg shrink-0 bg-[var(--theme-success)]/15"
                                : "p-2 rounded-lg shrink-0 bg-[var(--theme-warning)]/15"
                        }
                    >
                        <MailCheck
                            className={
                                isVerified
                                    ? "w-6 h-6 text-[var(--theme-success)]"
                                    : "w-6 h-6 text-[var(--theme-warning)]"
                            }
                        />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-foreground">Email Verification</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            {isVerified
                                ? 'Your email has been verified successfully'
                                : 'Verify your email to increase account security'}
                        </p>
                    </div>
                </div>
                {isVerified ? (
                    <Badge
                        variant="secondary"
                        className="bg-[var(--theme-success)]/15 text-[var(--theme-success)]"
                    >
                        Verified
                    </Badge>
                ) : (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResendVerification}
                        disabled={resendVerificationMutation.isPending}
                        className="border-[var(--theme-warning)]/30 text-[var(--theme-warning)] hover:bg-[var(--theme-warning)]/10"
                    >
                        {resendVerificationMutation.isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Mail className="mr-2 h-4 w-4" />
                                Resend Email
                            </>
                        )}
                    </Button>
                )}
            </div>
        </AuroraCard>
    );
}
