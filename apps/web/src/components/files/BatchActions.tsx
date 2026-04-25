/**
 * BatchActions Component
 *
 * Design System: Obsidian Vault
 * Batch selection and actions for files.
 */

import { useState } from "react";
import { Check, Download, Trash2, Share2, Move, X } from "lucide-react";
import { Button } from "@stenvault/shared/ui/button";
import { Badge } from "@stenvault/shared/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@stenvault/shared/utils";
import { useHaptic } from "@/hooks/useGestures";

interface FileItem {
  id: number;
  filename: string;
  fileType: string;
  size: number;
}

interface BatchActionsProps {
  selectedFiles: Set<number>;
  onSelectionChange: (selected: Set<number>) => void;
  onBatchDownload?: () => void;
  onBatchDelete?: () => void;
  onBatchShare?: () => void;
  onBatchMove?: () => void;
  totalFiles: number;
}

export function BatchActions({
  selectedFiles,
  onSelectionChange,
  onBatchDownload,
  onBatchDelete,
  onBatchShare,
  onBatchMove,
  totalFiles,
}: BatchActionsProps) {
  const { light } = useHaptic();
  const selectedCount = selectedFiles.size;

  const handleClear = () => {
    light();
    onSelectionChange(new Set());
  };

  const handleSelectAll = () => {
    light();
    // This would need to be passed from parent with all file IDs
  };

  if (selectedCount === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={cn(
          "fixed bottom-4 left-4 right-4 z-40",
          "md:left-auto md:right-4 md:max-w-md"
        )}
      >
        <div className={cn(
          "bg-card/95 backdrop-blur-xl",
          "border border-border",
          "rounded-2xl shadow-2xl shadow-black/20",
          "p-4"
        )}>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Check className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  {selectedCount} selecionado{selectedCount !== 1 ? 's' : ''}
                </h3>
                <p className="text-xs text-foreground-muted">
                  {totalFiles} arquivos no total
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClear}
              className="h-8 w-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {onBatchDownload && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  light();
                  onBatchDownload();
                }}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Download</span>
              </Button>
            )}
            {onBatchShare && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  light();
                  onBatchShare();
                }}
                className="gap-2"
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline">Compartilhar</span>
              </Button>
            )}
            {onBatchMove && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  light();
                  onBatchMove();
                }}
                className="gap-2"
              >
                <Move className="w-4 h-4" />
                <span className="hidden sm:inline">Mover</span>
              </Button>
            )}
            {onBatchDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  light();
                  onBatchDelete();
                }}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Deletar</span>
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Checkbox component for batch selection
 */
interface SelectionCheckboxProps {
  selected: boolean;
  onToggle: () => void;
  className?: string;
}

export function SelectionCheckbox({
  selected,
  onToggle,
  className,
}: SelectionCheckboxProps) {
  const { light } = useHaptic();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    light();
    onToggle();
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "relative flex items-center justify-center",
        "w-6 h-6 rounded-md",
        "border-2 transition-all duration-200",
        selected
          ? "bg-primary border-primary"
          : "border-border bg-card hover:border-primary/50",
        className
      )}
    >
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          >
            <Check className="w-4 h-4 text-primary-foreground" />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}

/**
 * Hook for managing batch selection state
 */
export function useBatchSelection() {
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  const toggleFile = (fileId: number) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const selectAll = (fileIds: number[]) => {
    setSelectedFiles(new Set(fileIds));
  };

  const clearSelection = () => {
    setSelectedFiles(new Set());
    setSelectionMode(false);
  };

  const enterSelectionMode = (initialFileId?: number) => {
    setSelectionMode(true);
    if (initialFileId !== undefined) {
      setSelectedFiles(new Set([initialFileId]));
    }
  };

  return {
    selectedFiles,
    selectionMode,
    toggleFile,
    selectAll,
    clearSelection,
    enterSelectionMode,
    setSelectedFiles,
  };
}
