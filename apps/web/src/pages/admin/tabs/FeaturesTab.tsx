/**
 * Features Tab - Admin Panel
 * Toggle application features and configure feature-specific settings.
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Save,
    Loader2,
    Wifi,
    Shield,
    Zap,
    Send,
    Upload,
    Globe,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface FeatureSettings {
    // P2P Sharing
    p2pSharingEnabled: boolean;
    p2pDirectEnabled: boolean;
    p2pMaxFileSizeMB: number;
    trysteroFallbackEnabled: boolean;
    // Public Send
    publicSendEnabled: boolean;
}

export function FeaturesTab() {
    const [settings, setSettings] = useState<FeatureSettings>({
        p2pSharingEnabled: false,
        p2pDirectEnabled: true,
        p2pMaxFileSizeMB: 500,
        trysteroFallbackEnabled: true,
        publicSendEnabled: true,
    });
    const [isSaving, setIsSaving] = useState(false);
    const utils = trpc.useUtils();

    // Fetch P2P Sharing settings
    const { data: p2pEnabled, isLoading: loadingP2P } = trpc.settings.get.useQuery(
        { key: "ENABLE_P2P_SHARING", defaultValue: "false" },
        { staleTime: 5000 }
    );
    const { data: p2pDirectEnabledData, isLoading: loadingP2PDirect } = trpc.settings.get.useQuery(
        { key: "ENABLE_P2P_DIRECT", defaultValue: "true" },
        { staleTime: 5000 }
    );
    const { data: p2pMaxSize, isLoading: loadingP2PSize } = trpc.settings.get.useQuery(
        { key: "P2P_MAX_FILE_SIZE_MB", defaultValue: "500" },
        { staleTime: 5000 }
    );
    const { data: trysteroEnabled, isLoading: loadingTrystero } = trpc.settings.get.useQuery(
        { key: "ENABLE_TRYSTERO_FALLBACK", defaultValue: "true" },
        { staleTime: 5000 }
    );

    // Fetch Public Send settings
    const { data: publicSendData, isLoading: loadingPublicSend } = trpc.settings.get.useQuery(
        { key: "ENABLE_PUBLIC_SEND", defaultValue: "true" },
        { staleTime: 5000 }
    );

    const settingsMutation = trpc.settings.set.useMutation();

    // Sync fetched values
    useEffect(() => {
        if (p2pEnabled !== undefined) {
            setSettings(s => ({ ...s, p2pSharingEnabled: p2pEnabled === "true" }));
        }
        if (p2pDirectEnabledData !== undefined) {
            setSettings(s => ({ ...s, p2pDirectEnabled: p2pDirectEnabledData === "true" }));
        }
        if (p2pMaxSize !== undefined) {
            setSettings(s => ({ ...s, p2pMaxFileSizeMB: parseInt(p2pMaxSize) || 500 }));
        }
        if (trysteroEnabled !== undefined) {
            setSettings(s => ({ ...s, trysteroFallbackEnabled: trysteroEnabled === "true" }));
        }
        if (publicSendData !== undefined) {
            setSettings(s => ({ ...s, publicSendEnabled: publicSendData === "true" }));
        }
    }, [p2pEnabled, p2pDirectEnabledData, p2pMaxSize, trysteroEnabled, publicSendData]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await Promise.all([
                settingsMutation.mutateAsync({ key: "ENABLE_P2P_SHARING", value: String(settings.p2pSharingEnabled) }),
                settingsMutation.mutateAsync({ key: "ENABLE_P2P_DIRECT", value: String(settings.p2pDirectEnabled) }),
                settingsMutation.mutateAsync({ key: "P2P_MAX_FILE_SIZE_MB", value: String(settings.p2pMaxFileSizeMB) }),
                settingsMutation.mutateAsync({ key: "ENABLE_TRYSTERO_FALLBACK", value: String(settings.trysteroFallbackEnabled) }),
                settingsMutation.mutateAsync({ key: "ENABLE_PUBLIC_SEND", value: String(settings.publicSendEnabled) }),
            ]);
            await utils.settings.get.invalidate();
            toast.success("Feature settings saved successfully");
        } catch (error) {
            toast.error("Failed to save settings");
        } finally {
            setIsSaving(false);
        }
    };

    const isLoading = loadingP2P || loadingP2PDirect || loadingP2PSize || loadingTrystero ||
        loadingPublicSend;

    return (
        <div className="space-y-6">
            {/* P2P Sharing / Quantum Mesh Network Feature */}
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                                <Wifi className="h-5 w-5 text-purple-500" />
                            </div>
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    Quantum Mesh Network
                                    <Badge variant="outline" className="text-xs">P2P</Badge>
                                </CardTitle>
                                <CardDescription>
                                    Direct peer-to-peer file sharing with end-to-end encryption
                                </CardDescription>
                            </div>
                        </div>
                        <Badge variant={settings.p2pSharingEnabled ? "default" : "secondary"}>
                            {settings.p2pSharingEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {isLoading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : (
                        <>
                            {/* Enable/Disable Toggle */}
                            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                                <div className="flex items-center gap-3">
                                    <Shield className="h-5 w-5 text-muted-foreground" />
                                    <div>
                                        <Label htmlFor="p2p-enabled" className="text-base font-medium">
                                            Enable P2P Sharing
                                        </Label>
                                        <p className="text-sm text-muted-foreground">
                                            Users can share files directly via WebRTC (server never sees data)
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    id="p2p-enabled"
                                    checked={settings.p2pSharingEnabled}
                                    onCheckedChange={(checked) =>
                                        setSettings(s => ({ ...s, p2pSharingEnabled: checked }))
                                    }
                                />
                            </div>

                            {/* Settings (only show when enabled) */}
                            {settings.p2pSharingEnabled && (
                                <>
                                    {/* P2P Direct (R2 Upload) Toggle */}
                                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
                                        <div className="flex items-center gap-3">
                                            <Upload className="h-5 w-5 text-blue-500" />
                                            <div>
                                                <Label htmlFor="p2p-direct" className="text-base font-medium">
                                                    P2P Direct (R2 Upload)
                                                </Label>
                                                <p className="text-sm text-muted-foreground">
                                                    E2E encrypted file transfers via server relay when WebRTC fails
                                                </p>
                                            </div>
                                        </div>
                                        <Switch
                                            id="p2p-direct"
                                            checked={settings.p2pDirectEnabled}
                                            onCheckedChange={(checked) =>
                                                setSettings(s => ({ ...s, p2pDirectEnabled: checked }))
                                            }
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="p2p-max-size">Max File Size (MB)</Label>
                                            <Input
                                                id="p2p-max-size"
                                                type="number"
                                                min={10}
                                                max={5000}
                                                value={settings.p2pMaxFileSizeMB}
                                                onChange={(e) =>
                                                    setSettings(s => ({ ...s, p2pMaxFileSizeMB: parseInt(e.target.value) || 500 }))
                                                }
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Maximum file size for P2P transfers (capped by ENV)
                                            </p>
                                        </div>
                                    </div>

                                    {/* Trystero Fallback Toggle */}
                                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
                                        <div className="flex items-center gap-3">
                                            <Zap className="h-5 w-5 text-amber-500" />
                                            <div>
                                                <Label htmlFor="trystero-enabled" className="text-base font-medium">
                                                    Trystero Fallback (P2P Mesh)
                                                </Label>
                                                <p className="text-sm text-muted-foreground">
                                                    Use BitTorrent DHT for signaling when backend is slow/down
                                                </p>
                                                <p className="text-xs text-muted-foreground/70 mt-1">
                                                    Note: Trackers see IP addresses but never file contents
                                                </p>
                                            </div>
                                        </div>
                                        <Switch
                                            id="trystero-enabled"
                                            checked={settings.trysteroFallbackEnabled}
                                            onCheckedChange={(checked) =>
                                                setSettings(s => ({ ...s, trysteroFallbackEnabled: checked }))
                                            }
                                        />
                                    </div>
                                </>
                            )}

                            {/* Features info */}
                            <div className="p-4 rounded-lg border border-border/50 bg-muted/30">
                                <p className="text-sm font-medium mb-2">Features:</p>
                                <ul className="text-xs text-muted-foreground space-y-1">
                                    <li>• Direct browser-to-browser transfer via WebRTC</li>
                                    <li>• Double encryption (E2E + Transport layer)</li>
                                    <li>• Server never sees file contents (only signaling)</li>
                                    <li>• Shamir's Secret Sharing (K-of-N recovery)</li>
                                </ul>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Public Send Feature */}
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20">
                                <Globe className="h-5 w-5 text-indigo-500" />
                            </div>
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    Public Send
                                    <Badge variant="outline" className="text-xs">/send</Badge>
                                </CardTitle>
                                <CardDescription>
                                    Anonymous encrypted file sharing — no account required
                                </CardDescription>
                            </div>
                        </div>
                        <Badge variant={settings.publicSendEnabled ? "default" : "secondary"}>
                            {settings.publicSendEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {isLoading ? (
                        <Skeleton className="h-10 w-full" />
                    ) : (
                        <>
                            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                                <div className="flex items-center gap-3">
                                    <Send className="h-5 w-5 text-muted-foreground" />
                                    <div>
                                        <Label htmlFor="public-send-enabled" className="text-base font-medium">
                                            Enable Public Send
                                        </Label>
                                        <p className="text-sm text-muted-foreground">
                                            Anyone with the link can upload encrypted files (key stays in URL fragment)
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    id="public-send-enabled"
                                    checked={settings.publicSendEnabled}
                                    onCheckedChange={(checked) =>
                                        setSettings(s => ({ ...s, publicSendEnabled: checked }))
                                    }
                                />
                            </div>

                            <div className="p-4 rounded-lg border border-border/50 bg-muted/30">
                                <p className="text-sm font-medium mb-2">How it works:</p>
                                <ul className="text-xs text-muted-foreground space-y-1">
                                    <li>• Client generates AES-256-GCM key, encrypts in 5MB chunks</li>
                                    <li>• Key placed in URL fragment (#key=...) — never sent to server</li>
                                    <li>• Sessions stored in Redis with configurable TTL (1h/24h/7d)</li>
                                    <li>• Requires FEATURE_PUBLIC_SEND=true env var as master switch</li>
                                </ul>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving || isLoading} size="lg">
                    {isSaving ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>
                            <Save className="mr-2 h-4 w-4" />
                            Save All Changes
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
