/**
 * BatchRenameDialog Component
 * 
 * Dialog for renaming multiple files at once with various options:
 * - Individual file renaming
 * - Add prefix/suffix to all names
 * - Find and replace text
 * - Sequential numbering
 */

import { useState, useMemo } from 'react';
import { Button } from '@stenvault/shared/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@stenvault/shared/ui/dialog';
import { Input } from '@stenvault/shared/ui/input';
import { Label } from '@stenvault/shared/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@stenvault/shared/ui/tabs';
import { FileIcon, Loader2 } from 'lucide-react';
import { cn } from '@stenvault/shared/utils';
import type { FileItem } from '../types';

/** Escape special regex characters so findText is treated as a literal string */
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface BatchRenameDialogProps {
    open: boolean;
    files: FileItem[];
    onClose: () => void;
    onRename: (renames: Array<{ fileId: number; newName: string }>) => void;
    isPending?: boolean;
}

export function BatchRenameDialog({
    open,
    files,
    onClose,
    onRename,
    isPending = false,
}: BatchRenameDialogProps) {
    const [mode, setMode] = useState<'individual' | 'bulk'>('bulk');

    // Individual mode: map of fileId to newName
    const [individualNames, setIndividualNames] = useState<Map<number, string>>(
        new Map(files.map(f => [f.id, f.decryptedFilename || f.filename]))
    );

    // Bulk mode options
    const [prefix, setPrefix] = useState('');
    const [suffix, setSuffix] = useState('');
    const [findText, setFindText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [numberingStart, setNumberingStart] = useState(1);
    const [useNumbering, setUseNumbering] = useState(false);

    // Calculate preview for bulk mode
    const bulkPreview = useMemo(() => {
        return files.map((file, index) => {
            let newName = file.decryptedFilename || file.filename;

            // Apply find/replace
            if (findText) {
                newName = newName.replace(new RegExp(escapeRegExp(findText), 'g'), replaceText);
            }

            // Apply prefix/suffix
            const parts = newName.split('.');
            const ext = parts.length > 1 ? `.${parts.pop()}` : '';
            let nameWithoutExt = parts.join('.');

            if (useNumbering) {
                nameWithoutExt = `${nameWithoutExt}_${numberingStart + index}`;
            }

            newName = `${prefix}${nameWithoutExt}${suffix}${ext}`;

            return { fileId: file.id, newName, oldName: file.decryptedFilename || file.filename };
        });
    }, [files, prefix, suffix, findText, replaceText, numberingStart, useNumbering]);

    const handleSubmit = () => {
        if (mode === 'individual') {
            const renames = Array.from(individualNames.entries())
                .map(([fileId, newName]) => ({ fileId, newName: newName.trim() }))
                .filter(r => r.newName.length > 0);
            onRename(renames);
        } else {
            const renames = bulkPreview
                .filter(r => r.newName.trim().length > 0 && r.newName !== r.oldName)
                .map(r => ({ fileId: r.fileId, newName: r.newName }));
            onRename(renames);
        }
    };

    const hasChanges = mode === 'individual'
        ? Array.from(individualNames.entries()).some(([id, name]) => {
            const original = files.find(f => f.id === id);
            return original && name.trim() !== (original.decryptedFilename || original.filename);
        })
        : bulkPreview.some(r => r.newName !== r.oldName);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>Batch Rename ({files.length} files)</DialogTitle>
                    <DialogDescription>
                        Rename multiple files at once using different strategies.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="flex-1 overflow-hidden flex flex-col">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="bulk">Bulk Operations</TabsTrigger>
                        <TabsTrigger value="individual">Individual Names</TabsTrigger>
                    </TabsList>

                    {/* Bulk Operations Tab */}
                    <TabsContent value="bulk" className="flex-1 overflow-y-auto space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="prefix">Add Prefix</Label>
                                <Input
                                    id="prefix"
                                    value={prefix}
                                    onChange={(e) => setPrefix(e.target.value)}
                                    placeholder="prefix_"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="suffix">Add Suffix</Label>
                                <Input
                                    id="suffix"
                                    value={suffix}
                                    onChange={(e) => setSuffix(e.target.value)}
                                    placeholder="_suffix"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="find">Find Text</Label>
                                <Input
                                    id="find"
                                    value={findText}
                                    onChange={(e) => setFindText(e.target.value)}
                                    placeholder="old_text"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="replace">Replace With</Label>
                                <Input
                                    id="replace"
                                    value={replaceText}
                                    onChange={(e) => setReplaceText(e.target.value)}
                                    placeholder="new_text"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="numbering"
                                checked={useNumbering}
                                onChange={(e) => setUseNumbering(e.target.checked)}
                                className="h-4 w-4"
                                aria-describedby="numbering-label"
                            />
                            <Label htmlFor="numbering" id="numbering-label" className="cursor-pointer">
                                Add sequential numbering
                            </Label>
                            {useNumbering && (
                                <Input
                                    type="number"
                                    value={numberingStart}
                                    onChange={(e) => setNumberingStart(parseInt(e.target.value) || 1)}
                                    className="w-20"
                                    min={1}
                                />
                            )}
                        </div>

                        {/* Preview */}
                        <div className="space-y-2">
                            <Label>Preview</Label>
                            <div className="border rounded-md max-h-64 overflow-y-auto">
                                {bulkPreview.map((item) => (
                                    <div
                                        key={item.fileId}
                                        className={cn(
                                            "flex items-center justify-between gap-2 p-2 border-b last:border-b-0",
                                            item.newName !== item.oldName ? "bg-accent/50" : ""
                                        )}
                                    >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <FileIcon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                                            <span className="text-sm text-muted-foreground truncate line-through">
                                                {item.oldName}
                                            </span>
                                        </div>
                                        <span className="text-sm font-medium">→</span>
                                        <span className="text-sm font-medium truncate flex-1">
                                            {item.newName}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </TabsContent>

                    {/* Individual Names Tab */}
                    <TabsContent value="individual" className="flex-1 overflow-y-auto">
                        <div className="space-y-2">
                            {files.map((file) => (
                                <div key={file.id} className="flex items-center gap-2">
                                    <FileIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                    <Input
                                        value={individualNames.get(file.id) || file.decryptedFilename || file.filename}
                                        onChange={(e) => {
                                            const newMap = new Map(individualNames);
                                            newMap.set(file.id, e.target.value);
                                            setIndividualNames(newMap);
                                        }}
                                        placeholder={file.decryptedFilename || file.filename}
                                        className="flex-1"
                                    />
                                </div>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!hasChanges || isPending}>
                        {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Rename {files.length} File{files.length > 1 ? 's' : ''}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
