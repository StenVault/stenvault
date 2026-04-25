import { AuroraCard } from "@stenvault/shared/ui/aurora-card";
import { Switch } from "@stenvault/shared/ui/switch";
import { Shield } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "@stenvault/shared/lib/toast";

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
        <AuroraCard variant="default">
            <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[var(--theme-bg-elevated)] shrink-0">
                        <Shield className="w-6 h-6 text-[var(--theme-fg-muted)]" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-foreground">Session History</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Record IP address and browser in your security audit log
                        </p>
                    </div>
                </div>
                <Switch
                    checked={enabled}
                    onCheckedChange={(next) => setMutation.mutate({ enabled: next })}
                    disabled={setMutation.isPending}
                />
            </div>
            <p className="text-sm text-muted-foreground">
                When on, every sign-in and security event stores the IP address
                and user-agent string so you can review them later. When off, only
                the action (for example, "login success") and the timestamp are kept.
                Turning this off clears any IP and browser data already stored for
                your account.
            </p>
        </AuroraCard>
    );
}
