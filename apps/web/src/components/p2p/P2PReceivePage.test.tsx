/**
 * P2PReceivePage Component Tests
 *
 * Tests the P2P Receive Page (recipient side) including session preview,
 * login requirement, join session, and transfer states.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { P2PReceivePage } from './P2PReceivePage';
import type { P2PConnectionState, P2PTransferState } from './types';

// Mock wouter routing
const mockParams = { sessionId: 'test-session-123' };
const mockSetLocation = vi.fn();

vi.mock('react-router-dom', () => ({
  useParams: vi.fn(() => mockParams),
  useLocation: vi.fn(() => ({ pathname: '' })),
  useNavigate: vi.fn(() => mockSetLocation),
}));

// Mock sonner
vi.mock('sonner');

// Mock tRPC
const mockSessionPreview = {
  found: true,
  expired: false,
  fileName: 'document.pdf',
  fileSize: 2048000,
  senderName: 'John Doe',
  encryptionMethod: 'webrtc' as const,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
};

const mockUser = {
  id: 1,
  email: 'user@example.com',
  name: 'Test User',
};

vi.mock('@/lib/trpc', () => ({
  trpc: {
    p2p: {
      getSessionPreview: {
        useQuery: vi.fn(() => ({
          data: mockSessionPreview,
          isLoading: false,
          error: null,
        })),
      },
    },
    auth: {
      me: {
        useQuery: vi.fn(() => ({
          data: mockUser,
        })),
      },
    },
  },
}));

// Mock useP2PTransfer hook
const mockUseP2PTransfer = {
  connectionState: 'idle' as P2PConnectionState,
  transferState: {
    status: 'idle' as P2PConnectionState,
    progress: 0,
    bytesTransferred: 0,
    totalBytes: 0,
    speed: 0,
    estimatedTimeRemaining: 0,
    isEncrypted: false,
    mode: 'stream' as const,
  } as P2PTransferState,
  joinSession: vi.fn(),
  cancelTransfer: vi.fn(),
  isLoading: false,
  error: null,
};

vi.mock('@/hooks/p2p', () => ({
  useP2PTransfer: vi.fn(() => mockUseP2PTransfer),
}));

// Mock sub-components
vi.mock('./P2PConnectionStatus', () => ({
  P2PConnectionStatus: vi.fn(({ status }) => (
    <div data-testid="connection-status">Status: {status}</div>
  )),
}));

vi.mock('./P2PTransferProgress', () => ({
  P2PTransferProgress: vi.fn(({ state, fileName, onCancel }) => (
    <div data-testid="transfer-progress">
      <div>Transfer: {fileName}</div>
      <div>Progress: {state.progress}%</div>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )),
}));

describe('P2PReceivePage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { trpc } = await import('@/lib/trpc');

    // Reset mocks to default state
    vi.mocked(trpc.p2p.getSessionPreview.useQuery).mockReturnValue({
      data: mockSessionPreview,
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(trpc.auth.me.useQuery).mockReturnValue({
      data: mockUser,
    } as any);

    Object.assign(mockUseP2PTransfer, {
      connectionState: 'idle',
      transferState: {
        status: 'idle',
        progress: 0,
        bytesTransferred: 0,
        totalBytes: 0,
        speed: 0,
        estimatedTimeRemaining: 0,
        isEncrypted: false,
        mode: 'stream',
      },
      isLoading: false,
      error: null,
    });

    mockSetLocation.mockClear();
  });

  describe('Loading State', () => {
    it('should render loading skeleton', async () => {
      const { trpc } = await import('@/lib/trpc');
      vi.mocked(trpc.p2p.getSessionPreview.useQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any);

      const { container } = render(<P2PReceivePage />);

      // Check for skeleton elements (they use a specific class)
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Session Not Found', () => {
    it('should render not found message when session does not exist', async () => {
      const { trpc } = await import('@/lib/trpc');
      vi.mocked(trpc.p2p.getSessionPreview.useQuery).mockReturnValue({
        data: { found: false, expired: false },
        isLoading: false,
        error: null,
      } as any);

      render(<P2PReceivePage />);

      expect(screen.getByText('Session Not Found')).toBeInTheDocument();
      expect(screen.getByText(/doesn't exist or has been cancelled/i)).toBeInTheDocument();
    });

    it('should show home button on not found page', async () => {
      const { trpc } = await import('@/lib/trpc');
      const user = userEvent.setup();
      vi.mocked(trpc.p2p.getSessionPreview.useQuery).mockReturnValue({
        data: { found: false, expired: false },
        isLoading: false,
        error: null,
      } as any);

      render(<P2PReceivePage />);

      const homeButton = screen.getByRole('button', { name: /go to home/i });
      expect(homeButton).toBeInTheDocument();

      await user.click(homeButton);
      expect(mockSetLocation).toHaveBeenCalledWith('/');
    });
  });

  describe('Session Expired', () => {
    it('should render expired message when session has timed out', async () => {
      const { trpc } = await import('@/lib/trpc');
      vi.mocked(trpc.p2p.getSessionPreview.useQuery).mockReturnValue({
        data: { ...mockSessionPreview, found: true, expired: true },
        isLoading: false,
        error: null,
      } as any);

      render(<P2PReceivePage />);

      expect(screen.getByText('Session Expired')).toBeInTheDocument();
      expect(screen.getByText(/has timed out/i)).toBeInTheDocument();
    });

    it('should show home button on expired page', async () => {
      const { trpc } = await import('@/lib/trpc');
      const user = userEvent.setup();
      vi.mocked(trpc.p2p.getSessionPreview.useQuery).mockReturnValue({
        data: { ...mockSessionPreview, found: true, expired: true },
        isLoading: false,
        error: null,
      } as any);

      render(<P2PReceivePage />);

      const homeButton = screen.getByRole('button', { name: /go to home/i });
      await user.click(homeButton);
      expect(mockSetLocation).toHaveBeenCalledWith('/');
    });
  });

  describe('Login Required', () => {
    it('should show login prompt when user is not authenticated', async () => {
      const { trpc } = await import('@/lib/trpc');
      vi.mocked(trpc.auth.me.useQuery).mockReturnValue({
        data: null,
      } as any);

      render(<P2PReceivePage />);

      expect(screen.getByText('Quantum Mesh Network')).toBeInTheDocument();
      expect(screen.getByText(/you need to log in to receive this file/i)).toBeInTheDocument();
    });

    it('should display file preview when not logged in', async () => {
      const { trpc } = await import('@/lib/trpc');
      vi.mocked(trpc.auth.me.useQuery).mockReturnValue({
        data: null,
      } as any);

      render(<P2PReceivePage />);

      expect(screen.getByText('document.pdf')).toBeInTheDocument();
      expect(screen.getByText(/MB/i)).toBeInTheDocument();
    });

    it('should show sender name when not logged in', async () => {
      const { trpc } = await import('@/lib/trpc');
      vi.mocked(trpc.auth.me.useQuery).mockReturnValue({
        data: null,
      } as any);

      render(<P2PReceivePage />);

      expect(screen.getByText(/from: john doe/i)).toBeInTheDocument();
    });

    it('should redirect to login when login button clicked', async () => {
      const { trpc } = await import('@/lib/trpc');
      const user = userEvent.setup();
      vi.mocked(trpc.auth.me.useQuery).mockReturnValue({
        data: null,
      } as any);

      render(<P2PReceivePage />);

      const loginButton = screen.getByRole('button', { name: /log in to receive/i });
      await user.click(loginButton);

      expect(mockSetLocation).toHaveBeenCalledWith('/auth/login?redirect=/p2p/test-session-123');
    });
  });

  describe('Main Receive UI', () => {
    it('should render file information', () => {
      render(<P2PReceivePage />);

      expect(screen.getByText('document.pdf')).toBeInTheDocument();
      expect(screen.getByText(/MB/i)).toBeInTheDocument();
    });

    it('should display sender name', () => {
      render(<P2PReceivePage />);

      expect(screen.getByText(/from: john doe/i)).toBeInTheDocument();
    });

    it('should show encryption method for WebRTC', () => {
      render(<P2PReceivePage />);

      expect(screen.getByText('WebRTC Encrypted')).toBeInTheDocument();
    });

    it('should show encryption method for double encryption', async () => {
      const { trpc } = await import('@/lib/trpc');
      vi.mocked(trpc.p2p.getSessionPreview.useQuery).mockReturnValue({
        data: { ...mockSessionPreview, encryptionMethod: 'double' },
        isLoading: false,
        error: null,
      } as any);

      render(<P2PReceivePage />);

      expect(screen.getByText(/double encryption/i)).toBeInTheDocument();
    });

    it('should render receive file button', () => {
      render(<P2PReceivePage />);

      expect(screen.getByRole('button', { name: /receive file/i })).toBeInTheDocument();
    });
  });

  describe('Join Session', () => {
    it('should call joinSession when receive button clicked', async () => {
      const user = userEvent.setup();
      mockUseP2PTransfer.joinSession.mockResolvedValue(undefined);

      render(<P2PReceivePage />);

      const receiveButton = screen.getByRole('button', { name: /receive file/i });
      await user.click(receiveButton);

      expect(mockUseP2PTransfer.joinSession).toHaveBeenCalledWith('test-session-123');
    });

    it('should show loading state when joining', () => {
      Object.assign(mockUseP2PTransfer, { isLoading: true });

      render(<P2PReceivePage />);

      expect(screen.getByText(/connecting/i)).toBeInTheDocument();
    });

    it('should disable button when joining', () => {
      Object.assign(mockUseP2PTransfer, { isLoading: true });

      render(<P2PReceivePage />);

      const button = screen.getByRole('button', { name: /connecting/i });
      expect(button).toBeDisabled();
    });

    it('should display error message if join fails', () => {
      Object.assign(mockUseP2PTransfer, { error: 'Failed to join session' });

      render(<P2PReceivePage />);

      expect(screen.getByText('Failed to join session')).toBeInTheDocument();
    });
  });

  describe('Connection States', () => {
    it('should show connection status after joining', async () => {
      const user = userEvent.setup();
      mockUseP2PTransfer.joinSession.mockResolvedValue(undefined);

      render(<P2PReceivePage />);

      const receiveButton = screen.getByRole('button', { name: /receive file/i });
      await user.click(receiveButton);

      await waitFor(() => {
        expect(screen.queryByTestId('connection-status')).toBeInTheDocument();
      });
    });

    it('should pass connection state to status component', async () => {
      const user = userEvent.setup();
      mockUseP2PTransfer.joinSession.mockResolvedValue(undefined);
      Object.assign(mockUseP2PTransfer, { connectionState: 'connecting' });

      render(<P2PReceivePage />);

      const receiveButton = screen.getByRole('button', { name: /receive file/i });
      await user.click(receiveButton);

      await waitFor(() => {
        expect(screen.getByText(/status: connecting/i)).toBeInTheDocument();
      });
    });
  });

  describe('Transfer Progress', () => {
    it('should show transfer progress when transferring', async () => {
      const user = userEvent.setup();
      mockUseP2PTransfer.joinSession.mockResolvedValue(undefined);
      Object.assign(mockUseP2PTransfer, {
        connectionState: 'transferring',
        transferState: {
          ...mockUseP2PTransfer.transferState,
          progress: 45,
        },
      });

      render(<P2PReceivePage />);

      const receiveButton = screen.getByRole('button', { name: /receive file/i });
      await user.click(receiveButton);

      await waitFor(() => {
        expect(screen.getByTestId('transfer-progress')).toBeInTheDocument();
        expect(screen.getByText(/progress: 45%/i)).toBeInTheDocument();
      });
    });

    it('should show transfer progress when completed', () => {
      Object.assign(mockUseP2PTransfer, { connectionState: 'completed' });

      render(<P2PReceivePage />);

      expect(screen.getByTestId('transfer-progress')).toBeInTheDocument();
    });

    it('should call cancelTransfer when cancel clicked in progress', async () => {
      const user = userEvent.setup();
      Object.assign(mockUseP2PTransfer, { connectionState: 'transferring' });

      render(<P2PReceivePage />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockUseP2PTransfer.cancelTransfer).toHaveBeenCalled();
    });
  });

  describe('Completion', () => {
    it('should have transfer progress component when completed', () => {
      Object.assign(mockUseP2PTransfer, { connectionState: 'completed' });

      render(<P2PReceivePage />);

      expect(screen.getByTestId('transfer-progress')).toBeInTheDocument();
    });

    it('should verify completion state exists', () => {
      Object.assign(mockUseP2PTransfer, { connectionState: 'completed' });

      render(<P2PReceivePage />);

      // Page renders without errors in completed state
      expect(screen.getByText('Quantum Mesh Network')).toBeInTheDocument();
    });
  });

  describe('Failed State', () => {
    it('should render page when transfer fails', () => {
      Object.assign(mockUseP2PTransfer, { connectionState: 'failed' });

      render(<P2PReceivePage />);

      // Page renders without errors in failed state
      expect(screen.getByText('Quantum Mesh Network')).toBeInTheDocument();
    });

    it('should verify failed state behavior', () => {
      Object.assign(mockUseP2PTransfer, {
        connectionState: 'failed',
        error: 'Connection failed',
      });

      render(<P2PReceivePage />);

      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('should render complete receive page', () => {
      render(<P2PReceivePage />);

      // Header
      expect(screen.getByText('Quantum Mesh Network')).toBeInTheDocument();
      expect(screen.getByText('P2P')).toBeInTheDocument();

      // File info
      expect(screen.getByText('document.pdf')).toBeInTheDocument();

      // Sender
      expect(screen.getByText(/from: john doe/i)).toBeInTheDocument();

      // Encryption
      expect(screen.getByText('WebRTC Encrypted')).toBeInTheDocument();

      // Button
      expect(screen.getByRole('button', { name: /receive file/i })).toBeInTheDocument();
    });

    it('should handle join session action', async () => {
      const user = userEvent.setup();
      mockUseP2PTransfer.joinSession.mockResolvedValue(undefined);

      render(<P2PReceivePage />);

      // Click receive button
      const receiveButton = screen.getByRole('button', { name: /receive file/i });
      await user.click(receiveButton);

      // Verify join was called
      expect(mockUseP2PTransfer.joinSession).toHaveBeenCalledWith('test-session-123');
    });
  });
});
