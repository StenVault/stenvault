/**
 * ShareChooserModal Component
 * 
 * Modal that allows users to choose between Email Share and P2P Share.
 * Shows P2P option only when the feature is enabled.
 */

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Wifi, Shield, Zap, Clock, Users, ArrowRight, Loader2, CloudUpload, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

// Import the actual share modals
import { ShareFileModal } from '@/components/ShareFileModal';
import { P2PShareModal, OfflineShareModal } from '@/components/p2p';

interface ShareChooserModalProps {
    open: boolean;
    onClose: () => void;
    file: {
        id: number;
        filename: string;
        decryptedFilename?: string;
        size?: number | null;
        encryptionSalt?: string | null;
        encryptionVersion?: number | null;
        createdAt?: Date;
    } | null;
}

type ShareMethod = 'email' | 'p2p' | 'offline' | null;

export function ShareChooserModal({ open, onClose, file }: ShareChooserModalProps) {
    const [selectedMethod, setSelectedMethod] = useState<ShareMethod>(null);

    // Check if P2P is enabled (server toggle)
    const { data: p2pEnabled, isLoading: loadingP2P } = trpc.p2p.isEnabled.useQuery(
        undefined,
        { enabled: open, staleTime: 30000 }
    );

    // Check if user's plan includes P2P
    const { data: subscription } = trpc.stripe.getSubscription.useQuery(undefined, {
        enabled: open,
        staleTime: 60000,
    });
    const hasPlanP2P = subscription?.isAdmin || subscription?.features?.p2pQuantumMesh === true;

    // Reset when modal closes
    useEffect(() => {
        if (!open) {
            setSelectedMethod(null);
        }
    }, [open]);

    // If a method is selected, show that modal instead
    if (selectedMethod === 'email') {
        return (
            <ShareFileModal
                open={open}
                onClose={() => {
                    setSelectedMethod(null);
                    onClose();
                }}
                file={file}
            />
        );
    }

    if (selectedMethod === 'p2p' && file) {
        return (
            <P2PShareModal
                open={open}
                onOpenChange={(isOpen) => {
                    if (!isOpen) {
                        setSelectedMethod(null);
                        onClose();
                    }
                }}
                fileId={file.id}
                fileName={file.decryptedFilename || file.filename}
                fileSize={file.size || 0}
            />
        );
    }

    if (selectedMethod === 'offline' && file) {
        return (
            <OfflineShareModal
                open={open}
                onOpenChange={(isOpen) => {
                    if (!isOpen) {
                        setSelectedMethod(null);
                        onClose();
                    }
                }}
                fileId={file.id}
                fileName={file.decryptedFilename || file.filename}
                fileSize={file.size || 0}
            />
        );
    }

    if (!file) return null;

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary" />
                        Share File
                    </DialogTitle>
                    <DialogDescription>
                        Choose how you want to share <span className="font-medium text-foreground">{file.decryptedFilename || file.filename}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {/* Email Share Option */}
                    <Card
                        className={cn(
                            "cursor-pointer transition-all hover:border-primary/50 hover:shadow-md",
                            "border-2"
                        )}
                        onClick={() => setSelectedMethod('email')}
                    >
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-blue-500/10">
                                        <Mail className="h-5 w-5 text-blue-500" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-base">Email Share</CardTitle>
                                        <CardDescription className="text-xs">
                                            Send via email with download link
                                        </CardDescription>
                                    </div>
                                </div>
                                <ArrowRight className="h-5 w-5 text-muted-foreground" />
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="secondary" className="text-xs">
                                    <Clock className="w-3 h-3 mr-1" />
                                    Expiration options
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                    <Shield className="w-3 h-3 mr-1" />
                                    Password protected
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* P2P Share Option */}
                    {loadingP2P ? (
                        <Card className="border-2 border-dashed opacity-50">
                            <CardContent className="py-6 flex items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                <span className="text-sm text-muted-foreground">Checking P2P availability...</span>
                            </CardContent>
                        </Card>
                    ) : p2pEnabled && hasPlanP2P ? (
                        <Card
                            className={cn(
                                "cursor-pointer transition-all hover:border-purple-500/50 hover:shadow-md",
                                "border-2 bg-gradient-to-br from-purple-500/5 to-blue-500/5"
                            )}
                            onClick={() => setSelectedMethod('p2p')}
                        >
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                                            <Wifi className="h-5 w-5 text-purple-500" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base flex items-center gap-2">
                                                Quantum Mesh Network
                                                <Badge variant="outline" className="text-xs">P2P</Badge>
                                            </CardTitle>
                                            <CardDescription className="text-xs">
                                                Direct browser-to-browser transfer
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                                </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className="flex flex-wrap gap-2">
                                    <Badge variant="secondary" className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400">
                                        <Zap className="w-3 h-3 mr-1" />
                                        Real-time transfer
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                        <Shield className="w-3 h-3 mr-1" />
                                        Server never sees data
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400">
                                        <Users className="w-3 h-3 mr-1" />
                                        Both users online
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>
                    ) : p2pEnabled && !hasPlanP2P ? (
                        <Card
                            className="border-2 border-dashed opacity-60 cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => { onClose(); window.location.href = 'https://stenvault.com/pricing'; }}
                        >
                            <CardContent className="py-6">
                                <div className="flex items-center gap-3 text-muted-foreground">
                                    <div className="p-2 rounded-lg bg-muted">
                                        <Wifi className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium text-sm">Quantum Mesh Network</p>
                                        <p className="text-xs">Available on Pro and Business plans</p>
                                    </div>
                                    <Badge variant="outline" className="text-xs gap-1">
                                        <Lock className="w-3 h-3" />
                                        Pro
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="border-2 border-dashed opacity-50">
                            <CardContent className="py-6">
                                <div className="flex items-center gap-3 text-muted-foreground">
                                    <div className="p-2 rounded-lg bg-muted">
                                        <Wifi className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm">Quantum Mesh Network</p>
                                        <p className="text-xs">P2P sharing is currently disabled by administrator</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Offline Transfer Option */}
                    {p2pEnabled && hasPlanP2P && (
                        <Card
                            className={cn(
                                "cursor-pointer transition-all hover:border-green-500/50 hover:shadow-md",
                                "border-2 bg-gradient-to-br from-green-500/5 to-emerald-500/5"
                            )}
                            onClick={() => setSelectedMethod('offline')}
                        >
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20">
                                            <CloudUpload className="h-5 w-5 text-green-500" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base flex items-center gap-2">
                                                Offline Transfer
                                                <Badge variant="outline" className="text-xs">Delayed</Badge>
                                            </CardTitle>
                                            <CardDescription className="text-xs">
                                                Upload now, recipient downloads later
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                                </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className="flex flex-wrap gap-2">
                                    <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400">
                                        <Clock className="w-3 h-3 mr-1" />
                                        Up to 7 days
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                        <Shield className="w-3 h-3 mr-1" />
                                        E2E Encrypted
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="flex justify-end">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
