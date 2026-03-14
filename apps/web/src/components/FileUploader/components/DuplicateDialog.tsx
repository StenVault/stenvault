/**
 * DuplicateDialog — Shown when a file's content fingerprint matches an existing file.
 *
 * Promise-based: the caller awaits `showDuplicateDialog(...)` which resolves
 * with 'skip' | 'upload-anyway' when the user clicks a button.
 */

import { useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/utils/formatters';
import { Copy, Upload } from 'lucide-react';

export type DuplicateAction = 'skip' | 'upload-anyway';

export interface DuplicateInfo {
  /** Name of the new file being uploaded */
  newFileName: string;
  /** Size of the new file */
  newFileSize: number;
  /** Decrypted name of existing file (or '[Encrypted]' fallback) */
  existingFileName: string;
  /** Size of existing file */
  existingSize: number;
  /** Folder ID of existing file */
  existingFolderId: number | null;
  /** When existing file was uploaded */
  existingCreatedAt: Date;
}

interface DuplicateDialogState {
  open: boolean;
  info: DuplicateInfo | null;
  resolve: ((action: DuplicateAction) => void) | null;
}

/**
 * Hook that provides a promise-based duplicate dialog.
 *
 * Usage:
 *   const { showDuplicateDialog, DuplicateDialogPortal } = useDuplicateDialog();
 *   // In upload flow:
 *   const action = await showDuplicateDialog({ ...info });
 *   if (action === 'skip') return;
 *   // Render <DuplicateDialogPortal /> somewhere in the component tree
 */
export function useDuplicateDialog() {
  const [state, setState] = useState<DuplicateDialogState>({
    open: false,
    info: null,
    resolve: null,
  });
  const resolveRef = useRef<((action: DuplicateAction) => void) | null>(null);

  const showDuplicateDialog = useCallback((info: DuplicateInfo): Promise<DuplicateAction> => {
    return new Promise<DuplicateAction>((resolve) => {
      resolveRef.current = resolve;
      setState({ open: true, info, resolve });
    });
  }, []);

  const handleAction = useCallback((action: DuplicateAction) => {
    resolveRef.current?.(action);
    resolveRef.current = null;
    setState({ open: false, info: null, resolve: null });
  }, []);

  const DuplicateDialogPortal = useCallback(() => {
    const { open, info } = state;
    if (!info) return null;

    const dateStr = info.existingCreatedAt.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    return (
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleAction('skip'); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-amber-500" />
              Duplicate File Detected
            </DialogTitle>
            <DialogDescription>
              A file with identical content already exists in your vault.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Existing file</p>
              <p className="text-sm font-medium truncate">{info.existingFileName}</p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(info.existingSize)} &middot; Uploaded {dateStr}
              </p>
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New file</p>
              <p className="text-sm font-medium truncate">{info.newFileName}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(info.newFileSize)}</p>
            </div>
          </div>

          <DialogFooter className="flex-row gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => handleAction('skip')}
              className="flex-1"
            >
              Skip
            </Button>
            <Button
              onClick={() => handleAction('upload-anyway')}
              className="flex-1"
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Upload Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }, [state, handleAction]);

  return { showDuplicateDialog, DuplicateDialogPortal };
}
