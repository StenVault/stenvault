import { useState } from "react";
import { Button } from "@stenvault/shared/ui/button";
import { AuroraCard } from "@stenvault/shared/ui/aurora-card";
import { Input } from "@stenvault/shared/ui/input";
import { Label } from "@stenvault/shared/ui/label";
import { Loader2, User, Mail, AlertOctagon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "@stenvault/shared/lib/toast";
import { useAuth } from "@/_core/hooks/useAuth";
import { ChangeEmailDialog } from "./ChangeEmailDialog";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

export function ProfileSettings() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Name editing
  const [name, setName] = useState(user?.name || "");
  const [isEditingName, setIsEditingName] = useState(false);
  const updateProfileMutation = trpc.profile.updateProfile.useMutation({
    onSuccess: (data) => {
      toast.success("Name updated");
      setIsEditingName(false);
      // Refresh user data
      utils.auth.me.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  // Dialogs
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  const handleSaveName = () => {
    if (!name.trim() || name.trim().length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }
    updateProfileMutation.mutate({ name: name.trim() });
  };

  return (
    <div className="space-y-6">
      {/* Profile Information */}
      <AuroraCard variant="default">
        <div className="mb-4">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <User className="w-5 h-5" />
            Profile Information
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your account details
          </p>
        </div>
        <div className="space-y-4">
          {/* Name Field */}
          <div className="space-y-2">
            <Label htmlFor="profile-name">Display Name</Label>
            <div className="flex gap-2">
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!isEditingName) setIsEditingName(true);
                }}
                placeholder="Your name"
                disabled={updateProfileMutation.isPending}
              />
              {isEditingName && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveName}
                    disabled={updateProfileMutation.isPending || !name.trim()}
                  >
                    {updateProfileMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setName(user?.name || "");
                      setIsEditingName(false);
                    }}
                    disabled={updateProfileMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Email Field (read-only + change button) */}
          <div className="space-y-2">
            <Label>Email Address</Label>
            <div className="flex gap-2 items-center">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {user?.email}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setChangeEmailOpen(true)}
              >
                Change
              </Button>
            </div>
          </div>
        </div>
      </AuroraCard>

      {/* Danger Zone */}
      <AuroraCard variant="sunken">
        <div className="mb-4">
          <h3 className="flex items-center gap-2 font-semibold text-[var(--theme-error)]">
            <AlertOctagon className="w-5 h-5" />
            Danger Zone
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Irreversible account actions
          </p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Delete Account</p>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all data. This cannot be undone.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteAccountOpen(true)}
          >
            Delete Account
          </Button>
        </div>
      </AuroraCard>

      {/* Dialogs */}
      <ChangeEmailDialog
        open={changeEmailOpen}
        onOpenChange={setChangeEmailOpen}
        currentEmail={user?.email || ""}
      />
      <DeleteAccountDialog
        open={deleteAccountOpen}
        onOpenChange={setDeleteAccountOpen}
      />
    </div>
  );
}
