import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Shield } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "@/lib/toast";

export function SessionHistorySection() {
    const utils = trpc.useUtils();
    const { data } = trpc.userPreferences.getSessionHistoryEnabled.useQuery(undefined, {
        staleTime: 300_000,
    });
    const setMutation = trpc.userPreferences.setSessionHistoryEnabled.useMutation({
        onSuccess: (res) => {
            toast.success(
                res.enabled
                    ? "Session history enabled"
                    : "Session history disabled — past entries cleared",
            );
            utils.userPreferences.getSessionHistoryEnabled.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    const enabled = data?.enabled ?? false;

    return (
        <Card className="border-2 border-gray-100 dark:border-gray-800 shadow-sm">
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 shrink-0">
                            <Shield className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div className="min-w-0">
                            <CardTitle>Session History</CardTitle>
                            <CardDescription>
                                Record IP address and browser in your security audit log
                            </CardDescription>
                        </div>
                    </div>
                    <Switch
                        checked={enabled}
                        onCheckedChange={(next) => setMutation.mutate({ enabled: next })}
                        disabled={setMutation.isPending}
                    />
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">
                    When on, every sign-in and security event stores the IP address
                    and user-agent string so you can review them later. When off, only
                    the action (for example, "login success") and the timestamp are kept.
                    Turning this off clears any IP and browser data already stored for
                    your account.
                </p>
            </CardContent>
        </Card>
    );
}
