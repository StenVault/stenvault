import { useState } from "react";
import { Button } from "@stenvault/shared/ui/button";
import { Input } from "@stenvault/shared/ui/input";
import { Label } from "@stenvault/shared/ui/label";
import { Loader2, AlertTriangle, ShieldAlert, CreditCard, Download } from "lucide-react";
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
import { trpc } from "@/lib/trpc";
import { toast } from "@stenvault/shared/lib/toast";
import { uiDescription } from "@stenvault/shared/lib/uiMessage";
import { startLogin, finishLogin } from "@/lib/opaqueClient";
import { clearAllTokens } from "@/lib/auth";
import { clearMasterKeyCache, clearDeviceWrappedMK } from "@/hooks/useMasterKey";
import { DataExportDialog } from "./DataExportDialog";
import { useHasActiveOperations } from "@/stores/operationStore";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasDownloadedData, setHasDownloadedData] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const hasActiveOps = useHasActiveOperations();

  const preDeleteCheck = trpc.profile.preDeleteCheck.useQuery(undefined, {
    enabled: open,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const deleteStartMutation = trpc.profile.deleteAccount.useMutation();
  const deleteFinishMutation = trpc.profile.deleteAccountFinish.useMutation();

  const handleClose = () => {
    if (isDeleting) return;
    setPassword("");
    setConfirmText("");
    setHasDownloadedData(false);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!password || confirmText !== "DELETE") return;

    try {
      setIsDeleting(true);

      // Step 1: Start OPAQUE login
      const clientLogin = await startLogin(password);
      const step1 = await deleteStartMutation.mutateAsync({
        startLoginRequest: clientLogin.startLoginRequest,
      });

      // Step 2: Finish OPAQUE login (proves password)
      const clientFinish = await finishLogin(
        password,
        clientLogin.clientLoginState,
        step1.loginResponse
      );
      if (!clientFinish) {
        throw new Error("Incorrect password");
      }

      // Step 3: Confirm deletion
      await deleteFinishMutation.mutateAsync({
        finishLoginRequest: clientFinish.finishLoginRequest,
        confirmText: "DELETE",
      });

      // Clean up local state
      clearMasterKeyCache();
      clearDeviceWrappedMK();
      clearAllTokens();
      localStorage.removeItem("stenvault-user-info");
      localStorage.removeItem("authToken");

      toast.success("Account deleted. Goodbye.");

      window.location.href = "/auth/login";
    } catch (error: any) {
      const msg = error?.message || "Failed to delete account";
      const isPrecondition = error?.data?.code === "PRECONDITION_FAILED" || msg.includes("Transfer ownership");

      if (isPrecondition) {
        toast.error("Cannot delete account", {
          description: uiDescription(msg),
          duration: 10000,
        });
      } else if (msg.includes("Incorrect password")) {
        toast.error("Incorrect password. Please try again.");
      } else {
        toast.error("Failed to delete account", {
          description: uiDescription(msg),
          duration: 8000,
        });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const isLoading = preDeleteCheck.isLoading;
  const check = preDeleteCheck.data;
  const hasBlockers = check && !check.canDelete;
  const isPaid = check?.subscriptionPlan !== "free";
  const fileCount = check?.fileCount ?? 0;
  const needsDownloadPrompt = fileCount > 0 && !hasDownloadedData;
  const canSubmit =
    !isLoading &&
    !hasBlockers &&
    !needsDownloadPrompt &&
    password.length > 0 &&
    confirmText === "DELETE" &&
    !isDeleting &&
    !hasActiveOps;

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            Delete Account
          </DialogTitle>
          <DialogDescription>
            This will permanently delete your account and all associated data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--nocturne-400)]" />
              <span className="ml-2 text-sm text-[var(--nocturne-400)]">Checking account...</span>
            </div>
          )}

          {hasBlockers && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Cannot delete account</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  {check.blockers.map((b: string, i: number) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && check && !hasBlockers && (
            <>
              {isPaid && (
                <Alert className="border-amber-500/50 bg-amber-500/10">
                  <CreditCard className="h-4 w-4 text-amber-500" />
                  <AlertTitle className="text-amber-500">Active subscription</AlertTitle>
                  <AlertDescription className="text-amber-400/80">
                    Your {check.subscriptionPlan === "pro" ? "Pro" : "Business"} subscription will be
                    canceled immediately. No refund for the remaining billing period.
                  </AlertDescription>
                </Alert>
              )}

              {needsDownloadPrompt ? (
                <Alert className="border-blue-500/50 bg-blue-500/10">
                  <Download className="h-4 w-4 text-blue-500" />
                  <AlertTitle className="text-blue-500">Download your data first</AlertTitle>
                  <AlertDescription className="text-blue-400/80">
                    You have {fileCount} file{fileCount !== 1 ? "s" : ""} in your vault.
                    Download them before deleting — after deletion, we cannot recover them.
                  </AlertDescription>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExportOpen(true)}
                      disabled={hasActiveOps}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download My Data
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setHasDownloadedData(true)}
                    >
                      Continue Without Downloading
                    </Button>
                  </div>
                </Alert>
              ) : (
                <>
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>This action cannot be undone</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                        {fileCount > 0 && (
                          <li>
                            {fileCount} file{fileCount !== 1 ? "s" : ""}{" "}
                            {(check?.folderCount ?? 0) > 0 &&
                              `and ${check!.folderCount} folder${check!.folderCount !== 1 ? "s" : ""} `}
                            will be permanently deleted
                          </li>
                        )}
                        <li>All encryption keys will be destroyed</li>
                        <li>All chat history will be removed</li>
                        <li>All shared links will stop working</li>
                      </ul>
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <Label htmlFor="delete-password">Enter your password</Label>
                    <Input
                      id="delete-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your current password"
                      disabled={isDeleting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="delete-confirm">
                      Type <strong>DELETE</strong> to confirm
                    </Label>
                    <Input
                      id="delete-confirm"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder='Type "DELETE" to confirm'
                      disabled={isDeleting}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canSubmit}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete My Account"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <DataExportDialog
      open={exportOpen}
      onOpenChange={setExportOpen}
      preDelete
      onExportComplete={() => setHasDownloadedData(true)}
    />
    </>
  );
}
