/**
 * Shown on trusted devices when another device is requesting approval.
 * Approving generates fresh UES for the pending device without touching
 * the approving device's own entropy.
 *
 * Usage:
 * <DeviceApprovalModal
 *   pendingDevices={pendingDevices}
 *   onApprove={handleApprove}
 *   onReject={handleReject}
 *   isOpen={isOpen}
 *   onClose={onClose}
 * />
 */

import { useState, useEffect } from 'react';
import {
    Check,
    X,
    Loader2,
    MapPin,
    Clock,
    AlertTriangle,
    ShieldCheck,
    ShieldX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { getDeviceFingerprintHash } from '@/lib/deviceEntropy';
import { exportUESForServer } from '@/lib/uesManager';
import { useMasterKey } from '@/hooks/useMasterKey';
import { DeviceIcon } from '@/components/ui/DeviceIcon';

export interface PendingDeviceInfo {
    id: number;
    deviceName: string | null;
    platform: string;
    browserInfo: string | null;
    ipAddress: string | null;
    location: string | null;
    createdAt: Date;
    browserName: string | null;
    browserVersion: string | null;
    osName: string | null;
    osVersion: string | null;
    deviceType: string | null;
}

interface DeviceApprovalModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApprovalComplete?: () => void;
}

export default function DeviceApprovalModal({
    isOpen,
    onClose,
    onApprovalComplete,
}: DeviceApprovalModalProps) {
    const { getCachedKey } = useMasterKey();
    const [processingId, setProcessingId] = useState<number | null>(null);
    const [currentFingerprint, setCurrentFingerprint] = useState<string>('');

    // Fetch pending devices
    const { data: pendingDevices, refetch } = trpc.devices.listPendingApprovals.useQuery();

    // Mutations
    const approveMutation = trpc.deviceApproval.approveDevice.useMutation();
    const rejectMutation = trpc.deviceApproval.rejectDevice.useMutation();

    // Get current device fingerprint on mount
    useEffect(() => {
        getDeviceFingerprintHash().then(setCurrentFingerprint);
    }, []);

    const handleApprove = async (device: PendingDeviceInfo) => {
        if (!currentFingerprint) {
            toast.error('Device fingerprint not available');
            return;
        }

        const bundle = getCachedKey();
        if (!bundle) {
            toast.error('Vault is locked. Please unlock first.');
            return;
        }

        setProcessingId(device.id);
        try {
            // Generate fresh random UES for the pending device (256-bit)
            // IMPORTANT: Do NOT call generateAndStoreUES() here — that would
            // overwrite the approving device's own UES in localStorage.
            // The pending device will receive these bytes via importUESFromServer()
            // and re-encrypt them with its own device fingerprint.
            const pendingDeviceUES = crypto.getRandomValues(new Uint8Array(32));
            const exported = await exportUESForServer(pendingDeviceUES, bundle);

            await approveMutation.mutateAsync({
                pendingDeviceId: device.id,
                approvingDeviceFingerprint: currentFingerprint,
                uesEncrypted: exported.uesEncrypted,
                uesEncryptionIv: exported.uesIv,
            });

            toast.success(`${device.deviceName || 'Device'} approved!`);
            refetch();
            onApprovalComplete?.();
        } catch (error: unknown) {
            console.error('Failed to approve device:', error);
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('FORBIDDEN') || message.includes('forbidden')) {
                toast.error('Your device is not authorized to approve other devices');
            } else if (message.includes('NOT_FOUND') || message.includes('not found')) {
                toast.error('This approval request has expired or was already processed');
            } else if (message.includes('OperationError') || message.includes('encrypt') || message.includes('decrypt')) {
                toast.error('Encryption error. Please unlock your vault and try again.');
            } else {
                toast.error('Failed to approve device', { description: message });
            }
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (device: PendingDeviceInfo) => {
        if (!currentFingerprint) {
            toast.error('Device fingerprint not available');
            return;
        }

        setProcessingId(device.id);
        try {
            await rejectMutation.mutateAsync({
                pendingDeviceId: device.id,
                approvingDeviceFingerprint: currentFingerprint,
            });

            toast.success(`${device.deviceName || 'Device'} rejected`);
            refetch();
            onApprovalComplete?.();
        } catch (error: unknown) {
            console.error('Failed to reject device:', error);
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('NOT_FOUND') || message.includes('not found')) {
                toast.error('This request has expired or was already processed');
            } else {
                toast.error('Failed to reject device', { description: message });
            }
        } finally {
            setProcessingId(null);
        }
    };

    const formatTimeAgo = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - new Date(date).getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    };

    const devices = pendingDevices || [];

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-primary/10">
                            <ShieldCheck className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <DialogTitle>Device Approval Requests</DialogTitle>
                            <DialogDescription>
                                {devices.length} device{devices.length !== 1 ? 's' : ''} waiting for approval
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-3 max-h-80 overflow-y-auto">
                    {devices.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <ShieldCheck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>No pending approval requests</p>
                        </div>
                    ) : (
                        devices.map((device) => (
                            <div
                                key={device.id}
                                className={cn(
                                    "p-4 rounded-lg border transition-colors",
                                    processingId === device.id
                                        ? "bg-muted/50 border-border"
                                        : "bg-muted/30 border-border/60 hover:border-border"
                                )}
                            >
                                {/* Device Header */}
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                                            <DeviceIcon
                                                platform={device.platform}
                                                deviceType={device.deviceType}
                                                className="w-5 h-5"
                                            />
                                        </div>
                                        <div>
                                            <h4 className="font-medium text-foreground">
                                                {device.deviceName || 'Unknown Device'}
                                            </h4>
                                            <p className="text-xs text-muted-foreground">
                                                {device.browserName && device.osName
                                                    ? `${device.browserName}${device.browserVersion ? ` ${device.browserVersion}` : ''} on ${device.osName}${device.osVersion ? ` ${device.osVersion}` : ''}`
                                                    : device.platform}
                                                {device.deviceType && device.deviceType !== 'unknown' && (
                                                    <span className="capitalize">{` \u00B7 ${device.deviceType}`}</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Device Details */}
                                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                                    {device.ipAddress && device.ipAddress !== 'Unknown' && (
                                        <span className="flex items-center gap-1 font-mono">
                                            {device.ipAddress}
                                        </span>
                                    )}
                                    {device.location && (
                                        <span className="flex items-center gap-1">
                                            <MapPin className="w-3 h-3" />
                                            {device.location}
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {formatTimeAgo(device.createdAt)}
                                    </span>
                                </div>

                                {/* Warning */}
                                <div className="flex items-start gap-2 p-2 rounded bg-amber-500/5 border border-amber-500/20 mb-3">
                                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    <p className="text-xs text-amber-300/70">
                                        Only approve if you recognize this login attempt
                                    </p>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                        onClick={() => handleReject(device)}
                                        disabled={processingId !== null}
                                    >
                                        {processingId === device.id ? (
                                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                        ) : (
                                            <ShieldX className="w-4 h-4 mr-1" />
                                        )}
                                        Reject
                                    </Button>
                                    <Button
                                        className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                                        onClick={() => handleApprove(device)}
                                        disabled={processingId !== null}
                                    >
                                        {processingId === device.id ? (
                                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                        ) : (
                                            <Check className="w-4 h-4 mr-1" />
                                        )}
                                        Approve
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
