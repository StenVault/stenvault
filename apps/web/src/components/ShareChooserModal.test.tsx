/**
 * ShareChooserModal Component Tests
 *
 * Tests share method chooser modal that allows users to select between
 * Email Share, P2P Share, and Offline Transfer options.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareChooserModal } from './ShareChooserModal';

// Mock tRPC
const mockUseQuery = vi.fn();
vi.mock('@/lib/trpc', () => ({
  trpc: {
    p2p: {
      isEnabled: {
        useQuery: (...args: any[]) => mockUseQuery(...args),
      },
    },
    stripe: {
      getSubscription: {
        useQuery: () => ({ data: { isAdmin: false, features: { p2pQuantumMesh: true } } }),
      },
    },
  },
}));

// Mock ShareFileModal
vi.mock('@/components/ShareFileModal', () => ({
  ShareFileModal: ({ open, onClose, file }: any) => (
    open ? (
      <div data-testid="share-file-modal">
        <span>Email Share Modal for {file?.filename}</span>
        <button onClick={onClose}>Close Email Modal</button>
      </div>
    ) : null
  ),
}));

// Mock P2P modals
vi.mock('@/components/p2p', () => ({
  P2PShareModal: ({ open, onOpenChange, fileName }: any) => (
    open ? (
      <div data-testid="p2p-share-modal">
        <span>P2P Modal for {fileName}</span>
        <button onClick={() => onOpenChange(false)}>Close P2P Modal</button>
      </div>
    ) : null
  ),
  OfflineShareModal: ({ open, onOpenChange, fileName }: any) => (
    open ? (
      <div data-testid="offline-share-modal">
        <span>Offline Modal for {fileName}</span>
        <button onClick={() => onOpenChange(false)}>Close Offline Modal</button>
      </div>
    ) : null
  ),
}));

// Mock UI components
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <div data-testid="dialog-title">{children}</div>,
  DialogDescription: ({ children }: any) => <div data-testid="dialog-description">{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant }: any) => (
    <button onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, onClick, className }: any) => (
    <div data-testid="card" onClick={onClick} className={className}>
      {children}
    </div>
  ),
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <div data-testid="card-title">{children}</div>,
  CardDescription: ({ children }: any) => <div data-testid="card-description">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/' }),
  useNavigate: () => vi.fn(),
}));

// Mock lucide icons
vi.mock('lucide-react', () => ({
  Mail: () => <div data-testid="icon-mail" />,
  Wifi: () => <div data-testid="icon-wifi" />,
  Shield: () => <div data-testid="icon-shield" />,
  Zap: () => <div data-testid="icon-zap" />,
  Clock: () => <div data-testid="icon-clock" />,
  Users: () => <div data-testid="icon-users" />,
  ArrowRight: () => <div data-testid="icon-arrow-right" />,
  Loader2: () => <div data-testid="icon-loader" />,
  CloudUpload: () => <div data-testid="icon-cloud-upload" />,
  Lock: () => <div data-testid="icon-lock" />,
}));

describe('ShareChooserModal', () => {
  const mockOnClose = vi.fn();
  const mockFile = {
    id: 1,
    filename: 'test-file.pdf',
    size: 1024,
    encryptionSalt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: P2P enabled
    mockUseQuery.mockReturnValue({
      data: true,
      isLoading: false,
    });
  });

  describe('Component Rendering', () => {
    it('should render dialog when open', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByTestId('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <ShareChooserModal
          open={false}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('should not render when file is null', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={null}
        />
      );

      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('should render title and description', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByText('Share File')).toBeInTheDocument();
      expect(screen.getByText(/Choose how you want to share/i)).toBeInTheDocument();
      expect(screen.getByText('test-file.pdf')).toBeInTheDocument();
    });

    it('should render shield icon in title', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      const shields = screen.getAllByTestId('icon-shield');
      expect(shields.length).toBeGreaterThan(0);
    });

    it('should render cancel button', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  describe('Email Share Option', () => {
    it('should render email share card', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByText('Email Share')).toBeInTheDocument();
      expect(screen.getByText('Send via email with download link')).toBeInTheDocument();
    });

    it('should render email icon', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByTestId('icon-mail')).toBeInTheDocument();
    });

    it('should render email share badges', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByText(/Expiration options/i)).toBeInTheDocument();
      expect(screen.getByText(/Password protected/i)).toBeInTheDocument();
    });

    it('should render arrow right icon', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      const arrows = screen.getAllByTestId('icon-arrow-right');
      expect(arrows.length).toBeGreaterThan(0);
    });
  });

  describe('P2P Loading State', () => {
    it('should show loading state when checking P2P', () => {
      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByText('Checking P2P availability...')).toBeInTheDocument();
      expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
    });

    it('should render dashed border card when loading', () => {
      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      const { container } = render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      const dashedCard = container.querySelector('.border-dashed');
      expect(dashedCard).toBeInTheDocument();
    });
  });

  describe('P2P Enabled State', () => {
    it('should render P2P card when enabled', () => {
      mockUseQuery.mockReturnValue({
        data: true,
        isLoading: false,
      });

      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByText('Quantum Mesh Network')).toBeInTheDocument();
      expect(screen.getByText('Direct browser-to-browser transfer')).toBeInTheDocument();
    });

    it('should render P2P badge', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByText('P2P')).toBeInTheDocument();
    });

    it('should render P2P icons', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByTestId('icon-wifi')).toBeInTheDocument();
    });

    it('should render P2P feature badges', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByText(/Real-time transfer/i)).toBeInTheDocument();
      expect(screen.getByText(/Server never sees data/i)).toBeInTheDocument();
      expect(screen.getByText(/Both users online/i)).toBeInTheDocument();
    });

    it('should render P2P badge icons', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByTestId('icon-zap')).toBeInTheDocument();
      expect(screen.getByTestId('icon-users')).toBeInTheDocument();
    });
  });

  describe('P2P Disabled State', () => {
    it('should show disabled state when P2P is disabled', () => {
      mockUseQuery.mockReturnValue({
        data: false,
        isLoading: false,
      });

      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByText(/P2P sharing is currently disabled by administrator/i)).toBeInTheDocument();
    });

    it('should not show offline transfer when P2P disabled', () => {
      mockUseQuery.mockReturnValue({
        data: false,
        isLoading: false,
      });

      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.queryByText('Offline Transfer')).not.toBeInTheDocument();
    });
  });

  describe('Offline Transfer Option', () => {
    it('should render offline transfer when P2P enabled', () => {
      mockUseQuery.mockReturnValue({
        data: true,
        isLoading: false,
      });

      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByText('Offline Transfer')).toBeInTheDocument();
      expect(screen.getByText('Upload now, recipient downloads later')).toBeInTheDocument();
    });

    it('should render offline badge', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByText('Delayed')).toBeInTheDocument();
    });

    it('should render cloud upload icon', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByTestId('icon-cloud-upload')).toBeInTheDocument();
    });

    it('should render offline feature badges', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByText(/Up to 7 days/i)).toBeInTheDocument();
      expect(screen.getByText(/E2E Encrypted/i)).toBeInTheDocument();
    });

    it('should render clock icons for expiration', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      const clocks = screen.getAllByTestId('icon-clock');
      expect(clocks.length).toBeGreaterThan(0);
    });
  });

  describe('Method Selection', () => {
    it('should open email modal when email card clicked', async () => {
      const user = userEvent.setup();
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      const emailCard = screen.getByText('Email Share').closest('[data-testid="card"]');
      await user.click(emailCard!);

      await waitFor(() => {
        expect(screen.getByTestId('share-file-modal')).toBeInTheDocument();
        expect(screen.getByText('Email Share Modal for test-file.pdf')).toBeInTheDocument();
      });
    });

    it('should open P2P modal when P2P card clicked', async () => {
      const user = userEvent.setup();
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      const p2pCard = screen.getByText('Quantum Mesh Network').closest('[data-testid="card"]');
      await user.click(p2pCard!);

      await waitFor(() => {
        expect(screen.getByTestId('p2p-share-modal')).toBeInTheDocument();
        expect(screen.getByText('P2P Modal for test-file.pdf')).toBeInTheDocument();
      });
    });

    it('should open offline modal when offline card clicked', async () => {
      const user = userEvent.setup();
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      const offlineCard = screen.getByText('Offline Transfer').closest('[data-testid="card"]');
      await user.click(offlineCard!);

      await waitFor(() => {
        expect(screen.getByTestId('offline-share-modal')).toBeInTheDocument();
        expect(screen.getByText('Offline Modal for test-file.pdf')).toBeInTheDocument();
      });
    });
  });

  describe('Modal Navigation', () => {
    it('should return to chooser when email modal closed', async () => {
      const user = userEvent.setup();
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      // Open email modal
      const emailCard = screen.getByText('Email Share').closest('[data-testid="card"]');
      await user.click(emailCard!);

      await waitFor(() => {
        expect(screen.getByTestId('share-file-modal')).toBeInTheDocument();
      });

      // Close email modal
      await user.click(screen.getByText('Close Email Modal'));

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('should return to chooser when P2P modal closed', async () => {
      const user = userEvent.setup();
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      // Open P2P modal
      const p2pCard = screen.getByText('Quantum Mesh Network').closest('[data-testid="card"]');
      await user.click(p2pCard!);

      await waitFor(() => {
        expect(screen.getByTestId('p2p-share-modal')).toBeInTheDocument();
      });

      // Close P2P modal
      await user.click(screen.getByText('Close P2P Modal'));

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('should call onClose when cancel clicked', async () => {
      const user = userEvent.setup();
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      await user.click(screen.getByText('Cancel'));

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Integration', () => {
    it('should query P2P status when modal opens', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(mockUseQuery).toHaveBeenCalled();
      const queryOptions = mockUseQuery.mock.calls[0]![1];
      expect(queryOptions.enabled).toBe(true);
    });

    it('should not query P2P when modal is closed', () => {
      render(
        <ShareChooserModal
          open={false}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      const queryOptions = mockUseQuery.mock.calls[0]![1];
      expect(queryOptions.enabled).toBe(false);
    });

    it('should render all options when P2P enabled', () => {
      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByText('Email Share')).toBeInTheDocument();
      expect(screen.getByText('Quantum Mesh Network')).toBeInTheDocument();
      expect(screen.getByText('Offline Transfer')).toBeInTheDocument();
    });

    it('should render only email when P2P disabled', () => {
      mockUseQuery.mockReturnValue({
        data: false,
        isLoading: false,
      });

      render(
        <ShareChooserModal
          open={true}
          onClose={mockOnClose}
          file={mockFile}
        />
      );

      expect(screen.getByText('Email Share')).toBeInTheDocument();
      expect(screen.getByText(/P2P sharing is currently disabled/i)).toBeInTheDocument();
      expect(screen.queryByText('Offline Transfer')).not.toBeInTheDocument();
    });
  });
});
