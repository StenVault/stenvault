import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@stenvault/shared/ui/card";
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
        <Card className="border-2 border-gray-100 dark:border-gray-800 shadow-sm">
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 shrink-0">
                            <Clock className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div className="min-w-0">
                            <CardTitle>Vault Timeout</CardTitle>
                            <CardDescription>
                                Automatically lock your vault after a period of inactivity
                            </CardDescription>
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
            </CardHeader>
            {isNeverSelected && (
                <CardContent>
                    <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <AlertTitle className="text-amber-800 dark:text-amber-200">Security Warning</AlertTitle>
                        <AlertDescription className="text-amber-700 dark:text-amber-300">
                            Disabling vault timeout means your vault stays unlocked indefinitely.
                            Anyone with access to your device can view your files.
                        </AlertDescription>
                    </Alert>
                </CardContent>
            )}
            {serverDisabledGlobally && (
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        Vault timeout has been disabled by the server administrator.
                    </p>
                </CardContent>
            )}
        </Card>
    );
}
