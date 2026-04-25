import { SectionCard } from "@stenvault/shared/ui/section-card";
import { AlertTriangle, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "@stenvault/shared/lib/toast";
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from "@/components/ui/alert";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@stenvault/shared/ui/select";

export function VaultTimeoutSection() {
    const utils = trpc.useUtils();
    const { data: timeoutData } = trpc.userPreferences.getInactivityTimeout.useQuery(undefined, {
        staleTime: 300_000,
    });
    const setTimeoutMutation = trpc.userPreferences.setInactivityTimeout.useMutation({
        onSuccess: () => {
            toast.success("Vault timeout updated");
            utils.userPreferences.getInactivityTimeout.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    const currentTimeoutValue = timeoutData?.userTimeoutMinutes === null || timeoutData?.userTimeoutMinutes === undefined
        ? "default"
        : String(timeoutData.userTimeoutMinutes);
    const isNeverSelected = currentTimeoutValue === "0";
    const serverDisabledGlobally = timeoutData?.serverDefaultMinutes === 0;

    return (
        <SectionCard
            icon={Clock}
            title="Vault timeout"
            description="Automatically lock your vault after a period of inactivity"
            action={
                <Select
                    value={currentTimeoutValue}
                    onValueChange={(v) => {
                        const val = v === "default"
                            ? null
                            : (Number(v) as 0 | 1 | 5 | 15 | 30 | 60 | 240);
                        setTimeoutMutation.mutate({ timeoutMinutes: val });
                    }}
                    disabled={serverDisabledGlobally || setTimeoutMutation.isPending}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="default">
                            Default ({timeoutData?.serverDefaultMinutes ?? 15}m)
                        </SelectItem>
                        <SelectItem value="1">1 minute</SelectItem>
                        <SelectItem value="5">5 minutes</SelectItem>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="240">4 hours</SelectItem>
                        <SelectItem value="0">Never</SelectItem>
                    </SelectContent>
                </Select>
            }
        >
            {isNeverSelected && (
                <Alert className="border-[var(--theme-warning)]/30 bg-[var(--theme-warning)]/10">
                    <AlertTriangle className="h-4 w-4 text-[var(--theme-warning)]" />
                    <AlertTitle className="text-[var(--theme-warning)]">Security Warning</AlertTitle>
                    <AlertDescription className="text-[var(--theme-warning)]/80">
                        Disabling vault timeout means your vault stays unlocked indefinitely.
                        Anyone with access to your device can view your files.
                    </AlertDescription>
                </Alert>
            )}
            {serverDisabledGlobally && (
                <p className="text-sm text-muted-foreground">
                    Vault timeout has been disabled by the server administrator.
                </p>
            )}
        </SectionCard>
    );
}
