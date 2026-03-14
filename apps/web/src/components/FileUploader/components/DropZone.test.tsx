/**
 * DropZone Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DropZone } from './DropZone';

// Mock ThemeContext
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      brand: { primary: '#6366f1' },
    },
  }),
}));

describe('DropZone', () => {
  const defaultProps = {
    isDragging: false,
    maxFiles: 10,
    maxSizeMB: 100,
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    onClick: vi.fn(),
    onFileChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render drop zone with default text', () => {
      render(<DropZone {...defaultProps} />);

      expect(screen.getByText(/drag & drop files here/i)).toBeInTheDocument();
      expect(screen.getByText(/browse/i)).toBeInTheDocument();
    });

    it('should display file limits', () => {
      render(<DropZone {...defaultProps} maxFiles={5} maxSizeMB={50} />);

      expect(screen.getByText(/max 5 files/i)).toBeInTheDocument();
      expect(screen.getByText(/50mb each/i)).toBeInTheDocument();
    });

    it('should have hidden file input', () => {
      render(<DropZone {...defaultProps} />);

      const input = document.querySelector('input[type="file"]');
      expect(input).toBeInTheDocument();
      expect(input).toHaveClass('hidden');
    });

    it('should allow multiple file selection', () => {
      render(<DropZone {...defaultProps} />);

      const input = document.querySelector('input[type="file"]');
      expect(input).toHaveAttribute('multiple');
    });
  });

  describe('dragging state', () => {
    it('should show different text when dragging', () => {
      render(<DropZone {...defaultProps} isDragging={true} />);

      expect(screen.getByText(/drop files here/i)).toBeInTheDocument();
      expect(screen.queryByText(/drag & drop/i)).not.toBeInTheDocument();
    });

    it('should apply dragging styles when isDragging is true', () => {
      const { container } = render(<DropZone {...defaultProps} isDragging={true} />);

      const dropZone = container.firstChild as HTMLElement;
      expect(dropZone).toHaveClass('border-primary');
    });
  });

  describe('event handlers', () => {
    it('should call onClick when clicked', () => {
      const onClick = vi.fn();
      render(<DropZone {...defaultProps} onClick={onClick} />);

      const dropZone = screen.getByText(/drag & drop/i).closest('div');
      fireEvent.click(dropZone!);

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should call onDragOver when dragging over', () => {
      const onDragOver = vi.fn();
      const { container } = render(<DropZone {...defaultProps} onDragOver={onDragOver} />);

      const dropZone = container.firstChild as HTMLElement;
      fireEvent.dragOver(dropZone);

      expect(onDragOver).toHaveBeenCalledTimes(1);
    });

    it('should call onDragLeave when leaving', () => {
      const onDragLeave = vi.fn();
      const { container } = render(<DropZone {...defaultProps} onDragLeave={onDragLeave} />);

      const dropZone = container.firstChild as HTMLElement;
      fireEvent.dragLeave(dropZone);

      expect(onDragLeave).toHaveBeenCalledTimes(1);
    });

    it('should call onDrop when dropping files', () => {
      const onDrop = vi.fn();
      const { container } = render(<DropZone {...defaultProps} onDrop={onDrop} />);

      const dropZone = container.firstChild as HTMLElement;
      fireEvent.drop(dropZone);

      expect(onDrop).toHaveBeenCalledTimes(1);
    });

    it('should call onFileChange when files are selected', () => {
      const onFileChange = vi.fn();
      render(<DropZone {...defaultProps} onFileChange={onFileChange} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      // Create a mock file
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const fileList = {
        0: file,
        length: 1,
        item: (index: number) => file,
      } as unknown as FileList;

      // Simulate file selection
      Object.defineProperty(input, 'files', { value: fileList });
      fireEvent.change(input);

      expect(onFileChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('ref forwarding', () => {
    it('should forward ref to input element', () => {
      const ref = { current: null } as unknown as React.RefObject<HTMLInputElement>;
      render(<DropZone {...defaultProps} ref={ref} />);

      expect(ref.current).toBeInstanceOf(HTMLInputElement);
      expect(ref.current?.type).toBe('file');
    });
  });

  describe('accessibility', () => {
    it('should have clickable area', () => {
      const onClick = vi.fn();
      const { container } = render(<DropZone {...defaultProps} onClick={onClick} />);

      // The outermost div should have cursor-pointer
      const dropZone = container.firstChild as HTMLElement;
      expect(dropZone).toHaveClass('cursor-pointer');
    });
  });
});
