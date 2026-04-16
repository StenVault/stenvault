import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Key, Lock } from "lucide-react";
import { clearMasterKeyCache, clearDeviceWrappedMK } from "@/hooks/useMasterKey";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin, finishLogin, startRegistration, finishRegistration } from "@/lib/opaqueClient";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export function PasswordChangeSection() {
    const { user } = useAuth();

    const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    const opaqueChangeStartMutation = trpc.auth.opaqueChangePasswordStart.useMutation();
    const opaqueChangeFinishMutation = trpc.auth.opaqueChangePasswordFinish.useMutation();
    const opaqueRegisterStartMutation = trpc.auth.opaqueRegisterStart.useMutation();

    const handleChangePassword = async () => {
        if (!currentPassword) {
            toast.error("Enter your current password");
            return;
        }
        if (newPassword.length < 12) {
            toast.error("New password must be at least 12 characters");
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }

        try {
            setIsChangingPassword(true);

            // Step 1: Start OPAQUE login with current password to prove knowledge
            const clientLogin = await startLogin(currentPassword);
            const step1 = await opaqueChangeStartMutation.mutateAsync({
                startLoginRequest: clientLogin.startLoginRequest,
            });

            // Step 2: Finish OPAQUE login (proves current password)
            const clientFinish = await finishLogin(
                currentPassword,
                clientLogin.clientLoginState,
                step1.loginResponse
            );
            if (!clientFinish) {
                throw new Error("Current password is incorrect");
            }

            // Step 3: Create new OPAQUE registration with new password
            const clientReg = await startRegistration(newPassword);
            const regStep = await opaqueRegisterStartMutation.mutateAsync({
                email: user?.email || "",
                registrationRequest: clientReg.registrationRequest,
            });
            const regFinish = await finishRegistration(
                newPassword,
                clientReg.clientRegistrationState,
                regStep.registrationResponse
            );

            // Step 5: Send proof of current password + new OPAQUE record to server
            // NOTE: Login password and encryption password are independent.
            // Changing the login password must NOT touch the Master Key wrapping.
            await opaqueChangeFinishMutation.mutateAsync({
                finishLoginRequest: clientFinish.finishLoginRequest,
                newRegistrationRecord: regFinish.registrationRecord,
            });

            // Step 7: Invalidate Device-KEK + UES — force re-auth on all devices
            clearMasterKeyCache();
            clearDeviceWrappedMK();
            try {
                const { clearUES } = await import("@/lib/uesManager");
                clearUES();
            } catch {
                // UES module may not be available in all environments
            }

            toast.success("Password changed successfully!");
            setPasswordChangeOpen(false);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (error: any) {
            toast.error(error?.message || "Failed to change password");
        } finally {
            setIsChangingPassword(false);
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 shrink-0">
                                <Lock className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                            </div>
                            <div className="min-w-0">
                                <CardTitle>Password</CardTitle>
                                <CardDescription>
                                    Change your account password
                                </CardDescription>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPasswordChangeOpen(true)}
                        >
                            <Key className="mr-2 h-4 w-4" />
                            Change Password
                        </Button>
                    </div>
                </CardHeader>
            </Card>

            {/* Password Change Dialog */}
            <Dialog open={passwordChangeOpen} onOpenChange={(open) => {
                if (!open) {
                    setPasswordChangeOpen(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Lock className="w-5 h-5" />
                            Change Password
                        </DialogTitle>
                        <DialogDescription>
                            Enter your current password and choose a new password.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="current-password">Current Password</Label>
                            <Input
                                id="current-password"
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="Enter your current password"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="new-password">New Password</Label>
                            <Input
                                id="new-password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password (min. 12 characters)"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirm New Password</Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm new password"
                            />
                            {confirmPassword && newPassword !== confirmPassword && (
                                <p className="text-sm text-red-500">Passwords do not match</p>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setPasswordChangeOpen(false);
                                setCurrentPassword("");
                                setNewPassword("");
                                setConfirmPassword("");
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleChangePassword}
                            disabled={
                                !currentPassword ||
                                newPassword.length < 12 ||
                                newPassword !== confirmPassword ||
                                isChangingPassword
                            }
                        >
                            {isChangingPassword ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Changing...
                                </>
                            ) : (
                                "Change Password"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
