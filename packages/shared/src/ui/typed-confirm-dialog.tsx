/**
 * TypedConfirmDialog
 *
 * HIG-aligned destructive confirmation (section 4.9 escalation ladder, I13):
 * the user must type the exact artifact name (vault name, email, workspace)
 * before the destructive button enables. Defeats muscle-memory "DELETE" clicks.
 *
 * Layout rules (Apple HIG + research 4.9):
 * - Cancel is the bold default, on the left.
 * - Destructive action on the right, disabled until the typed value matches.
 * - No red "DANGER" banner in the header; red is reserved for the destructive
 *   button itself.
 */

import * as React from "react";

import { cn } from "../utils/cn";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { Input } from "./input";
import { Label } from "./label";
import { buttonVariants } from "./button";

export interface TypedConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /**
   * The exact string the user must type before the destructive button
   * enables — typically the artifact name (vault title, email, workspace slug).
   * Comparison is case-sensitive by default; use `caseSensitive={false}` to relax.
   */
  confirmArtifactName: string;
  /** Label for the destructive button. Sentence case. */
  confirmLabel: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Helper text shown above the input. Defaults to an echo of the artifact name. */
  inputHint?: React.ReactNode;
  /** Optional placeholder for the input. */
  inputPlaceholder?: string;
  caseSensitive?: boolean;
  /** Called when the user confirms. The dialog does not close automatically —
   * the caller controls `open` so async flows can show loading/error state. */
  onConfirm: () => void;
  /** Disable the destructive button while an async confirm is in flight. */
  loading?: boolean;
  className?: string;
}

const TypedConfirmDialog = React.forwardRef<HTMLDivElement, TypedConfirmDialogProps>(
  (
    {
      open,
      onOpenChange,
      title,
      description,
      confirmArtifactName,
      confirmLabel,
      cancelLabel = "Cancel",
      inputHint,
      inputPlaceholder,
      caseSensitive = true,
      onConfirm,
      loading = false,
      className,
    },
    ref,
  ) => {
    const [typed, setTyped] = React.useState("");

    React.useEffect(() => {
      if (!open) {
        setTyped("");
      }
    }, [open]);

    const matches = React.useMemo(() => {
      if (caseSensitive) return typed === confirmArtifactName;
      return typed.toLowerCase() === confirmArtifactName.toLowerCase();
    }, [typed, confirmArtifactName, caseSensitive]);

    const canConfirm = matches && !loading;

    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent ref={ref} className={className}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && (
              <AlertDialogDescription>{description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="typed-confirm-input" className="text-sm">
              {inputHint ?? (
                <>
                  Type{" "}
                  <span className="font-mono text-[var(--theme-primary)]">
                    {confirmArtifactName}
                  </span>{" "}
                  to confirm.
                </>
              )}
            </Label>
            <Input
              id="typed-confirm-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={inputPlaceholder ?? confirmArtifactName}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={typed.length > 0 && !matches}
            />
          </div>

          <AlertDialogFooter>
            {/* Cancel is bold default (Apple HIG — safe action gets the visual weight). */}
            <AlertDialogCancel
              className={cn(buttonVariants({ variant: "default" }))}
              disabled={loading}
            >
              {cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={!canConfirm}
              onClick={(e) => {
                if (!canConfirm) {
                  e.preventDefault();
                  return;
                }
                onConfirm();
              }}
            >
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  },
);

TypedConfirmDialog.displayName = "TypedConfirmDialog";

export { TypedConfirmDialog };
