/**
 * StorageSettings Component Tests
 *
 * Tests storage usage display, progress bar, and empty trash functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StorageSettings } from './StorageSettings';

// Mock tRPC
const mockMutateAsync = vi.fn();
vi.mock('@/lib/trpc', () => ({
  trpc: {
    files: {
      emptyTrash: {
        useMutation: () => ({
          mutateAsync: mockMutateAsync,
        }),
      },
      listDeleted: {
        useQuery: () => ({
          data: undefined,
        }),
      },
    },
  },
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock formatBytes
vi.mock('@/utils/formatters', () => ({
  formatBytes: (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  },
}));

// Mock ThemeContext
const mockTheme = {
  brand: { primary: '#4F46E5', secondary: '#8B5CF6' },
};
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: mockTheme }),
}));

// Mock UI components
vi.mock('@stenvault/shared/ui/aurora-card', () => ({
  AuroraCard: ({ children, className }: any) => <div data-testid="card" className={className}>{children}</div>,
}));

vi.mock('@stenvault/shared/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} data-size={size}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <div data-testid="separator" />,
}));

vi.mock('@stenvault/shared/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: any) => open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div data-testid="dialog-footer">{children}</div>,
  AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
  AlertDialogAction: ({ children, onClick }: any) => <button data-testid="dialog-confirm" onClick={onClick}>{children}</button>,
}));

// Mock lucide icons (Download moved with the export card to DataExportSection)
vi.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="icon-loader" />,
  Trash2: () => <div data-testid="icon-trash" />,
}));

describe('StorageSettings', () => {
  const mockRefetchStorage = vi.fn();
  const mockStorageStats = {
    storageUsed: 5368709120, // 5 GB
    storageQuota: 10737418240, // 10 GB
    percentUsed: 50,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ message: 'Trash emptied successfully' });
  });

  describe('Loading State', () => {
    it('should show loading state when storageStats is undefined', () => {
      render(<StorageSettings storageStats={undefined} refetchStorage={mockRefetchStorage} />);

      expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
      expect(screen.getByText('Loading storage statistics...')).toBeInTheDocument();
    });

    it('should show loading spinner', () => {
      render(<StorageSettings storageStats={undefined} refetchStorage={mockRefetchStorage} />);

      const loader = screen.getByTestId('icon-loader');
      expect(loader).toBeInTheDocument();
    });
  });

  describe('Component Rendering', () => {
    it('should render storage card when stats are loaded', () => {
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      // Storage card only — Export Vault moved to DataExportSection (Account / Profile).
      expect(screen.getAllByTestId('card')).toHaveLength(1);
    });

    it('should render title and description', () => {
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      expect(screen.getByText('Storage')).toBeInTheDocument();
      expect(screen.getByText('Manage your disk space')).toBeInTheDocument();
    });

    it('should render trash icon', () => {
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      expect(screen.getByTestId('icon-trash')).toBeInTheDocument();
    });

    it('should render separator', () => {
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      expect(screen.getByTestId('separator')).toBeInTheDocument();
    });
  });

  describe('Storage Display', () => {
    it('should display percentage used', () => {
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      expect(screen.getByText('50% Used')).toBeInTheDocument();
    });

    it('should display storage used and quota', () => {
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      expect(screen.getByText(/5.0 GB of 10.0 GB/i)).toBeInTheDocument();
    });

    it('should render progress bar', () => {
      const { container } = render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      const progressBar = container.querySelector('[style*="width: 50%"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('should cap progress bar at 100%', () => {
      const overQuotaStats = { ...mockStorageStats, percentUsed: 150 };
      const { container } = render(<StorageSettings storageStats={overQuotaStats} refetchStorage={mockRefetchStorage} />);

      const progressBar = container.querySelector('[style*="width: 100%"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('should handle zero storage correctly', () => {
      const emptyStats = { storageUsed: 0, storageQuota: 10737418240, percentUsed: 0 };
      render(<StorageSettings storageStats={emptyStats} refetchStorage={mockRefetchStorage} />);

      expect(screen.getByText('0% Used')).toBeInTheDocument();
      expect(screen.getByText(/0 B of 10.0 GB/i)).toBeInTheDocument();
    });
  });

  describe('Empty Trash Functionality', () => {
    it('should render empty trash button', () => {
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      const button = screen.getByText('Empty Now').closest('button');
      expect(button).toBeInTheDocument();
    });

    it('should show trash section text', () => {
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      expect(screen.getByText('Empty Trash')).toBeInTheDocument();
      expect(screen.getByText('Permanently remove deleted files')).toBeInTheDocument();
    });

    it('should show confirmation dialog on button click', async () => {
      const user = userEvent.setup();
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      const button = screen.getByText('Empty Now').closest('button');
      await user.click(button!);

      expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();
    });

    it('should empty trash when confirmed', async () => {
      const user = userEvent.setup();
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      // Open dialog
      await user.click(screen.getByText('Empty Now').closest('button')!);

      // Click confirm button in dialog
      await user.click(screen.getByTestId('dialog-confirm'));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      });
    });

    it('should show success toast on successful empty', async () => {
      const { toast } = await import('sonner');
      const user = userEvent.setup();
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      await user.click(screen.getByText('Empty Now').closest('button')!);
      await user.click(screen.getByTestId('dialog-confirm'));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Trash emptied successfully');
      });
    });

    it('should call refetchStorage after successful empty', async () => {
      const user = userEvent.setup();
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      await user.click(screen.getByText('Empty Now').closest('button')!);
      await user.click(screen.getByTestId('dialog-confirm'));

      await waitFor(() => {
        expect(mockRefetchStorage).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle empty trash error', async () => {
      const { toast } = await import('sonner');
      mockMutateAsync.mockRejectedValue(new Error('Failed to empty trash'));
      const user = userEvent.setup();
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      await user.click(screen.getByText('Empty Now').closest('button')!);
      await user.click(screen.getByTestId('dialog-confirm'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Error emptying trash');
      });
    });

    it('should show loading state during empty operation', async () => {
      const user = userEvent.setup();
      mockMutateAsync.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      await user.click(screen.getByText('Empty Now').closest('button')!);
      await user.click(screen.getByTestId('dialog-confirm'));

      expect(screen.getByText('Emptying...')).toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('should handle complete empty trash flow', async () => {
      const { toast } = await import('sonner');
      const user = userEvent.setup();
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      // Click empty trash
      await user.click(screen.getByText('Empty Now').closest('button')!);

      // Verify dialog opened
      expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();

      // Confirm in dialog
      await user.click(screen.getByTestId('dialog-confirm'));

      // Verify mutation called
      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });

      // Verify success feedback
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
        expect(mockRefetchStorage).toHaveBeenCalled();
      });
    });

    it('should display all storage information correctly', () => {
      render(<StorageSettings storageStats={mockStorageStats} refetchStorage={mockRefetchStorage} />);

      // Title and description
      expect(screen.getByText('Storage')).toBeInTheDocument();

      // Usage stats
      expect(screen.getByText('50% Used')).toBeInTheDocument();
      expect(screen.getByText(/5.0 GB of 10.0 GB/i)).toBeInTheDocument();

      // Empty trash section
      expect(screen.getByText('Empty Trash')).toBeInTheDocument();
      expect(screen.getByText('Empty Now')).toBeInTheDocument();
    });
  });

  // Export Vault tests moved to DataExportSection.test.tsx — see that file
  // for the export-card behaviour. StorageSettings is now Storage + Empty
  // Trash only.
});
