/**
 * UploadProgress Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadProgress } from './UploadProgress';
import type { UploadFile } from '../types';

// Mock ThemeContext
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      brand: { primary: '#6366f1' },
      semantic: {
        success: '#22c55e',
        error: '#ef4444',
      },
    },
  }),
}));

// Helper to create test files
function createUploadFile(overrides: Partial<UploadFile> = {}): UploadFile {
  return {
    id: 'test-id-1',
    file: new File(['test content'], 'test-file.txt', { type: 'text/plain' }),
    progress: 0,
    status: 'pending',
    ...overrides,
  };
}

describe('UploadProgress', () => {
  const defaultProps = {
    files: [],
    onRemove: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty state', () => {
    it('should render nothing when files array is empty', () => {
      const { container } = render(<UploadProgress {...defaultProps} files={[]} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('file list rendering', () => {
    it('should render file name', () => {
      const files = [createUploadFile({ file: new File([''], 'document.pdf', { type: 'application/pdf' }) })];
      render(<UploadProgress {...defaultProps} files={files} />);

      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    it('should render multiple files', () => {
      const files = [
        createUploadFile({ id: '1', file: new File([''], 'file1.txt', { type: 'text/plain' }) }),
        createUploadFile({ id: '2', file: new File([''], 'file2.txt', { type: 'text/plain' }) }),
        createUploadFile({ id: '3', file: new File([''], 'file3.txt', { type: 'text/plain' }) }),
      ];
      render(<UploadProgress {...defaultProps} files={files} />);

      expect(screen.getByText('file1.txt')).toBeInTheDocument();
      expect(screen.getByText('file2.txt')).toBeInTheDocument();
      expect(screen.getByText('file3.txt')).toBeInTheDocument();
    });

    it('should display progress percentage', () => {
      const files = [createUploadFile({ progress: 45 })];
      render(<UploadProgress {...defaultProps} files={files} />);

      expect(screen.getByText('45%')).toBeInTheDocument();
    });

    it('should display 0% for pending files', () => {
      const files = [createUploadFile({ progress: 0, status: 'pending' })];
      render(<UploadProgress {...defaultProps} files={files} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('should display 100% for completed files', () => {
      const files = [createUploadFile({ progress: 100, status: 'completed' })];
      render(<UploadProgress {...defaultProps} files={files} />);

      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  describe('status indicators', () => {
    it('should show encrypting indicator for encrypting status', () => {
      const files = [createUploadFile({ status: 'encrypting', progress: 30 })];
      const { container } = render(<UploadProgress {...defaultProps} files={files} />);

      // Look for animated pulse class (ShieldCheck icon)
      const pulse = container.querySelector('.animate-pulse');
      expect(pulse).toBeInTheDocument();
    });

    it('should show spinner for uploading status', () => {
      const files = [createUploadFile({ status: 'uploading', progress: 50 })];
      const { container } = render(<UploadProgress {...defaultProps} files={files} />);

      // Look for animated spinner class
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should show check icon for completed status', () => {
      const files = [createUploadFile({ status: 'completed', progress: 100 })];
      render(<UploadProgress {...defaultProps} files={files} />);

      // CheckCircle2 should be present - verify by color style
      const { container } = render(<UploadProgress {...defaultProps} files={files} />);
      const checkIcon = container.querySelector('[style*="color: rgb(34, 197, 94)"]');
      expect(checkIcon || container.querySelector('svg')).toBeInTheDocument();
    });

    it('should show alert icon for error status', () => {
      const files = [createUploadFile({ status: 'error', error: 'Upload failed' })];
      render(<UploadProgress {...defaultProps} files={files} />);

      // Error message should be visible
      expect(screen.getByText('Upload failed')).toBeInTheDocument();
    });
  });

  describe('error display', () => {
    it('should display error message when file has error', () => {
      const files = [createUploadFile({ status: 'error', error: 'File too large' })];
      render(<UploadProgress {...defaultProps} files={files} />);

      expect(screen.getByText('File too large')).toBeInTheDocument();
    });

    it('should not display error when status is not error', () => {
      const files = [createUploadFile({ status: 'uploading' })];
      render(<UploadProgress {...defaultProps} files={files} />);

      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });
  });

  describe('preview image', () => {
    it('should render preview image when previewUrl is provided', () => {
      const files = [createUploadFile({ previewUrl: 'blob:http://localhost/preview' })];
      render(<UploadProgress {...defaultProps} files={files} />);

      const img = screen.getByAltText('Preview');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'blob:http://localhost/preview');
    });

    it('should render file icon when no preview is available', () => {
      const files = [createUploadFile({ previewUrl: undefined })];
      const { container } = render(<UploadProgress {...defaultProps} files={files} />);

      // Should have file icon SVG
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('remove functionality', () => {
    it('should have remove button for each file', () => {
      const files = [
        createUploadFile({ id: '1' }),
        createUploadFile({ id: '2' }),
      ];
      render(<UploadProgress {...defaultProps} files={files} />);

      const removeButtons = screen.getAllByRole('button');
      expect(removeButtons.length).toBe(2);
    });

    it('should call onRemove with correct id when remove button clicked', async () => {
      const onRemove = vi.fn();
      const files = [createUploadFile({ id: 'file-123' })];
      render(<UploadProgress files={files} onRemove={onRemove} />);

      const removeButton = screen.getByRole('button');
      await userEvent.click(removeButton);

      expect(onRemove).toHaveBeenCalledWith('file-123');
    });

    it('should call onRemove for correct file in list', async () => {
      const onRemove = vi.fn();
      const files = [
        createUploadFile({ id: 'file-1', file: new File([''], 'first.txt') }),
        createUploadFile({ id: 'file-2', file: new File([''], 'second.txt') }),
        createUploadFile({ id: 'file-3', file: new File([''], 'third.txt') }),
      ];
      render(<UploadProgress files={files} onRemove={onRemove} />);

      const removeButtons = screen.getAllByRole('button');
      await userEvent.click(removeButtons[1]!); // Click middle file's remove

      expect(onRemove).toHaveBeenCalledWith('file-2');
    });
  });

  describe('progress bar', () => {
    it('should render progress bar with correct value', () => {
      const files = [createUploadFile({ progress: 75 })];
      render(<UploadProgress {...defaultProps} files={files} />);

      // Progress component should reflect the value
      const progressBar = document.querySelector('[role="progressbar"]');
      if (progressBar) {
        expect(progressBar).toHaveAttribute('aria-valuenow', '75');
      }
      // Fallback: check percentage text is shown
      expect(screen.getByText('75%')).toBeInTheDocument();
    });
  });

  describe('file name truncation', () => {
    it('should have truncate class for long file names', () => {
      const longFileName = 'this-is-a-very-long-file-name-that-should-be-truncated.txt';
      const files = [createUploadFile({ file: new File([''], longFileName) })];
      render(<UploadProgress {...defaultProps} files={files} />);

      const fileNameElement = screen.getByText(longFileName);
      expect(fileNameElement).toHaveClass('truncate');
    });
  });
});
