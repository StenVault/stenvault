/**
 * Step-Up Dialog
 *
 * Modal that runs a step-up ceremony (OPAQUE password / WebAuthn passkey
 * / TOTP) and returns a single-use token via `onSuccess(token)`. The
 * token is bound server-side to the current session, scope, and
 * securityStamp — middleware will reject it if anything mismatches.
 *
 * Tabs are filtered server-side via `auth.stepUpMethods` — the user only
 * sees methods that are policy-allowed for the requested scope. (TOTP
 * never appears for `mfa:disable` or `passkey:delete`, for example.)
 *
 * Errors are uniform ("Identity check failed") to avoid leaking which
 * factor existed for the user.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, KeyRound, Smartphone, Fingerprint } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@stenvault/shared/ui/dialog";
import { Button } from "@stenvault/shared/ui/button";
import { Input } from "@stenvault/shared/ui/input";
import { Label } from "@stenvault/shared/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@stenvault/shared/ui/tabs";
import { trpc } from "@/lib/trpc";
import { startLogin, finishLogin } from "@/lib/opaqueClient";
import { toast } from "@stenvault/shared/lib/toast";

type StepUpScope =
    | "mfa:enable"
    | "mfa:disable"
    | "passkey:register"
    | "passkey:delete";

type StepUpMethod = "opaque" | "webauthn" | "totp";

interface StepUpDialogProps {
    scope: StepUpScope;
    open: boolean;
    onSuccess: (token: string) => Promise<void> | void;
    onCancel: () => void;
}

const SCOPE_TITLE: Record<StepUpScope, string> = {
    "mfa:enable": "Confirm it's you to set up two-step login",
    "mfa:disable": "Confirm it's you to turn off two-step login",
    "passkey:register": "Confirm it's you to add a passkey",
    "passkey:delete": "Confirm it's you to remove a passkey",
};

const SCOPE_BLURB =
    "We need a fresh proof of identity before changing your sign-in factors. This is to keep your account safe even if a session is hijacked.";

const UNIFORM_ERROR = "Identity check failed. Please try again.";

export function StepUpDialog({ scope, open, onSuccess, onCancel }: StepUpDialogProps) {
    const methodsQuery = trpc.auth.stepUpMethods.useQuery(
        { scope },
        { enabled: open },
    );

    // useMemo so the array reference is stable across renders — otherwise the
    // useEffect dep below sees a fresh ref on every render and refires.
    const available = useMemo<StepUpMethod[]>(
        () => (methodsQuery.data?.available ?? []) as StepUpMethod[],
        [methodsQuery.data?.available],
    );
    const [activeTab, setActiveTab] = useState<StepUpMethod | null>(null);

    // Pick a default tab once methods are loaded.
    useEffect(() => {
        if (!open) {
            setActiveTab(null);
            return;
        }
        if (activeTab && available.includes(activeTab)) return;
        if (available.length > 0) {
            setActiveTab(available[0]!);
        }
    }, [open, available, activeTab]);

    const handleClose = () => {
        if (busy) return;
        onCancel();
    };

    const [busy, setBusy] = useState(false);

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{SCOPE_TITLE[scope]}</DialogTitle>
                    <DialogDescription>{SCOPE_BLURB}</DialogDescription>
                </DialogHeader>

                {methodsQuery.isLoading && (
                    <div className="flex items-center justify-center py-8 text-[var(--theme-fg-muted)]">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading…
                    </div>
                )}

                {!methodsQuery.isLoading && available.length === 0 && (
                    <div className="text-sm text-[var(--theme-fg-muted)] py-4">
                        No identity check method is available for your account. Please
                        contact support.
                    </div>
                )}

                {!methodsQuery.isLoading && available.length > 0 && activeTab && (
                    <Tabs
                        value={activeTab}
                        onValueChange={(v) => setActiveTab(v as StepUpMethod)}
                    >
                        <TabsList className="w-full">
                            {available.includes("webauthn") && (
                                <TabsTrigger value="webauthn">
                                    <Fingerprint className="h-4 w-4 mr-1.5" /> Passkey
                                </TabsTrigger>
                            )}
                            {available.includes("opaque") && (
                                <TabsTrigger value="opaque">
                                    <KeyRound className="h-4 w-4 mr-1.5" /> Password
                                </TabsTrigger>
                            )}
                            {available.includes("totp") && (
                                <TabsTrigger value="totp">
                                    <Smartphone className="h-4 w-4 mr-1.5" /> Code
                                </TabsTrigger>
                            )}
                        </TabsList>

                        {available.includes("webauthn") && (
                            <TabsContent value="webauthn">
                                <WebAuthnTab
                                    scope={scope}
                                    onSuccess={onSuccess}
                                    busy={busy}
                                    setBusy={setBusy}
                                />
                            </TabsContent>
                        )}
                        {available.includes("opaque") && (
                            <TabsContent value="opaque">
                                <PasswordTab
                                    scope={scope}
                                    onSuccess={onSuccess}
                                    busy={busy}
                                    setBusy={setBusy}
                                />
                            </TabsContent>
                        )}
                        {available.includes("totp") && (
                            <TabsContent value="totp">
                                <TotpTab
                                    scope={scope}
                                    onSuccess={onSuccess}
                                    busy={busy}
                                    setBusy={setBusy}
                                />
                            </TabsContent>
                        )}
                    </Tabs>
                )}

                <DialogFooter>
                    <Button variant="ghost" onClick={handleClose} disabled={busy}>
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

interface TabProps {
    scope: StepUpScope;
    onSuccess: (token: string) => Promise<void> | void;
    busy: boolean;
    setBusy: (b: boolean) => void;
}

function PasswordTab({ scope, onSuccess, busy, setBusy }: TabProps) {
    const [password, setPassword] = useState("");
    const startMutation = trpc.auth.stepUpStartOpaque.useMutation();
    const finishMutation = trpc.auth.stepUpFinishOpaque.useMutation();
    // Stable refs — see react-hook-discipline rule.
    const startRef = useRef(startMutation.mutateAsync);
    const finishRef = useRef(finishMutation.mutateAsync);
    startRef.current = startMutation.mutateAsync;
    finishRef.current = finishMutation.mutateAsync;

    const submit = async () => {
        if (!password || busy) return;
        setBusy(true);
        let stepUpToken: string;
        try {
            const start = await startLogin(password);
            const { loginResponse } = await startRef.current({
                scope,
                startLoginRequest: start.startLoginRequest,
            });
            const finishClient = await finishLogin(
                password,
                start.clientLoginState,
                loginResponse,
            );
            if (!finishClient) throw new Error(UNIFORM_ERROR);
            ({ stepUpToken } = await finishRef.current({
                scope,
                finishLoginRequest: finishClient.finishLoginRequest,
            }));
            setPassword("");
        } catch {
            toast.error(UNIFORM_ERROR);
            setBusy(false);
            return;
        }
        // Resolver runs OUTSIDE the catch — its errors come from the gated
        // mutation's own onError, not the identity check.
        try {
            await onSuccess(stepUpToken);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-3">
            <Label htmlFor="stepup-password">Sign-in password</Label>
            <Input
                id="stepup-password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
                disabled={busy}
            />
            <Button
                className="w-full"
                onClick={() => void submit()}
                disabled={busy || password.length === 0}
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
        </div>
    );
}

function WebAuthnTab({ scope, onSuccess, busy, setBusy }: TabProps) {
    const startMutation = trpc.auth.stepUpStartWebAuthn.useMutation();
    const finishMutation = trpc.auth.stepUpFinishWebAuthn.useMutation();
    const startRef = useRef(startMutation.mutateAsync);
    const finishRef = useRef(finishMutation.mutateAsync);
    startRef.current = startMutation.mutateAsync;
    finishRef.current = finishMutation.mutateAsync;

    const submit = async () => {
        if (busy) return;
        setBusy(true);
        let stepUpToken: string;
        try {
            const { options, challengeId } = await startRef.current({ scope });
            const credential = await startAuthentication({ optionsJSON: options as any });
            ({ stepUpToken } = await finishRef.current({
                scope,
                challengeId,
                credential: credential as any,
            }));
        } catch {
            // NotAllowedError / AbortError happen if user cancels or times out
            // — keep the identity-check message uniform either way.
            toast.error(UNIFORM_ERROR);
            setBusy(false);
            return;
        }
        try {
            await onSuccess(stepUpToken);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-3">
            <p className="text-sm text-[var(--theme-fg-muted)]">
                Use your registered passkey to confirm.
            </p>
            <Button
                className="w-full"
                onClick={() => void submit()}
                disabled={busy}
            >
                {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <>
                        <Fingerprint className="h-4 w-4 mr-2" />
                        Use passkey
                    </>
                )}
            </Button>
        </div>
    );
}

function TotpTab({ scope, onSuccess, busy, setBusy }: TabProps) {
    const [code, setCode] = useState("");
    const totpMutation = trpc.auth.stepUpTotp.useMutation();
    const totpRef = useRef(totpMutation.mutateAsync);
    totpRef.current = totpMutation.mutateAsync;

    const submit = async () => {
        if (code.length !== 6 || busy) return;
        setBusy(true);
        let stepUpToken: string;
        try {
            ({ stepUpToken } = await totpRef.current({ scope, totpCode: code }));
            setCode("");
        } catch {
            toast.error(UNIFORM_ERROR);
            setBusy(false);
            return;
        }
        try {
            await onSuccess(stepUpToken);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-3">
            <Label htmlFor="stepup-totp">Six-digit code</Label>
            <Input
                id="stepup-totp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
                disabled={busy}
            />
            <Button
                className="w-full"
                onClick={() => void submit()}
                disabled={busy || code.length !== 6}
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
        </div>
    );
}
