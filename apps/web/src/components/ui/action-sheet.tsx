/**
 * ActionSheet Component
 *
 * Design System: Obsidian Vault
 * Mobile-friendly action sheet for contextual actions.
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHaptic } from "@/hooks/useGestures";

export interface ActionSheetAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
}

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  actions: ActionSheetAction[];
  children?: React.ReactNode;
}

export function ActionSheet({
  open,
  onClose,
  title,
  description,
  actions,
  children,
}: ActionSheetProps) {
  const { light } = useHaptic();

  const handleActionClick = (action: ActionSheetAction) => {
    if (action.disabled) return;
    light();
    action.onClick();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Action Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              "fixed bottom-0 left-0 right-0 z-50",
              "bg-card/95 backdrop-blur-xl",
              "border-t border-border",
              "rounded-t-2xl",
              "shadow-2xl shadow-black/20",
              "max-h-[85vh] overflow-y-auto"
            )}
          >
            {/* Drag Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            {(title || description) && (
              <div className="px-6 pb-4">
                {title && (
                  <h3 className="font-display text-lg tracking-tight text-foreground mb-1">
                    {title}
                  </h3>
                )}
                {description && (
                  <p className="text-sm text-foreground-muted">
                    {description}
                  </p>
                )}
              </div>
            )}

            {/* Custom Content */}
            {children}

            {/* Actions */}
            <div className="px-4 pb-4 space-y-2">
              {actions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => handleActionClick(action)}
                  disabled={action.disabled}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3",
                    "rounded-xl",
                    "text-left font-medium",
                    "transition-all duration-200",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    action.variant === 'destructive'
                      ? "bg-destructive/10 text-destructive hover:bg-destructive/20 active:bg-destructive/30"
                      : "bg-secondary hover:bg-secondary/80 active:bg-secondary/60 text-foreground"
                  )}
                >
                  {action.icon && (
                    <span className="flex-shrink-0">
                      {action.icon}
                    </span>
                  )}
                  <span className="flex-1">{action.label}</span>
                </button>
              ))}
            </div>

            {/* Cancel Button */}
            <div className="px-4 pb-safe">
              <button
                onClick={onClose}
                className={cn(
                  "w-full px-4 py-3 mb-2",
                  "rounded-xl",
                  "bg-card border border-border",
                  "text-foreground font-medium",
                  "hover:bg-secondary transition-colors"
                )}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook for managing action sheet state
 */
export function useActionSheet() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [actions, setActions] = React.useState<ActionSheetAction[]>([]);
  const [title, setTitle] = React.useState<string>();
  const [description, setDescription] = React.useState<string>();

  const show = React.useCallback((config: {
    title?: string;
    description?: string;
    actions: ActionSheetAction[];
  }) => {
    setTitle(config.title);
    setDescription(config.description);
    setActions(config.actions);
    setIsOpen(true);
  }, []);

  const hide = React.useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    title,
    description,
    actions,
    show,
    hide,
  };
}
