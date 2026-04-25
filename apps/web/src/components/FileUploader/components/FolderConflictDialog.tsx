/**
 * FolderConflictDialog — Shown when a folder with the same name already exists.
 *
 * Promise-based: the caller awaits `showConflictDialog(...)` which resolves
 * with 'merge' | 'rename' | 'cancel' when the user clicks a button.
 */

import { useState, useCallback, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@stenvault/shared/ui/dialog';
import { Button } from '@stenvault/shared/ui/button';
import { FolderOpen, Merge, PenLine } from 'lucide-react';

export type FolderConflictAction = 'merge' | 'rename' | 'cancel';

export interface FolderConflictInfo {
    folderName: string;
    existingFolderId: number;
}

interface FolderConflictDialogState {
    open: boolean;
    info: FolderConflictInfo | null;
    resolve: ((action: FolderConflictAction) => void) | null;
}

export function useFolderConflictDialog() {
    const [state, setState] = useState<FolderConflictDialogState>({
        open: false,
        info: null,
        resolve: null,
    });
    const resolveRef = useRef<((action: FolderConflictAction) => void) | null>(null);

    const showConflictDialog = useCallback((info: FolderConflictInfo): Promise<FolderConflictAction> => {
        return new Promise<FolderConflictAction>((resolve) => {
            resolveRef.current = resolve;
            setState({ open: true, info, resolve });
        });
    }, []);

    const handleAction = useCallback((action: FolderConflictAction) => {
        resolveRef.current?.(action);
        resolveRef.current = null;
        setState({ open: false, info: null, resolve: null });
    }, []);

    const FolderConflictDialogPortal = useCallback(() => {
        const { open, info } = state;
        if (!info) return null;

        return (
            <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleAction('cancel'); }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FolderOpen className="h-5 w-5 text-amber-500" />
                            Folder Already Exists
                        </DialogTitle>
                        <DialogDescription>
                            A folder named &ldquo;{info.folderName}&rdquo; already exists in this location.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1 my-2">
                        <p className="text-sm text-muted-foreground">
                            Choose how to handle the upload:
                        </p>
                        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 mt-2">
                            <li><strong>Merge</strong> — upload files into the existing folder</li>
                            <li><strong>Rename</strong> — create a new folder with a different name</li>
                            <li><strong>Cancel</strong> — abort the folder upload</li>
                        </ul>
                    </div>

                    <DialogFooter className="flex-row gap-2 sm:gap-2">
                        <Button
                            variant="outline"
                            onClick={() => handleAction('cancel')}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleAction('rename')}
                            className="flex-1"
                        >
                            <PenLine className="h-4 w-4 mr-1.5" />
                            Rename
                        </Button>
                        <Button
                            onClick={() => handleAction('merge')}
                            className="flex-1"
                        >
                            <Merge className="h-4 w-4 mr-1.5" />
                            Merge
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }, [state, handleAction]);

    return { showConflictDialog, FolderConflictDialogPortal };
}
