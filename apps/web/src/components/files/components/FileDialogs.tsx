/**
 * FileDialogs Component
 * 
 * Rename, Delete, and Share dialogs for files and folders.
 */

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ShareChooserModal } from '@/components/ShareChooserModal';
import type { FileItem, FolderItem, RenameDialogState, DeleteDialogState, ShareDialogState } from '../types';

interface FileDialogsProps {
    renameDialog: RenameDialogState;
    deleteDialog: DeleteDialogState;
    shareDialog: ShareDialogState;
    newName: string;
    onNewNameChange: (name: string) => void;
    onRenameDialogChange: (state: RenameDialogState) => void;
    onDeleteDialogChange: (state: DeleteDialogState) => void;
    onShareDialogChange: (state: ShareDialogState) => void;
    onRename: () => void;
    onDelete: () => void;
    isDeletePending: boolean;
}

export function FileDialogs({
    renameDialog,
    deleteDialog,
    shareDialog,
    newName,
    onNewNameChange,
    onRenameDialogChange,
    onDeleteDialogChange,
    onShareDialogChange,
    onRename,
    onDelete,
    isDeletePending,
}: FileDialogsProps) {
    return (
        <>
            {/* Rename Dialog */}
            <Dialog
                open={renameDialog.open}
                onOpenChange={(open) => onRenameDialogChange({ ...renameDialog, open })}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename {renameDialog.type}</DialogTitle>
                        <DialogDescription>
                            Enter a new name for this {renameDialog.type}.
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        value={newName}
                        onChange={(e) => onNewNameChange(e.target.value)}
                        placeholder="New name"
                        autoFocus
                    />
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => onRenameDialogChange({ ...renameDialog, open: false })}
                        >
                            Cancel
                        </Button>
                        <Button onClick={onRename} disabled={!newName.trim()}>
                            Rename
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
            <Dialog
                open={deleteDialog.open}
                onOpenChange={(open) => onDeleteDialogChange({ ...deleteDialog, open })}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete {deleteDialog.type}</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this {deleteDialog.type}? This action cannot be undone.
                            {deleteDialog.type === 'folder' && ' All files inside will also be deleted.'}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => onDeleteDialogChange({ ...deleteDialog, open: false })}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={onDelete}
                            disabled={isDeletePending}
                        >
                            {isDeletePending && (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            )}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Share Chooser Modal - Shows Email Share and P2P options */}
            <ShareChooserModal
                open={shareDialog.open}
                onClose={() => onShareDialogChange({ open: false, file: null })}
                file={shareDialog.file}
            />
        </>
    );
}

