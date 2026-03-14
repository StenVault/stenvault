/**
 * useFileSelection Hook
 * 
 * Manages multi-select state for files in the file list.
 */

import { useState, useCallback } from 'react';
import type { FileItem } from '../types';

export function useFileSelection() {
    const [selectedFileIds, setSelectedFileIds] = useState<Set<number>>(new Set());

    const toggleFile = useCallback((fileId: number) => {
        setSelectedFileIds((prev) => {
            const next = new Set(prev);
            if (next.has(fileId)) {
                next.delete(fileId);
            } else {
                next.add(fileId);
            }
            return next;
        });
    }, []);

    const selectAll = useCallback((files: FileItem[]) => {
        setSelectedFileIds(new Set(files.map(f => f.id)));
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedFileIds(new Set());
    }, []);

    const isSelected = useCallback((fileId: number) => {
        return selectedFileIds.has(fileId);
    }, [selectedFileIds]);

    return {
        selectedFileIds,
        toggleFile,
        selectAll,
        clearSelection,
        isSelected,
        selectionCount: selectedFileIds.size,
    };
}
