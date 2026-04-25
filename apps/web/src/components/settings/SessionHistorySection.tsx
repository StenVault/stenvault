import { SectionCard } from "@stenvault/shared/ui/section-card";
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
        <SectionCard
            icon={Shield}
            title="Session History"
            badge={
                <Switch
                    aria-label="Session history enabled"
                    checked={enabled}
                    onCheckedChange={(next) => setMutation.mutate({ enabled: next })}
                    disabled={setMutation.isPending}
                />
            }
            description={`Record IP address and browser in your security audit log. When on, every sign-in and security event stores the IP address and user-agent string so you can review them later. When off, only the action (for example, "login success") and the timestamp are kept. Turning this off clears any IP and browser data already stored for your account.`}
        />
    );
}
