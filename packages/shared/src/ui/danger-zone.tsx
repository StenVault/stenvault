/**
 * DangerZone
 *
 * Sunken block for irreversible actions (delete vault, reset master key,
 * delete account). Replaces the red-card "Danger Zone" pattern from
 * shadcn tutorials (I13 — decision log, Research v2).
 *
 * Anatomy:
 * - Sunken surface (`--surface-sunken`) + thin burgundy/20 border.
 * - Icon: AlertOctagon (not AlertTriangle — I15 / section 6.5 icon contract).
 * - Destructive button opens a TypedConfirmDialog echoing the artifact name.
 *
 * Use inline at the bottom of the relevant settings group. Do NOT nest
 * inside another elevated surface — this is itself a sunken primitive
 * (section 4.13: max one level of nesting, and only if the inner surface
 * is sunken).
 */

import * as React from "react";
import { AlertOctagon, type LucideIcon } from "lucide-react";

import { cn } from "../utils/cn";
import { Button } from "./button";
import { TypedConfirmDialog } from "./typed-confirm-dialog";

export interface DangerZoneProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Label for the button that opens the confirmation dialog. */
  confirmLabel: string;
  /** String the user must type inside the confirmation dialog. */
  confirmArtifactName: string;
  /** Dialog title. Defaults to the outer `title`. */
  dialogTitle?: React.ReactNode;
  /** Dialog description. Defaults to the outer `description`. */
  dialogDescription?: React.ReactNode;
  /** Hint above the typed-confirm input. */
  dialogInputHint?: React.ReactNode;
  /** Optional placeholder for the typed-confirm input. */
  dialogInputPlaceholder?: string;
  icon?: LucideIcon;
  onConfirm: () => void;
  /** Keep the button disabled and show a loader on the confirm action. */
  loading?: boolean;
  className?: string;
}

const DangerZone = React.forwardRef<HTMLDivElement, DangerZoneProps>(
  (
    {
      title,
      description,
      confirmLabel,
      confirmArtifactName,
      dialogTitle,
      dialogDescription,
      dialogInputHint,
      dialogInputPlaceholder,
      icon: Icon = AlertOctagon,
      onConfirm,
      loading = false,
      className,
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);

    return (
      <>
        <div
          ref={ref}
          data-slot="danger-zone"
          className={cn(
            // sunken surface; radii step down from the enclosing card (radii cascade, section 6.6)
            "rounded-lg",
            "bg-[var(--surface-sunken)]",
            "border border-[color-mix(in_srgb,var(--theme-error)_20%,transparent)]",
            "p-5",
            "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
            className,
          )}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div
              aria-hidden="true"
              className={cn(
                "shrink-0 rounded-md p-2",
                "bg-[color-mix(in_srgb,var(--theme-error)_10%,transparent)]",
                "text-[var(--theme-error)]",
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <h4 className="text-sm font-medium text-foreground leading-tight">
                {title}
              </h4>
              {description && (
                <p className="text-sm text-foreground-muted leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0">
            <Button
              variant="destructive"
              onClick={() => setOpen(true)}
              disabled={loading}
              loading={loading}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>

        <TypedConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={dialogTitle ?? title}
          description={dialogDescription ?? description}
          confirmArtifactName={confirmArtifactName}
          confirmLabel={confirmLabel}
          inputHint={dialogInputHint}
          inputPlaceholder={dialogInputPlaceholder}
          onConfirm={onConfirm}
          loading={loading}
        />
      </>
    );
  },
);

DangerZone.displayName = "DangerZone";

export { DangerZone };
