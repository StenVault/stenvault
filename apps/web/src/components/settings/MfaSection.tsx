import { useState } from "react";
import { Button } from "@stenvault/shared/ui/button";
import { SectionCard } from "@stenvault/shared/ui/section-card";
import { Input } from "@stenvault/shared/ui/input";
import { Label } from "@stenvault/shared/ui/label";
import {
    Loader2,
    Shield,
    ShieldCheck,
    ShieldAlert,
    Copy,
    Check,
    AlertTriangle,
    AlertOctagon,
    QrCode,
    Download,
} from "lucide-react";
import { cn } from "@stenvault/shared/utils";
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
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from "@/components/ui/alert";
import { QRCodeSVG } from "qrcode.react";

export function MfaSection() {
    const [mfaSetupOpen, setMfaSetupOpen] = useState(false);
    const [mfaDisableOpen, setMfaDisableOpen] = useState(false);
    const [mfaSecret, setMfaSecret] = useState("");
    const [mfaSetupId, setMfaSetupId] = useState("");
    const [qrCodeUrl, setQrCodeUrl] = useState("");
    const [verificationCode, setVerificationCode] = useState("");
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [disableTotpCode, setDisableTotpCode] = useState("");
    const [copiedCode, setCopiedCode] = useState<number | null>(null);

    const { data: mfaStatus, refetch: refetchMfaStatus } = trpc.mfa.getStatus.useQuery();

    const setupMfaMutation = trpc.mfa.setup.useMutation({
        onSuccess: (data) => {
            setMfaSecret(data.secret);
            setQrCodeUrl(data.qrCodeUrl);
            if (data.setupId) setMfaSetupId(data.setupId);
            toast.success("QR Code generated! Scan it with your authenticator app.");
        },
        onError: (error) => toast.error(error.message),
    });

    const verifyMfaMutation = trpc.mfa.verify.useMutation({
        onSuccess: (data) => {
            setBackupCodes(data.backupCodes);
            toast.success("Two-step login enabled!");
            refetchMfaStatus();
        },
        onError: (error) => toast.error(error.message),
    });

    const disableMfaMutation = trpc.mfa.disable.useMutation({
        onSuccess: () => {
            setMfaDisableOpen(false);
            setDisableTotpCode("");
            toast.success("Two-step login disabled");
            refetchMfaStatus();
        },
        onError: (error) => toast.error(error.message),
    });

    const handleSetupMfa = async () => {
        setupMfaMutation.mutate();
        setMfaSetupOpen(true);
    };

    const handleVerifyMfa = async () => {
        if (verificationCode.length !== 6) {
            toast.error("Enter a 6-digit code");
            return;
        }
        verifyMfaMutation.mutate({
            token: verificationCode,
            setupId: mfaSetupId,
        });
    };

    const handleDisableMfa = async () => {
        if (!disableTotpCode || disableTotpCode.length !== 6) {
            toast.error("Enter a 6-digit authenticator code");
            return;
        }
        disableMfaMutation.mutate({ totpCode: disableTotpCode });
    };

    const copyBackupCode = async (code: string, index: number) => {
        await navigator.clipboard.writeText(code);
        setCopiedCode(index);
        setTimeout(() => setCopiedCode(null), 2000);
        toast.success("Code copied!");
    };

    const handleCloseSetup = () => {
        setMfaSetupOpen(false);
        setMfaSecret("");
        setMfaSetupId("");
        setQrCodeUrl("");
        setVerificationCode("");
        setBackupCodes([]);
    };

    return (
        <>
            <SectionCard
                icon={mfaStatus?.enabled ? ShieldCheck : Shield}
                iconClassName={
                    mfaStatus?.enabled
                        ? "text-[var(--theme-info)]"
                        : "text-[var(--theme-fg-muted)]"
                }
                title="Two-step login"
                description={
                    mfaStatus?.enabled
                        ? "Active — you'll need your authenticator app to sign in"
                        : "Require a code from your phone in addition to your password"
                }
                action={
                    mfaStatus?.enabled ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setMfaDisableOpen(true)}
                            className="text-[var(--theme-error)] border-[var(--theme-error)]/30 hover:bg-[var(--theme-error)]/10"
                        >
                            <ShieldAlert className="mr-2 h-4 w-4" />
                            Disable
                        </Button>
                    ) : (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={handleSetupMfa}
                            disabled={setupMfaMutation.isPending}
                        >
                            {setupMfaMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Setting up...
                                </>
                            ) : (
                                <>
                                    <Shield className="mr-2 h-4 w-4" />
                                    Enable
                                </>
                            )}
                        </Button>
                    )
                }
                className={mfaStatus?.enabled ? "border-border-strong" : ""}
            >
                {mfaStatus?.enabled && (
                    <div className="rounded-lg border border-[var(--theme-info)]/20 bg-[var(--theme-info)]/10 p-4">
                        <p className="text-sm text-[var(--theme-info)]">
                            <strong>Protected:</strong> You'll need to enter a code from your authenticator app each time you sign in.
                        </p>
                    </div>
                )}
            </SectionCard>

            {/* MFA Setup Dialog */}
            <Dialog open={mfaSetupOpen} onOpenChange={(open) => !open && handleCloseSetup()}>
                <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <QrCode className="w-5 h-5" />
                            Set Up Two-Step Login
                        </DialogTitle>
                        <DialogDescription>
                            {backupCodes.length > 0
                                ? "Save these backup codes in a safe place"
                                : qrCodeUrl
                                    ? "Scan the QR code with your authenticator app and enter the generated code"
                                    : "Generating QR code..."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {backupCodes.length > 0 ? (
                            /* Backup Codes Display */
                            <>
                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Important!</AlertTitle>
                                    <AlertDescription>
                                        These codes are only shown ONCE. Store them in a safe place.
                                        You can use them to access your account if you lose access to your authenticator app.
                                    </AlertDescription>
                                </Alert>
                                <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg max-h-64 overflow-y-auto">
                                    {backupCodes.map((code, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center justify-between p-2 bg-background rounded border font-mono text-sm"
                                        >
                                            <span>{code}</span>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6"
                                                onClick={() => copyBackupCode(code, index)}
                                            >
                                                {copiedCode === index ? (
                                                    <Check className="h-3 w-3 text-[var(--theme-success)]" />
                                                ) : (
                                                    <Copy className="h-3 w-3" />
                                                )}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        className="flex-1"
                                        onClick={() => {
                                            navigator.clipboard.writeText(backupCodes.join("\n"));
                                            toast.success("All codes copied to clipboard");
                                        }}
                                    >
                                        <Copy className="h-4 w-4 mr-2" />
                                        Copy all
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="flex-1"
                                        onClick={() => {
                                            const content = [
                                                "StenVault - Two-Step Login Backup Codes",
                                                `Generated: ${new Date().toLocaleDateString()}`,
                                                "",
                                                "Keep these codes safe. Each can only be used once.",
                                                "",
                                                ...backupCodes.map((code, i) => `${i + 1}. ${code}`),
                                            ].join("\n");
                                            const blob = new Blob([content], { type: "text/plain" });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement("a");
                                            a.href = url;
                                            a.download = "stenvault-backup-codes.txt";
                                            a.click();
                                            URL.revokeObjectURL(url);
                                        }}
                                    >
                                        <Download className="h-4 w-4 mr-2" />
                                        Download
                                    </Button>
                                </div>
                                <Button
                                    onClick={handleCloseSetup}
                                    className="w-full"
                                >
                                    Finish
                                </Button>
                            </>
                        ) : qrCodeUrl ? (
                            /* QR Code and Verification */
                            <>
                                <div className="flex flex-col items-center gap-4 p-4 bg-muted rounded-lg">
                                    {/* Manual entry — primary on mobile (can't scan own screen) */}
                                    <div className="w-full">
                                        <p className="text-sm font-medium mb-2 text-center">Enter this code in your authenticator app:</p>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 text-xs bg-background px-3 py-2 rounded border break-all text-center font-mono">
                                                {mfaSecret}
                                            </code>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(mfaSecret);
                                                    toast.success("Secret key copied to clipboard");
                                                }}
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    {/* QR Code — secondary (useful when setting up from desktop) */}
                                    <div className="bg-white p-4 rounded-lg">
                                        <QRCodeSVG value={qrCodeUrl} size={192} />
                                    </div>
                                    <p className="text-xs text-muted-foreground text-center">
                                        Or scan this QR code from another device
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="verification-code">Verification Code</Label>
                                    <Input
                                        id="verification-code"
                                        type="text"
                                        placeholder="000000"
                                        maxLength={6}
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                                        className="text-center text-lg tracking-widest font-mono"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Enter the 6-digit code from your authenticator app
                                    </p>
                                </div>

                                <DialogFooter>
                                    <Button
                                        variant="outline"
                                        onClick={handleCloseSetup}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleVerifyMfa}
                                        disabled={verificationCode.length !== 6 || verifyMfaMutation.isPending}
                                    >
                                        {verifyMfaMutation.isPending ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Verifying...
                                            </>
                                        ) : (
                                            "Verify and Activate"
                                        )}
                                    </Button>
                                </DialogFooter>
                            </>
                        ) : (
                            <div className="flex items-center justify-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* MFA Disable Dialog */}
            <Dialog open={mfaDisableOpen} onOpenChange={setMfaDisableOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-[var(--theme-error)]">
                            <ShieldAlert className="w-5 h-5" />
                            Disable Two-Step Login
                        </DialogTitle>
                        <DialogDescription>
                            Enter a code from your authenticator app to confirm. Your account will only be protected by your password.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <Alert variant="destructive">
                            <AlertOctagon className="h-4 w-4" />
                            <AlertTitle>Warning</AlertTitle>
                            <AlertDescription>
                                Without two-step login, anyone with your password can access your account.
                            </AlertDescription>
                        </Alert>

                        <div className="space-y-2">
                            <Label htmlFor="disable-totp">Authenticator Code</Label>
                            <Input
                                id="disable-totp"
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                value={disableTotpCode}
                                onChange={(e) => setDisableTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="Enter 6-digit code"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setMfaDisableOpen(false);
                                setDisableTotpCode("");
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDisableMfa}
                            disabled={disableTotpCode.length !== 6 || disableMfaMutation.isPending}
                        >
                            {disableMfaMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Disabling...
                                </>
                            ) : (
                                "Disable Two-Step Login"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
