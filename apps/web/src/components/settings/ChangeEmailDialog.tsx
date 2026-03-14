import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  startLogin,
  finishLogin,
  startRegistration,
  finishRegistration,
} from "@/lib/opaqueClient";
import { clearAllTokens } from "@/lib/auth";
import { clearMasterKeyCache, clearDeviceWrappedMK } from "@/hooks/useMasterKey";

type Step = "input" | "otp" | "finalizing" | "done";

interface ChangeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail: string;
}

export function ChangeEmailDialog({ open, onOpenChange, currentEmail }: ChangeEmailDialogProps) {
  const [step, setStep] = useState<Step>("input");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Keep password in memory for OPAQUE re-registration at the end
  const [savedPassword, setSavedPassword] = useState("");
  const [confirmedNewEmail, setConfirmedNewEmail] = useState("");

  const requestMutation = trpc.profile.requestEmailChange.useMutation();
  const verifyPasswordMutation = trpc.profile.verifyPasswordForEmailChange.useMutation();
  const confirmMutation = trpc.profile.confirmEmailChange.useMutation();
  const finalizeMutation = trpc.profile.finalizeEmailChange.useMutation();
  const opaqueRegStartMutation = trpc.auth.opaqueRegisterStart.useMutation();

  const handleClose = () => {
    if (isLoading) return;
    setStep("input");
    setNewEmail("");
    setPassword("");
    setOtp("");
    setSavedPassword("");
    setConfirmedNewEmail("");
    onOpenChange(false);
  };

  // Enter new email + password → OPAQUE login → send OTP
  const handleSendOtp = async () => {
    if (!newEmail || !password) return;

    try {
      setIsLoading(true);

      // Start OPAQUE login to prove identity
      const clientLogin = await startLogin(password);
      const step1 = await requestMutation.mutateAsync({
        newEmail,
        startLoginRequest: clientLogin.startLoginRequest,
      });

      // Finish OPAQUE login
      const clientFinish = await finishLogin(
        password,
        clientLogin.clientLoginState,
        step1.loginResponse
      );
      if (!clientFinish) {
        throw new Error("Incorrect password");
      }

      // Send the finishLoginRequest to prove password + trigger OTP
      await verifyPasswordMutation.mutateAsync({
        finishLoginRequest: clientFinish.finishLoginRequest,
        newEmail,
      });

      // Save password for later OPAQUE re-registration
      setSavedPassword(password);
      setStep("otp");
      toast.success("Verification code sent to your new email");
    } catch (error: any) {
      const msg = error?.message || "Failed to send verification code";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Verify OTP → OPAQUE re-register → finalize
  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return;

    try {
      setIsLoading(true);

      // Verify OTP
      const result = await confirmMutation.mutateAsync({ otp });
      const verifiedNewEmail = result.newEmail;
      setConfirmedNewEmail(verifiedNewEmail);
      setStep("finalizing");

      // OPAQUE re-registration with new email
      const clientReg = await startRegistration(savedPassword);
      const regStep = await opaqueRegStartMutation.mutateAsync({
        email: verifiedNewEmail,
        registrationRequest: clientReg.registrationRequest,
      });
      const regFinish = await finishRegistration(
        savedPassword,
        clientReg.clientRegistrationState,
        regStep.registrationResponse
      );

      // Finalize — update email + OPAQUE record on server
      await finalizeMutation.mutateAsync({
        newEmail: verifiedNewEmail,
        registrationRecord: regFinish.registrationRecord,
      });

      setStep("done");
      toast.success("Email updated successfully!");

      // Force logout after short delay
      setTimeout(() => {
        clearMasterKeyCache();
        clearDeviceWrappedMK();
        clearAllTokens();
        localStorage.removeItem("cloudvault-user-info");
        window.location.href = "/landing";
      }, 2000);
    } catch (error: any) {
      const msg = error?.message || "Failed to verify code";
      toast.error(msg);
      // If OTP was valid but re-registration failed, go back to input
      if (step === "finalizing") {
        setStep("input");
        setOtp("");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Change Email Address
          </DialogTitle>
          <DialogDescription>
            {step === "input" && `Current email: ${currentEmail}`}
            {step === "otp" && "Enter the 6-digit code sent to your new email"}
            {step === "finalizing" && "Updating your email..."}
            {step === "done" && "Email updated! Redirecting to login..."}
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-email">New email address</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="your-new@email.com"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-password">Current password</Label>
              <Input
                id="email-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={isLoading}
              />
            </div>
          </div>
        )}

        {step === "otp" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp-code">Verification code</Label>
              <Input
                id="otp-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="text-center text-2xl tracking-widest font-mono"
                disabled={isLoading}
                autoFocus
              />
              <p className="text-sm text-muted-foreground">
                Check your inbox at <strong>{newEmail}</strong>
              </p>
            </div>
          </div>
        )}

        {step === "finalizing" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Re-registering with new email...</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <p className="text-sm text-muted-foreground">
              Email changed to <strong>{confirmedNewEmail}</strong>
            </p>
            <p className="text-xs text-muted-foreground">Redirecting to login...</p>
          </div>
        )}

        {(step === "input" || step === "otp") && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            {step === "input" && (
              <Button
                onClick={handleSendOtp}
                disabled={!newEmail || !password || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Send Verification Code"
                )}
              </Button>
            )}
            {step === "otp" && (
              <Button
                onClick={handleVerifyOtp}
                disabled={otp.length !== 6 || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Update Email"
                )}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
