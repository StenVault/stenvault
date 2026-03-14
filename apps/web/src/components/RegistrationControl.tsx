/**
 * Registration Control Component
 * 
 * Admin panel component for managing:
 * - Public registration toggle
 * - Invite code requirement
 * - Custom registration closed message
 * - Invite code generation and management
 * 
 * @module RegistrationControl
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
    UserPlus,
    Key,
    Copy,
    Trash2,
    RefreshCw,
    Plus,
    Clock,
    Users,
    Shield,
    AlertTriangle,
    CheckCircle2,
    Ban,
    Eye,
} from "lucide-react";

export function RegistrationControl() {
    const utils = trpc.useUtils();

    // Queries
    const { data: settings, isLoading: settingsLoading } = trpc.admin.getRegistrationSettings.useQuery();
    const { data: codes, isLoading: codesLoading, refetch: refetchCodes } = trpc.admin.getInviteCodes.useQuery({
        includeRevoked: false,
        includeExpired: false,
    });

    // Mutations
    const updateSettingsMutation = trpc.admin.updateRegistrationSettings.useMutation({
        onSuccess: () => {
            toast.success("Registration settings updated");
            utils.admin.getRegistrationSettings.invalidate();
        },
        onError: (error) => {
            toast.error(`Failed to update settings: ${error.message}`);
        },
    });

    const createCodeMutation = trpc.admin.createInviteCode.useMutation({
        onSuccess: (data) => {
            toast.success(`Code "${data.code}" created successfully`);
            setNewCodeDialogOpen(false);
            resetNewCodeForm();
            utils.admin.getInviteCodes.invalidate();
            utils.admin.getRegistrationSettings.invalidate();
        },
        onError: (error) => {
            toast.error(`Failed to create code: ${error.message}`);
        },
    });

    const revokeCodeMutation = trpc.admin.revokeInviteCode.useMutation({
        onSuccess: () => {
            toast.success("Code revoked");
            utils.admin.getInviteCodes.invalidate();
            utils.admin.getRegistrationSettings.invalidate();
        },
        onError: (error) => {
            toast.error(`Failed to revoke code: ${error.message}`);
        },
    });

    // Usage history
    const [usageCodeId, setUsageCodeId] = useState<number | null>(null);
    const { data: usageHistory, isLoading: usageLoading } = trpc.admin.getCodeUsageHistory.useQuery(
        { codeId: usageCodeId! },
        { enabled: usageCodeId !== null }
    );

    // Local state
    const [newCodeDialogOpen, setNewCodeDialogOpen] = useState(false);
    const [newCodeForm, setNewCodeForm] = useState({
        label: "",
        maxUses: "",
        expiresInDays: "",
        customCode: "",
    });

    const resetNewCodeForm = () => {
        setNewCodeForm({
            label: "",
            maxUses: "",
            expiresInDays: "",
            customCode: "",
        });
    };

    const handleCreateCode = () => {
        createCodeMutation.mutate({
            label: newCodeForm.label || undefined,
            maxUses: newCodeForm.maxUses ? parseInt(newCodeForm.maxUses) : undefined,
            expiresInDays: newCodeForm.expiresInDays ? parseInt(newCodeForm.expiresInDays) : undefined,
            customCode: newCodeForm.customCode || undefined,
        });
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Code copied to clipboard");
    };

    const formatDate = (date: Date | null) => {
        if (!date) return "Never";
        return new Date(date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    if (settingsLoading) {
        return <div className="p-8 text-center text-muted-foreground">Loading registration settings...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <UserPlus className="h-5 w-5" />
                        Registration Control
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Manage who can register for an account.
                    </p>
                </div>
                <Badge variant={settings?.allowPublicRegistration ? "default" : "secondary"}>
                    {settings?.allowPublicRegistration ? "Open" : "Invite Only"}
                </Badge>
            </div>

            {/* Settings Cards */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Registration Mode */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            Registration Mode
                        </CardTitle>
                        <CardDescription>
                            Control how new users can register.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-start justify-between space-x-4">
                            <div className="space-y-1">
                                <Label className="text-base">Public Registration</Label>
                                <p className="text-xs text-muted-foreground">
                                    Allow anyone to create an account without an invite code.
                                </p>
                            </div>
                            <Switch
                                checked={settings?.allowPublicRegistration ?? true}
                                onCheckedChange={(checked) =>
                                    updateSettingsMutation.mutate({ allowPublicRegistration: checked })
                                }
                            />
                        </div>

                        <div className="flex items-start justify-between space-x-4">
                            <div className="space-y-1">
                                <Label className="text-base">Require Invite Code</Label>
                                <p className="text-xs text-muted-foreground">
                                    Even with public registration, require an invite code.
                                </p>
                            </div>
                            <Switch
                                checked={settings?.requireInviteCode ?? false}
                                onCheckedChange={(checked) =>
                                    updateSettingsMutation.mutate({ requireInviteCode: checked })
                                }
                            />
                        </div>

                        {/* Status indicator */}
                        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${settings?.allowPublicRegistration && !settings?.requireInviteCode
                                ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                                : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
                            }`}>
                            {settings?.allowPublicRegistration && !settings?.requireInviteCode ? (
                                <>
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span>Anyone can register freely</span>
                                </>
                            ) : (
                                <>
                                    <Key className="h-4 w-4" />
                                    <span>
                                        {settings?.requireInviteCode
                                            ? "Invite code required to register"
                                            : "Registration closed without invite code"}
                                    </span>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Custom Message */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            Closed Registration Message
                        </CardTitle>
                        <CardDescription>
                            Message shown when registration is closed or an invite code is required.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Textarea
                            className="min-h-[100px]"
                            placeholder="Registration is currently closed. Please contact the administrator."
                            value={settings?.registrationClosedMessage ?? ""}
                            onChange={(e) => {
                                // Debounced save handled by blur
                            }}
                            onBlur={(e) => {
                                if (e.target.value !== settings?.registrationClosedMessage) {
                                    updateSettingsMutation.mutate({
                                        registrationClosedMessage: e.target.value,
                                    });
                                }
                            }}
                        />
                        <p className="text-xs text-muted-foreground">
                            This message will be displayed on the registration page when users cannot register freely.
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Invite Codes Section */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Key className="h-4 w-4" />
                                Invite Codes
                            </CardTitle>
                            <CardDescription>
                                Generate and manage invite codes for controlled registration.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => refetchCodes()}
                                disabled={codesLoading}
                            >
                                <RefreshCw className={`h-4 w-4 mr-2 ${codesLoading ? "animate-spin" : ""}`} />
                                Refresh
                            </Button>
                            <Dialog open={newCodeDialogOpen} onOpenChange={setNewCodeDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm">
                                        <Plus className="h-4 w-4 mr-2" />
                                        New Code
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Create Invite Code</DialogTitle>
                                        <DialogDescription>
                                            Generate a new invite code for user registration.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="label">Label (optional)</Label>
                                            <Input
                                                id="label"
                                                placeholder="e.g., Beta Testers, VIP Clients"
                                                value={newCodeForm.label}
                                                onChange={(e) => setNewCodeForm({ ...newCodeForm, label: e.target.value })}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                A name to help you identify this code
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="maxUses">Max Uses</Label>
                                                <Input
                                                    id="maxUses"
                                                    type="number"
                                                    min="1"
                                                    placeholder="Unlimited"
                                                    value={newCodeForm.maxUses}
                                                    onChange={(e) => setNewCodeForm({ ...newCodeForm, maxUses: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="expiresInDays">Expires in (days)</Label>
                                                <Input
                                                    id="expiresInDays"
                                                    type="number"
                                                    min="1"
                                                    placeholder="Never"
                                                    value={newCodeForm.expiresInDays}
                                                    onChange={(e) => setNewCodeForm({ ...newCodeForm, expiresInDays: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="customCode">Custom Code (optional)</Label>
                                            <Input
                                                id="customCode"
                                                placeholder="Leave blank for auto-generated"
                                                value={newCodeForm.customCode}
                                                onChange={(e) => setNewCodeForm({ ...newCodeForm, customCode: e.target.value.toUpperCase() })}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                If left blank, a random code will be generated
                                            </p>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setNewCodeDialogOpen(false)}>
                                            Cancel
                                        </Button>
                                        <Button onClick={handleCreateCode} disabled={createCodeMutation.isPending}>
                                            {createCodeMutation.isPending ? "Creating..." : "Create Code"}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {codesLoading ? (
                        <div className="text-center py-8 text-muted-foreground">Loading codes...</div>
                    ) : !codes || codes.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No invite codes yet</p>
                            <p className="text-xs mt-1">Create one to get started</p>
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Label</TableHead>
                                        <TableHead>Usage</TableHead>
                                        <TableHead>Expires</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {codes.map((code) => (
                                        <TableRow key={code.id}>
                                            <TableCell className="font-mono text-sm">
                                                <div className="flex items-center gap-2">
                                                    {code.code}
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    onClick={() => copyToClipboard(code.code)}
                                                                >
                                                                    <Copy className="h-3 w-3" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Copy code</TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {code.label || <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Users className="h-3 w-3 text-muted-foreground" />
                                                    <span>{code.usesCount}</span>
                                                    {code.maxUses && (
                                                        <span className="text-muted-foreground">/ {code.maxUses}</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {code.expiresAt ? (
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                                        <span>{formatDate(code.expiresAt)}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">Never</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {code.isActive ? (
                                                    <Badge variant="default" className="bg-green-500">Active</Badge>
                                                ) : code.isRevoked ? (
                                                    <Badge variant="destructive">Revoked</Badge>
                                                ) : code.isExpired ? (
                                                    <Badge variant="secondary">Expired</Badge>
                                                ) : (
                                                    <Badge variant="secondary">Maxed</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8"
                                                                    onClick={() => setUsageCodeId(code.id)}
                                                                >
                                                                    <Eye className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>View usage</TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8"
                                                                    disabled={!code.isActive || revokeCodeMutation.isPending}
                                                                    onClick={() => revokeCodeMutation.mutate({ codeId: code.id })}
                                                                >
                                                                    <Ban className="h-4 w-4 text-destructive" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Revoke code</TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    {/* Summary */}
                    {codes && codes.length > 0 && (
                        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                            <span>
                                {settings?.activeCodesCount ?? 0} active code{(settings?.activeCodesCount ?? 0) !== 1 ? "s" : ""}
                            </span>
                        </div>
                    )}
                </CardContent>
            </Card>
            {/* Usage History Dialog */}
            <Dialog open={usageCodeId !== null} onOpenChange={(open) => { if (!open) setUsageCodeId(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Code Usage History</DialogTitle>
                        <DialogDescription>
                            Who used this invite code and when.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {usageLoading ? (
                            <div className="text-center py-4 text-muted-foreground">Loading...</div>
                        ) : !usageHistory || usageHistory.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground">
                                No usage recorded for this code.
                            </div>
                        ) : (
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>User</TableHead>
                                            <TableHead>Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {usageHistory.map((usage: any, i: number) => (
                                            <TableRow key={i}>
                                                <TableCell>{usage.userEmail || usage.userId || "Unknown"}</TableCell>
                                                <TableCell>{formatDate(usage.usedAt || usage.createdAt)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setUsageCodeId(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
