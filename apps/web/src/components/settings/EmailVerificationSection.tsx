import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, MailCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";

export function EmailVerificationSection() {
    const { user } = useAuth();
    const { theme } = useTheme();
    const resendVerificationMutation = trpc.auth.sendVerificationEmail.useMutation();

    const handleResendVerification = async () => {
        try {
            await resendVerificationMutation.mutateAsync({ email: user?.email || "" });
            toast.success("Verification email resent! Please check your inbox.");
        } catch (error: any) {
            toast.error(error.message || "Error sending email");
        }
    };

    return (
        <Card className={`border-2 ${user?.emailVerified ? 'border-green-100 dark:border-green-900' : 'border-amber-100 dark:border-amber-900'} shadow-sm`}>
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div
                            className="p-2 rounded-lg shrink-0"
                            style={{
                                backgroundColor: user?.emailVerified
                                    ? `${theme.semantic.success}15`
                                    : `${theme.semantic.warning}15`
                            }}
                        >
                            <MailCheck
                                className="w-6 h-6"
                                style={{
                                    color: user?.emailVerified
                                        ? theme.semantic.success
                                        : theme.semantic.warning
                                }}
                            />
                        </div>
                        <div className="min-w-0">
                            <CardTitle>Email Verification</CardTitle>
                            <CardDescription>
                                {user?.emailVerified
                                    ? 'Your email has been verified successfully'
                                    : 'Verify your email to increase account security'}
                            </CardDescription>
                        </div>
                    </div>
                    {user?.emailVerified ? (
                        <Badge
                            variant="secondary"
                            style={{
                                backgroundColor: `${theme.semantic.success}15`,
                                color: theme.semantic.success
                            }}
                        >
                            Verified
                        </Badge>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleResendVerification}
                            disabled={resendVerificationMutation.isPending}
                            className="border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
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
            </CardHeader>
        </Card>
    );
}
