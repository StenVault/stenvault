/**
 * Hook for keyboard shortcuts
 * Provides global keyboard shortcuts for common actions
 * 
 * Shortcuts:
 * - Ctrl/Cmd + U: Upload files
 * - Ctrl/Cmd + N: New folder
 * - Ctrl/Cmd + K: Quick search / Command palette
 * - Escape: Close modals/panels
 * - Delete: Delete selected items
 */
import { useEffect, useCallback } from "react";
import { useLocation } from "wouter";

export interface KeyboardShortcut {
    key: string;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    alt?: boolean;
    handler?: () => void;
    action?: () => void;
    description?: string;
    preventDefault?: boolean;
}

interface UseKeyboardShortcutsOptions {
    onUpload?: () => void;
    onNewFolder?: () => void;
    onSearch?: () => void;
    onEscape?: () => void;
    onDelete?: () => void;
    onRefresh?: () => void;
    enabled?: boolean;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
    const {
        onUpload,
        onNewFolder,
        onSearch,
        onEscape,
        onDelete,
        onRefresh,
        enabled = true,
    } = options;

    const [location] = useLocation();

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (!enabled) return;

        const target = event.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable;

        if (event.key === 'Escape') {
            onEscape?.();
            return;
        }

        if (isInput) return;

        const isMod = event.metaKey || event.ctrlKey;

        if (isMod && event.key.toLowerCase() === 'u') {
            event.preventDefault();
            onUpload?.();
            return;
        }

        if (isMod && event.key.toLowerCase() === 'n') {
            event.preventDefault();
            onNewFolder?.();
            return;
        }

        if (isMod && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            onSearch?.();
            return;
        }

        if (isMod && event.key.toLowerCase() === 'r' && location.startsWith('/drive')) {
            event.preventDefault();
            onRefresh?.();
            return;
        }

        if (event.key === 'Delete' && !event.shiftKey) {
            onDelete?.();
            return;
        }
    }, [enabled, onUpload, onNewFolder, onSearch, onEscape, onDelete, onRefresh, location]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const shortcuts: KeyboardShortcut[] = [
        { key: 'U', ctrl: true, action: () => onUpload?.(), description: 'Upload files' },
        { key: 'N', ctrl: true, action: () => onNewFolder?.(), description: 'New folder' },
        { key: 'K', ctrl: true, action: () => onSearch?.(), description: 'Quick search' },
        { key: 'R', ctrl: true, action: () => onRefresh?.(), description: 'Refresh' },
        { key: 'Escape', action: () => onEscape?.(), description: 'Close' },
        { key: 'Delete', action: () => onDelete?.(), description: 'Delete selected' },
    ].filter(s => {
        if (s.key === 'U') return !!onUpload;
        if (s.key === 'N') return !!onNewFolder;
        if (s.key === 'K') return !!onSearch;
        if (s.key === 'R') return !!onRefresh;
        if (s.key === 'Escape') return !!onEscape;
        if (s.key === 'Delete') return !!onDelete;
        return true;
    });

    return { shortcuts };
}

export function formatShortcut(shortcut: KeyboardShortcut): string {
    const parts: string[] = [];

    const isMac = typeof navigator !== 'undefined' &&
        navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    if (shortcut.ctrl) parts.push(isMac ? '⌘' : 'Ctrl');
    if (shortcut.shift) parts.push(isMac ? '⇧' : 'Shift');
    if (shortcut.alt) parts.push(isMac ? '⌥' : 'Alt');

    parts.push(shortcut.key);

    return parts.join(isMac ? '' : '+');
}