/**
 * useFileSelection Hook Tests
 *
 * Tests file selection state management for batch operations.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileSelection } from './useFileSelection';
import type { FileItem } from '../types';

describe('useFileSelection', () => {
  const createMockFile = (id: number): FileItem => ({
    id,
    filename: `file${id}.txt`,
    mimeType: 'text/plain',
    size: 1024,
    fileType: 'document',
    folderId: null,
    createdAt: new Date(),
  });

  describe('Initialization', () => {
    it('should initialize with empty selection', () => {
      const { result } = renderHook(() => useFileSelection());

      expect(result.current.selectedFileIds.size).toBe(0);
      expect(result.current.selectionCount).toBe(0);
    });
  });

  describe('toggleFile', () => {
    it('should select a file', () => {
      const { result } = renderHook(() => useFileSelection());

      act(() => {
        result.current.toggleFile(1);
      });

      expect(result.current.selectedFileIds.has(1)).toBe(true);
      expect(result.current.selectionCount).toBe(1);
    });

    it('should deselect a selected file', () => {
      const { result } = renderHook(() => useFileSelection());

      act(() => {
        result.current.toggleFile(1);
      });

      expect(result.current.selectedFileIds.has(1)).toBe(true);

      act(() => {
        result.current.toggleFile(1);
      });

      expect(result.current.selectedFileIds.has(1)).toBe(false);
      expect(result.current.selectionCount).toBe(0);
    });

    it('should select multiple files', () => {
      const { result } = renderHook(() => useFileSelection());

      act(() => {
        result.current.toggleFile(1);
        result.current.toggleFile(2);
        result.current.toggleFile(3);
      });

      expect(result.current.selectedFileIds.has(1)).toBe(true);
      expect(result.current.selectedFileIds.has(2)).toBe(true);
      expect(result.current.selectedFileIds.has(3)).toBe(true);
      expect(result.current.selectionCount).toBe(3);
    });

    it('should toggle files independently', () => {
      const { result } = renderHook(() => useFileSelection());

      act(() => {
        result.current.toggleFile(1);
        result.current.toggleFile(2);
      });

      expect(result.current.selectionCount).toBe(2);

      act(() => {
        result.current.toggleFile(1);
      });

      expect(result.current.selectedFileIds.has(1)).toBe(false);
      expect(result.current.selectedFileIds.has(2)).toBe(true);
      expect(result.current.selectionCount).toBe(1);
    });
  });

  describe('isSelected', () => {
    it('should return false for unselected file', () => {
      const { result } = renderHook(() => useFileSelection());

      expect(result.current.isSelected(1)).toBe(false);
    });

    it('should return true for selected file', () => {
      const { result } = renderHook(() => useFileSelection());

      act(() => {
        result.current.toggleFile(1);
      });

      expect(result.current.isSelected(1)).toBe(true);
    });

    it('should update after deselection', () => {
      const { result } = renderHook(() => useFileSelection());

      act(() => {
        result.current.toggleFile(1);
      });

      expect(result.current.isSelected(1)).toBe(true);

      act(() => {
        result.current.toggleFile(1);
      });

      expect(result.current.isSelected(1)).toBe(false);
    });
  });

  describe('selectAll', () => {
    it('should select all provided files', () => {
      const { result } = renderHook(() => useFileSelection());
      const files = [
        createMockFile(1),
        createMockFile(2),
        createMockFile(3),
        createMockFile(4),
        createMockFile(5),
      ];

      act(() => {
        result.current.selectAll(files);
      });

      expect(result.current.selectionCount).toBe(5);
      expect(result.current.isSelected(1)).toBe(true);
      expect(result.current.isSelected(5)).toBe(true);
    });

    it('should handle empty array', () => {
      const { result } = renderHook(() => useFileSelection());

      act(() => {
        result.current.selectAll([]);
      });

      expect(result.current.selectionCount).toBe(0);
    });

    it('should replace previous selection', () => {
      const { result } = renderHook(() => useFileSelection());

      const files1 = [createMockFile(1), createMockFile(2)];
      const files2 = [createMockFile(3), createMockFile(4)];

      act(() => {
        result.current.selectAll(files1);
      });

      expect(result.current.selectionCount).toBe(2);
      expect(result.current.isSelected(1)).toBe(true);

      act(() => {
        result.current.selectAll(files2);
      });

      expect(result.current.selectionCount).toBe(2);
      expect(result.current.isSelected(1)).toBe(false);
      expect(result.current.isSelected(3)).toBe(true);
    });
  });

  describe('clearSelection', () => {
    it('should clear all selected files', () => {
      const { result } = renderHook(() => useFileSelection());

      act(() => {
        result.current.toggleFile(1);
        result.current.toggleFile(2);
        result.current.toggleFile(3);
      });

      expect(result.current.selectionCount).toBe(3);

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectionCount).toBe(0);
      expect(result.current.isSelected(1)).toBe(false);
      expect(result.current.isSelected(2)).toBe(false);
      expect(result.current.isSelected(3)).toBe(false);
    });

    it('should handle clearing empty selection', () => {
      const { result } = renderHook(() => useFileSelection());

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectionCount).toBe(0);
    });
  });

  describe('selectionCount', () => {
    it('should track selection count accurately', () => {
      const { result } = renderHook(() => useFileSelection());

      expect(result.current.selectionCount).toBe(0);

      act(() => {
        result.current.toggleFile(1);
      });

      expect(result.current.selectionCount).toBe(1);

      act(() => {
        result.current.toggleFile(2);
        result.current.toggleFile(3);
      });

      expect(result.current.selectionCount).toBe(3);

      act(() => {
        result.current.toggleFile(1);
      });

      expect(result.current.selectionCount).toBe(2);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle rapid toggles correctly', () => {
      const { result } = renderHook(() => useFileSelection());

      act(() => {
        result.current.toggleFile(1);
        result.current.toggleFile(1);
        result.current.toggleFile(1);
      });

      expect(result.current.isSelected(1)).toBe(true);
      expect(result.current.selectionCount).toBe(1);
    });

    it('should handle select all followed by deselection', () => {
      const { result } = renderHook(() => useFileSelection());
      const files = [createMockFile(1), createMockFile(2), createMockFile(3)];

      act(() => {
        result.current.selectAll(files);
      });

      expect(result.current.selectionCount).toBe(3);

      act(() => {
        result.current.toggleFile(2);
      });

      expect(result.current.selectionCount).toBe(2);
      expect(result.current.isSelected(2)).toBe(false);
      expect(result.current.isSelected(1)).toBe(true);
      expect(result.current.isSelected(3)).toBe(true);
    });

    it('should maintain selection integrity across operations', () => {
      const { result } = renderHook(() => useFileSelection());
      const files = [createMockFile(1), createMockFile(2), createMockFile(3)];

      // Add some manually
      act(() => {
        result.current.toggleFile(1);
        result.current.toggleFile(2);
      });

      expect(result.current.selectionCount).toBe(2);

      // Select all
      act(() => {
        result.current.selectAll(files);
      });

      expect(result.current.selectionCount).toBe(3);

      // Clear
      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectionCount).toBe(0);

      // Should work normally after clear
      act(() => {
        result.current.toggleFile(1);
      });

      expect(result.current.selectionCount).toBe(1);
      expect(result.current.isSelected(1)).toBe(true);
    });
  });
});
