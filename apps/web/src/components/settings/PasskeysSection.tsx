import { useState } from "react";
import { Button } from "@stenvault/shared/ui/button";
import { Badge } from "@stenvault/shared/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@stenvault/shared/ui/card";
import { Input } from "@stenvault/shared/ui/input";
import { Label } from "@stenvault/shared/ui/label";
import {
    Loader2,
    Fingerprint,
    Trash2,
} from "lucide-react";
import { browserSupportsWebAuthn, startRegistration as startPasskeyRegistration } from "@simplewebauthn/browser";
import { trpc } from "@/lib/trpc";
import { toast } from "@stenvault/shared/lib/toast";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@stenvault/shared/ui/dialog";

export function PasskeysSection() {
    const [passkeyRegisterOpen, setPasskeyRegisterOpen] = useState(false);
    const [passkeyDeleteOpen, setPasskeyDeleteOpen] = useState<number | null>(null);
    const [passkeyFriendlyName, setPasskeyFriendlyName] = useState("");
    const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
    const [passkeyMfaToken, setPasskeyMfaToken] = useState("");

    const { data: mfaStatus } = trpc.mfa.getStatus.useQuery();
    const { data: passkeys, refetch: refetchPasskeys } = trpc.passkeys.list.useQuery();
    const generateRegOptionsMutation = trpc.passkeys.generateRegistrationOptions.useMutation();
    const verifyRegMutation = trpc.passkeys.verifyRegistration.useMutation();
    const deletePasskeyMutation = trpc.passkeys.delete.useMutation();

    const handleRegisterPasskey = async () => {
        try {
            setIsRegisteringPasskey(true);
            const { options, challengeId } = await generateRegOptionsMutation.mutateAsync({
                friendlyName: passkeyFriendlyName || undefined,
                mfaToken: passkeyMfaToken || undefined,
            });

            const credential = await startPasskeyRegistration({ optionsJSON: options });

            await verifyRegMutation.mutateAsync({ challengeId, credential: credential as any });
            toast.success("Passkey registered!");
            setPasskeyRegisterOpen(false);
            setPasskeyFriendlyName("");
            setPasskeyMfaToken("");
            refetchPasskeys();
        } catch (error: any) {
            if (error?.name === "NotAllowedError") return;
            toast.error(error?.message || "Failed to register passkey");
        } finally {
            setIsRegisteringPasskey(false);
        }
    };

    const handleDeletePasskey = async (id: number) => {
        try {
            await deletePasskeyMutation.mutateAsync({ passkeyId: id });
            toast.success("Passkey removed");
            setPasskeyDeleteOpen(null);
            refetchPasskeys();
        } catch (error: any) {
            toast.error(error?.message || "Failed to remove passkey");
        }
    };

    if (!browserSupportsWebAuthn()) return null;

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950 shrink-0">
                                <Fingerprint className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div className="min-w-0">
                                <CardTitle>Passkeys</CardTitle>
                                <CardDescription>
                                    Sign in with biometrics or security keys instead of a password
                                </CardDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {passkeys && passkeys.length > 0 && (
                                <Badge variant="secondary">{passkeys.length}</Badge>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPasskeyRegisterOpen(true)}
                            >
                                <Fingerprint className="mr-2 h-4 w-4" />
                                Add Passkey
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                {passkeys && passkeys.length > 0 && (
                    <CardContent>
                        <div className="space-y-3">
                            {passkeys.map((pk) => (
                                <div
                                    key={pk.id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Fingerprint className="h-5 w-5 text-slate-400 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">
                                                {pk.friendlyName || "Unnamed passkey"}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                Added {new Date(pk.createdAt).toLocaleDateString()}
                                                {pk.lastUsedAt && ` \u00b7 Last used ${new Date(pk.lastUsedAt).toLocaleDateString()}`}
                                                {pk.backedUp && " \u00b7 Synced"}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPasskeyDeleteOpen(pk.id)}
                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                )}
            </Card>

            {/* Passkey Register Dialog */}
            <Dialog open={passkeyRegisterOpen} onOpenChange={(open) => {
                if (!open) {
                    setPasskeyRegisterOpen(false);
                    setPasskeyFriendlyName("");
                    setPasskeyMfaToken("");
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Fingerprint className="w-5 h-5" />
                            Register Passkey
                        </DialogTitle>
                        <DialogDescription>
                            Add a passkey to sign in with biometrics or a security key.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {mfaStatus?.enabled && (
                            <div className="space-y-2">
                                <Label htmlFor="passkey-mfa-code">Authenticator code</Label>
                                <Input
                                    id="passkey-mfa-code"
                                    value={passkeyMfaToken}
                                    onChange={(e) => setPasskeyMfaToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    placeholder="000000"
                                    maxLength={6}
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    autoFocus
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="passkey-name">Name (optional)</Label>
                            <Input
                                id="passkey-name"
                                value={passkeyFriendlyName}
                                onChange={(e) => setPasskeyFriendlyName(e.target.value)}
                                placeholder='e.g. "MacBook Pro" or "iPhone"'
                                maxLength={100}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setPasskeyRegisterOpen(false); setPasskeyFriendlyName(""); setPasskeyMfaToken(""); }}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleRegisterPasskey}
                            disabled={isRegisteringPasskey || (mfaStatus?.enabled && passkeyMfaToken.length !== 6)}
                        >
                            {isRegisteringPasskey ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Registering...</>
                            ) : (
                                "Register"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Passkey Delete Confirmation Dialog */}
            <Dialog open={passkeyDeleteOpen !== null} onOpenChange={(open) => { if (!open) setPasskeyDeleteOpen(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove Passkey</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to remove this passkey? You will no longer be able to sign in with it.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPasskeyDeleteOpen(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => passkeyDeleteOpen !== null && handleDeletePasskey(passkeyDeleteOpen)}
                            disabled={deletePasskeyMutation.isPending}
                        >
                            {deletePasskeyMutation.isPending ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Removing...</>
                            ) : (
                                "Remove"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
