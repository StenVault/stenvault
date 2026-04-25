import { AuroraCard } from "@stenvault/shared/ui/aurora-card";
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
        <AuroraCard variant="default">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[var(--theme-bg-elevated)] shrink-0">
                        <Clock className="w-6 h-6 text-[var(--theme-fg-muted)]" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-foreground">Vault timeout</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Automatically lock your vault after a period of inactivity
                        </p>
                    </div>
                </div>
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
                    <SelectTrigger className="w-[160px] shrink-0">
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
            </div>
            {isNeverSelected && (
                <div className="mt-4">
                    <Alert className="border-[var(--theme-warning)]/30 bg-[var(--theme-warning)]/10">
                        <AlertTriangle className="h-4 w-4 text-[var(--theme-warning)]" />
                        <AlertTitle className="text-[var(--theme-warning)]">Security Warning</AlertTitle>
                        <AlertDescription className="text-[var(--theme-warning)]/80">
                            Disabling vault timeout means your vault stays unlocked indefinitely.
                            Anyone with access to your device can view your files.
                        </AlertDescription>
                    </Alert>
                </div>
            )}
            {serverDisabledGlobally && (
                <p className="mt-4 text-sm text-muted-foreground">
                    Vault timeout has been disabled by the server administrator.
                </p>
            )}
        </AuroraCard>
    );
}
