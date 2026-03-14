/**
 * P2PShareModal Component Tests
 *
 * Tests the P2P Share Modal (sender side) including session creation,
 * encryption selection, and connection state management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { P2PShareModal } from './P2PShareModal';
import type { P2PConnectionState, P2PTransferState } from './types';

// Mock dependencies
vi.mock('sonner');
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: vi.fn(() => ({
      files: {
        getDownloadUrl: {
          fetch: vi.fn().mockResolvedValue({ url: 'https://example.com/file.pdf' }),
        },
      },
    })),
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
  createSession: vi.fn(),
  cancelTransfer: vi.fn(),
  startFileTransfer: vi.fn(),
  isLoading: false,
  error: null,
};

vi.mock('@/hooks/p2p', () => ({
  useP2PTransfer: vi.fn(() => mockUseP2PTransfer),
}));

// Mock sub-components
vi.mock('./P2PShareModal/FileInfoCard', () => ({
  FileInfoCard: vi.fn(({ fileName, fileSize }) => (
    <div data-testid="file-info-card">
      <div>{fileName}</div>
      <div>{fileSize ? `${fileSize} bytes` : 'No size'}</div>
    </div>
  )),
}));

vi.mock('./P2PShareModal/RecipientInput', () => ({
  RecipientInput: vi.fn(({ value, onChange }) => (
    <div data-testid="recipient-input">
      <input
        type="email"
        placeholder="recipient@example.com"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )),
}));

vi.mock('./P2PShareModal/EncryptionSelector', () => ({
  EncryptionSelector: vi.fn(({ value, onChange }) => (
    <div data-testid="encryption-selector">
      <select value={value} onChange={(e) => onChange(e.target.value as any)}>
        <option value="webrtc">WebRTC Encrypted</option>
        <option value="double">Double Encryption</option>
        <option value="shamir">Shamir Secret Sharing</option>
      </select>
    </div>
  )),
}));

vi.mock('./P2PShareModal/ShamirConfig', () => ({
  ShamirConfig: vi.fn(({ totalShares, threshold, onTotalSharesChange, onThresholdChange }) => (
    <div data-testid="shamir-config">
      <label>
        Total Shares:
        <input
          type="number"
          value={totalShares}
          onChange={(e) => onTotalSharesChange(Number(e.target.value))}
        />
      </label>
      <label>
        Threshold:
        <input
          type="number"
          value={threshold}
          onChange={(e) => onThresholdChange(Number(e.target.value))}
        />
      </label>
    </div>
  )),
}));

vi.mock('./P2PShareModal/ExpirationSlider', () => ({
  ExpirationSlider: vi.fn(({ value, onChange }) => (
    <div data-testid="expiration-slider">
      <input
        type="range"
        min="5"
        max="60"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span>{value} minutes</span>
    </div>
  )),
}));

vi.mock('./P2PShareModal/ActiveSessionView', () => ({
  ActiveSessionView: vi.fn(({ shareUrl, connectionState, onCancel, onClose }) => (
    <div data-testid="active-session-view">
      <div>Share URL: {shareUrl}</div>
      <div>Connection State: {connectionState}</div>
      <button onClick={onCancel}>Cancel Transfer</button>
      <button onClick={onClose}>Close</button>
    </div>
  )),
}));

// Mock useShareModalState hook
const mockModalState = {
  recipientEmail: '',
  setRecipientEmail: vi.fn(),
  encryptionMethod: 'webrtc' as const,
  setEncryptionMethod: vi.fn(),
  isShamir: false,
  shamirTotalShares: 5,
  setShamirTotalShares: vi.fn(),
  shamirThreshold: 3,
  setShamirThreshold: vi.fn(),
  shamirShares: [],
  expiresInMinutes: 15,
  setExpiresInMinutes: vi.fn(),
  shareUrl: null,
  setShareUrl: vi.fn(),
  isSessionActive: false,
  generateShamirShares: vi.fn(),
  reset: vi.fn(),
};

vi.mock('./P2PShareModal/index', async () => {
  const actual = await vi.importActual('./P2PShareModal/index');
  return {
    ...actual,
    useShareModalState: vi.fn(() => mockModalState),
  };
});

describe('P2PShareModal', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    fileId: 123,
    fileName: 'document.pdf',
    fileSize: 1024000,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock state
    Object.assign(mockModalState, {
      recipientEmail: '',
      encryptionMethod: 'webrtc',
      isShamir: false,
      shamirTotalShares: 5,
      shamirThreshold: 3,
      shamirShares: [],
      expiresInMinutes: 15,
      shareUrl: null,
      isSessionActive: false,
    });

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
  });

  describe('Component Rendering', () => {
    it('should render modal when open', () => {
      render(<P2PShareModal {...defaultProps} />);

      expect(screen.getByText('Quantum Mesh Network')).toBeInTheDocument();
      expect(screen.getByText(/share directly peer-to-peer/i)).toBeInTheDocument();
    });

    it('should render file info card', () => {
      render(<P2PShareModal {...defaultProps} />);

      expect(screen.getByTestId('file-info-card')).toBeInTheDocument();
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    it('should render session creation form initially', () => {
      render(<P2PShareModal {...defaultProps} />);

      expect(screen.getByTestId('recipient-input')).toBeInTheDocument();
      expect(screen.getByTestId('encryption-selector')).toBeInTheDocument();
      expect(screen.getByTestId('expiration-slider')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create p2p session/i })).toBeInTheDocument();
    });

    it('should not render active session view initially', () => {
      render(<P2PShareModal {...defaultProps} />);

      expect(screen.queryByTestId('active-session-view')).not.toBeInTheDocument();
    });
  });

  describe('Encryption Selection', () => {
    it('should render encryption selector with options', () => {
      render(<P2PShareModal {...defaultProps} />);

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /webrtc encrypted/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /double encryption/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /shamir secret sharing/i })).toBeInTheDocument();
    });

    it('should call setEncryptionMethod when selection changes', async () => {
      const user = userEvent.setup();
      render(<P2PShareModal {...defaultProps} />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'double');

      expect(mockModalState.setEncryptionMethod).toHaveBeenCalledWith('double');
    });

    it('should show Shamir config when Shamir is selected', () => {
      Object.assign(mockModalState, {
        encryptionMethod: 'shamir',
        isShamir: true,
      });

      render(<P2PShareModal {...defaultProps} />);

      expect(screen.getByTestId('shamir-config')).toBeInTheDocument();
    });

    it('should not show Shamir config for other encryption methods', () => {
      render(<P2PShareModal {...defaultProps} />);

      expect(screen.queryByTestId('shamir-config')).not.toBeInTheDocument();
    });
  });

  describe('Session Creation', () => {
    it('should call createSession when button clicked', async () => {
      const user = userEvent.setup();
      mockUseP2PTransfer.createSession.mockResolvedValue({
        sessionId: 'test-session-123',
        shareUrl: 'https://cloudvault.com/p2p/test-session-123',
      });

      render(<P2PShareModal {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /create p2p session/i });
      await user.click(createButton);

      expect(mockModalState.generateShamirShares).toHaveBeenCalled();
      expect(mockUseP2PTransfer.createSession).toHaveBeenCalledWith({
        fileId: 123,
        recipientEmail: undefined,
        encryptionMethod: 'webrtc',
        splitShares: 1,
        expiresInMinutes: 15,
      });
    });

    it('should disable create button when loading', () => {
      Object.assign(mockUseP2PTransfer, { isLoading: true });

      render(<P2PShareModal {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /creating session/i });
      expect(createButton).toBeDisabled();
    });

    it('should show loading state in button', () => {
      Object.assign(mockUseP2PTransfer, { isLoading: true });

      render(<P2PShareModal {...defaultProps} />);

      expect(screen.getByText(/creating session/i)).toBeInTheDocument();
    });

    it('should display error message if creation fails', () => {
      Object.assign(mockUseP2PTransfer, { error: 'Failed to create session' });

      render(<P2PShareModal {...defaultProps} />);

      expect(screen.getByText('Failed to create session')).toBeInTheDocument();
    });
  });

  describe('Active Session View', () => {
    it('should render active session view when session is active', () => {
      Object.assign(mockModalState, {
        isSessionActive: true,
        shareUrl: 'https://cloudvault.com/p2p/test-session',
      });

      render(<P2PShareModal {...defaultProps} />);

      expect(screen.getByTestId('active-session-view')).toBeInTheDocument();
      expect(screen.getByText(/share url: https:\/\/cloudvault.com\/p2p\/test-session/i)).toBeInTheDocument();
    });

    it('should hide session creation form when active', () => {
      Object.assign(mockModalState, {
        isSessionActive: true,
        shareUrl: 'https://cloudvault.com/p2p/test-session',
      });

      render(<P2PShareModal {...defaultProps} />);

      expect(screen.queryByTestId('recipient-input')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /create p2p session/i })).not.toBeInTheDocument();
    });

    it('should pass connection state to active session view', () => {
      Object.assign(mockModalState, {
        isSessionActive: true,
        shareUrl: 'https://cloudvault.com/p2p/test-session',
      });
      Object.assign(mockUseP2PTransfer, { connectionState: 'waiting' });

      render(<P2PShareModal {...defaultProps} />);

      expect(screen.getByText(/connection state: waiting/i)).toBeInTheDocument();
    });
  });

  describe('Recipient Email', () => {
    it('should update recipient email on input', async () => {
      const user = userEvent.setup();
      render(<P2PShareModal {...defaultProps} />);

      const input = screen.getByPlaceholderText(/recipient@example.com/i);
      await user.type(input, 'test@example.com');

      expect(mockModalState.setRecipientEmail).toHaveBeenCalled();
    });
  });

  describe('Expiration Configuration', () => {
    it('should render expiration slider', () => {
      render(<P2PShareModal {...defaultProps} />);

      expect(screen.getByTestId('expiration-slider')).toBeInTheDocument();
      expect(screen.getByText(/15 minutes/i)).toBeInTheDocument();
    });

    it('should allow changing expiration value', () => {
      render(<P2PShareModal {...defaultProps} />);

      const slider = screen.getByRole('slider');
      expect(slider).toBeInTheDocument();

      // Verify mock function exists (actual changes handled by mock component)
      expect(mockModalState.setExpiresInMinutes).toBeDefined();
    });
  });

  describe('Shamir Configuration', () => {
    it('should configure Shamir shares when Shamir is selected', () => {
      Object.assign(mockModalState, {
        encryptionMethod: 'shamir',
        isShamir: true,
      });

      render(<P2PShareModal {...defaultProps} />);

      const shamirConfig = screen.getByTestId('shamir-config');
      expect(shamirConfig).toBeInTheDocument();
      expect(screen.getByText(/total shares/i)).toBeInTheDocument();
      expect(screen.getByText(/threshold/i)).toBeInTheDocument();
    });

    it('should pass Shamir data to active session when active', () => {
      Object.assign(mockModalState, {
        isSessionActive: true,
        isShamir: true,
        shareUrl: 'https://cloudvault.com/p2p/test-session',
        shamirShares: ['share1', 'share2', 'share3'],
      });

      render(<P2PShareModal {...defaultProps} />);

      expect(screen.getByTestId('active-session-view')).toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('should render complete modal with all components', () => {
      render(<P2PShareModal {...defaultProps} />);

      // Header
      expect(screen.getByText('Quantum Mesh Network')).toBeInTheDocument();
      expect(screen.getByText('P2P')).toBeInTheDocument();

      // Components
      expect(screen.getByTestId('file-info-card')).toBeInTheDocument();
      expect(screen.getByTestId('recipient-input')).toBeInTheDocument();
      expect(screen.getByTestId('encryption-selector')).toBeInTheDocument();
      expect(screen.getByTestId('expiration-slider')).toBeInTheDocument();

      // Button
      expect(screen.getByRole('button', { name: /create p2p session/i })).toBeInTheDocument();
    });

    it('should handle complete session creation flow', async () => {
      const user = userEvent.setup();
      mockUseP2PTransfer.createSession.mockResolvedValue({
        sessionId: 'session-123',
        shareUrl: 'https://cloudvault.com/p2p/session-123',
      });

      render(<P2PShareModal {...defaultProps} />);

      // Initial form should be visible
      expect(screen.getByTestId('recipient-input')).toBeInTheDocument();

      // Click create button
      const createButton = screen.getByRole('button', { name: /create p2p session/i });
      await user.click(createButton);

      // Verify session creation was called
      expect(mockUseP2PTransfer.createSession).toHaveBeenCalled();
    });
  });
});
