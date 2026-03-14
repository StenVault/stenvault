/**
 * ActionSheet Component Tests
 *
 * Tests mobile bottom sheet with upload and new folder actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionSheet } from './ActionSheet';

// Mock vaul drawer
vi.mock('vaul', () => ({
  Drawer: {
    Root: ({ children, open }: any) => (open ? <div data-testid="drawer-root">{children}</div> : null),
    Portal: ({ children }: any) => <div data-testid="drawer-portal">{children}</div>,
    Overlay: ({ style }: any) => <div data-testid="drawer-overlay" style={style} />,
    Content: ({ children, style }: any) => <div data-testid="drawer-content" style={style}>{children}</div>,
    Title: ({ children, style }: any) => <div data-testid="drawer-title" style={style}>{children}</div>,
  },
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    button: ({ children, onClick, style, initial, animate, transition, whileTap, ...props }: any) => (
      <button onClick={onClick} style={style} {...props}>
        {children}
      </button>
    ),
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Upload: () => <div data-testid="icon-upload" />,
  FolderPlus: () => <div data-testid="icon-folder-plus" />,
  X: () => <div data-testid="icon-x" />,
}));

// Mock ThemeContext
const mockTheme = {
  brand: { primary: '#4F46E5' },
  semantic: {},
};
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: mockTheme }),
}));

// Mock haptics
vi.mock('@/lib/haptics', () => ({
  hapticTap: vi.fn(),
}));

describe('ActionSheet', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnUpload = vi.fn();
  const mockOnNewFolder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should not render when closed', () => {
      render(
        <ActionSheet
          open={false}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      expect(screen.queryByTestId('drawer-root')).not.toBeInTheDocument();
    });

    it('should render when open', () => {
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      expect(screen.getByTestId('drawer-root')).toBeInTheDocument();
    });

    it('should render drawer portal', () => {
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      expect(screen.getByTestId('drawer-portal')).toBeInTheDocument();
    });

    it('should render drawer overlay', () => {
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      expect(screen.getByTestId('drawer-overlay')).toBeInTheDocument();
    });

    it('should render drawer content', () => {
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      expect(screen.getByTestId('drawer-content')).toBeInTheDocument();
    });
  });

  describe('Title and Drag Handle', () => {
    it('should render title', () => {
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      expect(screen.getByText('Add')).toBeInTheDocument();
    });

    it('should render drag handle', () => {
      const { container } = render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      // Drag handle is a styled div
      const dragHandle = container.querySelector('[style*="width: 36"]');
      expect(dragHandle).toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('should render upload button', () => {
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      expect(screen.getByTestId('icon-upload')).toBeInTheDocument();
      expect(screen.getByText('Upload Files')).toBeInTheDocument();
    });

    it('should render new folder button', () => {
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      expect(screen.getByTestId('icon-folder-plus')).toBeInTheDocument();
      expect(screen.getByText('New Folder')).toBeInTheDocument();
    });

    it('should render action descriptions', () => {
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      expect(screen.getByText('Upload files from device')).toBeInTheDocument();
      expect(screen.getByText('Create a folder to organise')).toBeInTheDocument();
    });
  });

  describe('Upload Action', () => {
    it('should call onUpload when upload button clicked', async () => {
      const user = userEvent.setup();
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      const uploadButton = screen.getByText('Upload Files').closest('button');
      await user.click(uploadButton!);

      expect(mockOnUpload).toHaveBeenCalledTimes(1);
    });

    it('should trigger haptic feedback on upload click', async () => {
      const { hapticTap } = await import('@/lib/haptics');
      const user = userEvent.setup();
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      const uploadButton = screen.getByText('Upload Files').closest('button');
      await user.click(uploadButton!);

      expect(hapticTap).toHaveBeenCalled();
    });

    it('should work when onUpload is not provided', async () => {
      const user = userEvent.setup();
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onNewFolder={mockOnNewFolder}
        />
      );

      const uploadButton = screen.getByText('Upload Files').closest('button');
      await user.click(uploadButton!);

      // Should not throw error
      expect(mockOnNewFolder).not.toHaveBeenCalled();
    });
  });

  describe('New Folder Action', () => {
    it('should call onNewFolder when folder button clicked', async () => {
      const user = userEvent.setup();
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      const folderButton = screen.getByText('New Folder').closest('button');
      await user.click(folderButton!);

      expect(mockOnNewFolder).toHaveBeenCalledTimes(1);
    });

    it('should trigger haptic feedback on folder click', async () => {
      const { hapticTap } = await import('@/lib/haptics');
      const user = userEvent.setup();
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      const folderButton = screen.getByText('New Folder').closest('button');
      await user.click(folderButton!);

      expect(hapticTap).toHaveBeenCalled();
    });

    it('should work when onNewFolder is not provided', async () => {
      const user = userEvent.setup();
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
        />
      );

      const folderButton = screen.getByText('New Folder').closest('button');
      await user.click(folderButton!);

      // Should not throw error
      expect(mockOnUpload).not.toHaveBeenCalled();
    });
  });

  describe('Integration', () => {
    it('should handle complete action flow', async () => {
      const { hapticTap } = await import('@/lib/haptics');
      const user = userEvent.setup();
      render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      // Click upload
      const uploadButton = screen.getByText('Upload Files').closest('button');
      await user.click(uploadButton!);

      expect(mockOnUpload).toHaveBeenCalledTimes(1);
      expect(hapticTap).toHaveBeenCalled();

      vi.clearAllMocks();

      // Click new folder
      const folderButton = screen.getByText('New Folder').closest('button');
      await user.click(folderButton!);

      expect(mockOnNewFolder).toHaveBeenCalledTimes(1);
      expect(hapticTap).toHaveBeenCalled();
    });

    it('should render with grid layout', () => {
      const { container } = render(
        <ActionSheet
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        />
      );

      const grid = container.querySelector('[style*="display: grid"]');
      expect(grid).toBeInTheDocument();
    });
  });
});
