import { Button } from "@stenvault/shared/ui/button";
import { Badge } from "@stenvault/shared/ui/badge";
import { SectionCard } from "@stenvault/shared/ui/section-card";
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
        <SectionCard
            icon={MailCheck}
            iconClassName={
                isVerified ? "text-[var(--theme-success)]" : "text-[var(--theme-warning)]"
            }
            title="Email Verification"
            badge={
                isVerified ? (
                    <Badge
                        variant="secondary"
                        className="bg-[var(--theme-success)]/15 text-[var(--theme-success)]"
                    >
                        Verified
                    </Badge>
                ) : undefined
            }
            description={
                isVerified
                    ? "Your email has been verified successfully"
                    : "Verify your email to increase account security"
            }
            action={
                !isVerified && (
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
                )
            }
        />
    );
}
