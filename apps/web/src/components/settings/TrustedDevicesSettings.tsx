/**
 * Manages the user's trusted devices: list, rename, revoke, and approve
 * pending devices via DeviceApprovalModal. The current device cannot be
 * removed from itself.
 */

import { useState, useEffect } from "react";
import {
    Trash2,
    Edit3,
    Check,
    X,
    Loader2,
    Shield,
    Clock,
    MapPin,
    AlertTriangle,
    Bell,
    CheckCircle2,
} from "lucide-react";
import { AuroraCard } from "@stenvault/shared/ui/aurora-card";
import { Button } from "@stenvault/shared/ui/button";
import { Input } from "@stenvault/shared/ui/input";
import { Badge } from "@stenvault/shared/ui/badge";
import { toast } from "@stenvault/shared/lib/toast";
import { cn } from "@stenvault/shared/utils";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@stenvault/shared/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { getDeviceFingerprintHash } from "@/lib/deviceEntropy";
import DeviceApprovalModal from "@/components/DeviceApprovalModal";
import { StaggerContainer, StaggerItem } from "@stenvault/shared/ui/animated";
import { useTheme } from "@/contexts/ThemeContext";
import { DeviceIcon } from "@/components/ui/DeviceIcon";

interface TrustedDevice {
    id: number;
    deviceName: string | null;
    platform: string;
    approvalStatus: "approved" | "pending" | "rejected" | "expired";
    approvedAt: Date | null;
    lastUsedAt: Date | null;
    usageCount: number;
    createdAt: Date;
    isCurrent: boolean;
    location: string | null;
    browserName: string | null;
    browserVersion: string | null;
    osName: string | null;
    osVersion: string | null;
    deviceType: string | null;
}

export function TrustedDevicesSettings() {
    const { theme } = useTheme();
    const [currentFingerprint, setCurrentFingerprint] = useState<string>("");
    const [editingDevice, setEditingDevice] = useState<number | null>(null);
    const [editName, setEditName] = useState("");
    const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);

    // Fetch trusted devices
    const { data: devices, isLoading, refetch } = trpc.devices.listTrustedDevices.useQuery(
        { deviceFingerprint: currentFingerprint },
        { enabled: !!currentFingerprint }
    );

    // Fetch pending approval count
    const { data: pendingData, refetch: refetchPending } = trpc.deviceApproval.getPendingCount.useQuery();

    // Mutations
    const removeMutation = trpc.devices.removeTrustedDevice.useMutation();
    const renameMutation = trpc.devices.renameTrustedDevice.useMutation();

    // Get current device fingerprint
    useEffect(() => {
        getDeviceFingerprintHash().then(setCurrentFingerprint);
    }, []);

    const formatDate = (date: Date | null) => {
        if (!date) return "Never";
        const d = new Date(date);
        return d.toLocaleDateString(navigator.language, {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const [removeDeviceId, setRemoveDeviceId] = useState<number | null>(null);

    const handleRemove = async (deviceId: number) => {
        try {
            await removeMutation.mutateAsync({ deviceId });
            toast.success("Device removed");
            setRemoveDeviceId(null);
            refetch();
        } catch (error) {
            console.error("Failed to remove device:", error);
            toast.error("Failed to remove device");
        }
    };

    const handleRename = async (deviceId: number) => {
        if (!editName.trim()) {
            toast.error("Name cannot be empty");
            return;
        }

        try {
            await renameMutation.mutateAsync({ deviceId, newName: editName.trim() });
            toast.success("Device renamed");
            setEditingDevice(null);
            setEditName("");
            refetch();
        } catch (error) {
            console.error("Failed to rename device:", error);
            toast.error("Failed to rename device");
        }
    };

    const startEditing = (device: TrustedDevice) => {
        setEditingDevice(device.id);
        setEditName(device.deviceName || "");
    };

    const cancelEditing = () => {
        setEditingDevice(null);
        setEditName("");
    };

    const approvedDevices = devices?.filter(d => d.approvalStatus === "approved") || [];
    const pendingCount = pendingData?.pendingCount || 0;

    return (
        <StaggerContainer className="space-y-6">
            {/* Pending Approvals Alert */}
            {pendingCount > 0 && (
                <StaggerItem>
                    <AuroraCard
                        variant="default"
                        className="border-[var(--theme-warning)]/30 bg-[var(--theme-warning)]/10 cursor-pointer"
                        onClick={() => setIsApprovalModalOpen(true)}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-[var(--theme-warning)]/15">
                                    <Bell className="w-5 h-5 text-[var(--theme-warning)]" />
                                </div>
                                <div>
                                    <p className="font-medium text-[var(--theme-warning)]">
                                        {pendingCount} device{pendingCount > 1 ? "s" : ""} awaiting approval
                                    </p>
                                    <p className="text-sm text-[var(--theme-warning)]/80">
                                        Click to review and approve
                                    </p>
                                </div>
                            </div>
                            <Badge variant="warning">{pendingCount}</Badge>
                        </div>
                    </AuroraCard>
                </StaggerItem>
            )}

            {/* Trusted Devices List */}
            <StaggerItem>
                <AuroraCard variant="default">
                    <div className="mb-4">
                        <h3 className="font-display text-lg flex items-center gap-2 text-foreground">
                            <Shield className="w-5 h-5" style={{ color: theme.brand.primary }} />
                            Trusted Devices
                        </h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Manage devices authorized to access your encrypted vault
                        </p>
                    </div>
                    <div>
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : approvedDevices.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <p>No trusted devices found</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {approvedDevices.map((device) => (
                                    <div
                                        key={device.id}
                                        className={cn(
                                            "p-4 rounded-lg border transition-colors",
                                            device.isCurrent
                                                ? "border-primary/30 bg-primary/5"
                                                : "border-border bg-card/50 hover:bg-card"
                                        )}
                                    >
                                        <div className="flex items-start justify-between">
                                            {/* Device Info */}
                                            <div className="flex items-start gap-3">
                                                <div
                                                    className={cn(
                                                        "p-2.5 rounded-lg",
                                                        device.isCurrent
                                                            ? "bg-primary/10 text-primary"
                                                            : "bg-secondary text-muted-foreground"
                                                    )}
                                                >
                                                    <DeviceIcon
                                                        platform={device.platform}
                                                        deviceType={device.deviceType}
                                                        className="w-5 h-5"
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    {editingDevice === device.id ? (
                                                        <div className="flex items-center gap-2">
                                                            <Input
                                                                value={editName}
                                                                onChange={(e) => setEditName(e.target.value)}
                                                                className="h-8 text-sm"
                                                                autoFocus
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter") handleRename(device.id);
                                                                    if (e.key === "Escape") cancelEditing();
                                                                }}
                                                            />
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-8 w-8"
                                                                onClick={() => handleRename(device.id)}
                                                            >
                                                                <Check className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-8 w-8"
                                                                onClick={cancelEditing}
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <h4 className="font-medium text-foreground flex items-center gap-2">
                                                                {device.deviceName || "Unnamed device"}
                                                                {device.isCurrent && (
                                                                    <Badge variant="outline" className="text-xs">
                                                                        This device
                                                                    </Badge>
                                                                )}
                                                            </h4>
                                                            <p className="text-sm text-muted-foreground">
                                                                {device.browserName && device.osName
                                                                    ? `${device.browserName}${device.browserVersion ? ` ${device.browserVersion}` : ""} on ${device.osName}${device.osVersion ? ` ${device.osVersion}` : ""}`
                                                                    : device.platform}
                                                                {device.deviceType && device.deviceType !== "unknown" && (
                                                                    <span className="ml-1.5 capitalize">
                                                                        {` \u00B7 ${device.deviceType}`}
                                                                    </span>
                                                                )}
                                                            </p>
                                                        </>
                                                    )}

                                                    {/* Device Meta */}
                                                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                                        {device.location && (
                                                            <span className="flex items-center gap-1">
                                                                <MapPin className="w-3 h-3" />
                                                                {device.location}
                                                            </span>
                                                        )}
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            Last used: {formatDate(device.lastUsedAt)}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            {device.usageCount} accesses
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            {!device.isCurrent && editingDevice !== device.id && (
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8"
                                                        onClick={() => startEditing(device)}
                                                    >
                                                        <Edit3 className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                                        onClick={() => setRemoveDeviceId(device.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </AuroraCard>
            </StaggerItem>

            {/* Security Info */}
            <StaggerItem>
                <AuroraCard variant="default">
                    <div className="flex gap-3">
                        <AlertTriangle className="w-5 h-5 text-[var(--theme-warning)] shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                About trusted devices
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Each trusted device holds a unique key that allows fast vault unlocking.
                                Removing a device will require approval from another trusted device or
                                a recovery code.
                            </p>
                        </div>
                    </div>
                </AuroraCard>
            </StaggerItem>

            {/* Remove Device Confirmation */}
            <AlertDialog open={removeDeviceId !== null} onOpenChange={(open) => !open && setRemoveDeviceId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove device?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This device will need to be approved again to access your vault.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => removeDeviceId && handleRemove(removeDeviceId)}
                        >
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Approval Modal */}
            <DeviceApprovalModal
                isOpen={isApprovalModalOpen}
                onClose={() => setIsApprovalModalOpen(false)}
                onApprovalComplete={() => {
                    refetchPending();
                    refetch();
                }}
            />
        </StaggerContainer>
    );
}
