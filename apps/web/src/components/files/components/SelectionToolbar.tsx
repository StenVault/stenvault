/**
 * SelectionToolbar Component
 *
 * Toolbar that appears when files are selected, offering batch operations.
 */

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, Pencil, Trash2, FolderInput, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SelectionToolbarProps {
    selectionCount: number;
    onBatchRename: () => void;
    onBatchDelete: () => void;
    onBulkDownload?: () => void;
    onBatchMove?: () => void;
    onClearSelection: () => void;
    isVaultLocked?: boolean;
}

export function SelectionToolbar({
    selectionCount,
    onBatchRename,
    onBatchDelete,
    onBulkDownload,
    onBatchMove,
    onClearSelection,
    isVaultLocked,
}: SelectionToolbarProps) {
    return (
        <AnimatePresence>
            {selectionCount > 0 && !isVaultLocked && (
                <motion.div
                    key="selection-toolbar"
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
                    role="toolbar"
                    aria-label="File selection actions"
                >
                    <Card className="px-4 py-3 shadow-lg border-2 border-primary/20 bg-card/95 backdrop-blur-sm">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-medium" aria-live="polite" aria-atomic="true">
                                {selectionCount} file{selectionCount > 1 ? 's' : ''} selected
                            </span>

                            <div className="h-4 w-px bg-border" />

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onBatchRename}
                                    className="gap-2"
                                >
                                    <Pencil className="w-4 h-4" />
                                    Rename
                                </Button>

                                {onBulkDownload && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={onBulkDownload}
                                        className="gap-2"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download
                                    </Button>
                                )}

                                {onBatchMove && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={onBatchMove}
                                        className="gap-2"
                                    >
                                        <FolderInput className="w-4 h-4" />
                                        Move
                                    </Button>
                                )}

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onBatchDelete}
                                    className="gap-2 text-destructive hover:text-destructive"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Delete
                                </Button>

                                <div className="h-4 w-px bg-border" />

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onClearSelection}
                                    className="gap-2"
                                >
                                    <X className="w-4 h-4" />
                                    Clear
                                </Button>
                            </div>
                        </div>
                    </Card>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
