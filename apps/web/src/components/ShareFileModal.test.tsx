/**
 * ShareFileModal Component Tests
 *
 * Tests email share modal with share mode toggle (password/link),
 * expiration, max downloads, and crypto integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareFileModal } from './ShareFileModal';

/** Helper to find the Share button in the dialog footer (avoids matching "Share File" title) */
function getShareButton() {
  const footer = screen.getByTestId('dialog-footer');
  return within(footer).getByText('Share').closest('button')!;
}

// Mock tRPC
const mockMutate = vi.fn();
const mockMutateAsync = vi.fn();
const mockUseMutation = vi.fn();
const mockFetchDownloadUrl = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    shares: {
      createShare: {
        useMutation: (options: any) => mockUseMutation(options),
      },
    },
    stripe: {
      getSubscription: {
        useQuery: () => ({
          data: {
            isAdmin: false,
            features: {
              sharePasswordProtection: true,
              shareCustomExpiry: true,
              shareDownloadLimits: true,
            },
          },
        }),
      },
    },
    useUtils: () => ({
      files: {
        getDownloadUrl: {
          fetch: mockFetchDownloadUrl,
        },
      },
    }),
  },
}));

// Mock useMasterKey
const mockDeriveFileKeyWithBytes = vi.fn();
const mockGetUnlockedHybridSecretKey = vi.fn();
vi.mock('@/hooks/useMasterKey', () => ({
  useMasterKey: () => ({
    isUnlocked: true,
    deriveFileKeyWithBytes: mockDeriveFileKeyWithBytes,
    getUnlockedHybridSecretKey: mockGetUnlockedHybridSecretKey,
  }),
}));

// Mock shareCrypto
const mockCreatePasswordShare = vi.fn();
const mockCreateLinkShare = vi.fn();
vi.mock('@/lib/shareCrypto', () => ({
  createPasswordShare: (...args: any[]) => mockCreatePasswordShare(...args),
  createLinkShare: (...args: any[]) => mockCreateLinkShare(...args),
}));

// Mock hybridFileCrypto
const mockExtractV4FileKey = vi.fn();
vi.mock('@/lib/hybridFileCrypto', () => ({
  extractV4FileKey: (...args: any[]) => mockExtractV4FileKey(...args),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/' }),
  useNavigate: () => vi.fn(),
}));

// Mock ThemeContext
const mockTheme = {
  brand: { primary: '#4F46E5' },
  semantic: { success: '#10b981' },
};
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: mockTheme }),
}));

// Mock copyToClipboard utility
const { mockCopyToClipboard } = vi.hoisted(() => {
  return { mockCopyToClipboard: vi.fn().mockResolvedValue(true) };
});

vi.mock('@/lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils')>();
  return {
    ...actual,
    copyToClipboard: mockCopyToClipboard,
  };
});

// Mock Dialog components
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div data-testid="dialog-title">{children}</div>,
  DialogDescription: ({ children }: any) => <div data-testid="dialog-description">{children}</div>,
  DialogFooter: ({ children }: any) => <div data-testid="dialog-footer">{children}</div>,
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size, className }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} data-size={size} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, type, placeholder, className, id, minLength, readOnly, ...props }: any) => (
    <input
      data-testid={id || `input-${type}`}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      id={id}
      minLength={minLength}
      readOnly={readOnly}
      {...props}
    />
  ),
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor, className }: any) => (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ),
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, id }: any) => (
    <input
      data-testid={`switch-${id}`}
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      id={id}
    />
  ),
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select" data-value={value}>
      {children}
      <select
        data-testid="select-input"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        <option value="1h">1 hour</option>
        <option value="24h">24 hours</option>
        <option value="7d">7 days</option>
        <option value="30d">30 days</option>
        <option value="never">Never</option>
      </select>
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
}));

// Mock lucide icons
vi.mock('lucide-react', () => ({
  Mail: () => <div data-testid="icon-mail" />,
  Clock: () => <div data-testid="icon-clock" />,
  Download: () => <div data-testid="icon-download" />,
  Lock: () => <div data-testid="icon-lock" />,
  Loader2: () => <div data-testid="icon-loader" />,
  Send: () => <div data-testid="icon-send" />,
  CheckCircle2: () => <div data-testid="icon-check-circle" />,
  Copy: () => <div data-testid="icon-copy" />,
  Link2: () => <div data-testid="icon-link2" />,
}));

describe('ShareFileModal', () => {
  const mockOnClose = vi.fn();
  const mockFile = {
    id: 1,
    filename: 'test-document.pdf',
    encryptionVersion: 4,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    encryptionSalt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for deriveFileKeyWithBytes
    mockDeriveFileKeyWithBytes.mockResolvedValue({
      keyBytes: new Uint8Array(32),
      zeroBytes: vi.fn(),
    });

    // Default mock for getUnlockedHybridSecretKey
    mockGetUnlockedHybridSecretKey.mockResolvedValue({ classical: new Uint8Array(32), postQuantum: new Uint8Array(2400) });

    // Default mock for extractV4FileKey
    mockExtractV4FileKey.mockResolvedValue({
      fileKeyBytes: new Uint8Array(32),
      zeroBytes: vi.fn(),
    });

    // Default mock for getDownloadUrl fetch
    mockFetchDownloadUrl.mockResolvedValue({
      url: 'https://r2.example.com/presigned-url',
    });

    // Default mock for createPasswordShare
    mockCreatePasswordShare.mockResolvedValue({
      encryptedShareKey: 'encrypted-key-base64',
      shareKeyIv: 'iv-base64',
      shareKeySalt: 'salt-base64',
    });

    // Default mock for createLinkShare
    mockCreateLinkShare.mockResolvedValue({
      encrypted: {
        encryptedShareKey: 'encrypted-key-base64',
        shareKeyIv: 'iv-base64',
        shareKeySalt: 'url-fragment',
      },
      fragmentKey: 'test-fragment-key',
    });

    // Default mock for mutation
    mockMutateAsync.mockResolvedValue({
      downloadLink: 'https://example.com/s/default123',
      expiresAt: new Date('2026-01-31'),
    });

    mockUseMutation.mockImplementation((options: any) => {
      return {
        mutate: mockMutate,
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      };
    });
  });

  describe('Component Rendering', () => {
    it('should render dialog when open with file', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });

    it('should not render when file is null', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={null} />
      );
      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('should render title with file name', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );
      expect(screen.getByText('Share File')).toBeInTheDocument();
      expect(screen.getByText(/test-document.pdf/i)).toBeInTheDocument();
    });

    it('should render mail icon', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );
      expect(screen.getByTestId('icon-mail')).toBeInTheDocument();
    });

    it('should render email input', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );
      expect(screen.getByTestId('email')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('example@email.com')).toBeInTheDocument();
    });

    it('should render share mode toggle buttons', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );
      expect(screen.getByText('Password')).toBeInTheDocument();
      expect(screen.getByText('Link only')).toBeInTheDocument();
    });

    it('should render expiration selector', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );
      expect(screen.getByText('Link expiration')).toBeInTheDocument();
      expect(screen.getByTestId('select-input')).toBeInTheDocument();
    });

    it('should render max downloads toggle', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );
      expect(screen.getByText('Limit downloads')).toBeInTheDocument();
      expect(screen.getByTestId('icon-download')).toBeInTheDocument();
    });

    it('should render share password input in password mode', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );
      expect(screen.getByText('Share password')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Password \(min 8 characters\)/i)).toBeInTheDocument();
    });

    it('should render info box for password mode', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );
      expect(screen.getByText(/recipient needs the password/i)).toBeInTheDocument();
    });

    it('should render cancel and share buttons', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(getShareButton()).toBeInTheDocument();
    });
  });

  describe('Share Mode Toggle', () => {
    it('should default to password mode', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );
      // Password button should be active (default variant), password input visible
      expect(screen.getByPlaceholderText(/Password \(min 8 characters\)/i)).toBeInTheDocument();
    });

    it('should switch to link mode and hide password input', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      await user.click(screen.getByText('Link only'));
      expect(screen.queryByPlaceholderText(/Password \(min 8 characters\)/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Anyone with the link/i)).toBeInTheDocument();
    });

    it('should switch back to password mode', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      await user.click(screen.getByText('Link only'));
      await user.click(screen.getByText('Password'));

      expect(screen.getByPlaceholderText(/Password \(min 8 characters\)/i)).toBeInTheDocument();
    });
  });

  describe('Form Inputs', () => {
    it('should update email input', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      const emailInput = screen.getByTestId('email') as HTMLInputElement;
      await user.type(emailInput, 'test@example.com');
      expect(emailInput.value).toBe('test@example.com');
    });

    it('should change expiration value', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      const select = screen.getByTestId('select-input') as HTMLSelectElement;
      await user.selectOptions(select, '24h');
      expect(select.value).toBe('24h');
    });

    it('should default expiration to 7d', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      const select = screen.getByTestId('select') as HTMLElement;
      expect(select.dataset.value).toBe('7d');
    });
  });

  describe('Max Downloads', () => {
    it('should toggle max downloads', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      const downloadLabel = screen.getByText('Limit downloads');
      const toggle = downloadLabel.parentElement?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(toggle.checked).toBe(false);
      await user.click(toggle);
      expect(toggle.checked).toBe(true);
    });

    it('should show max downloads input when enabled', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      const downloadLabel = screen.getByText('Limit downloads');
      const toggle = downloadLabel.parentElement?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      await user.click(toggle);

      const numberInput = screen.getByDisplayValue('10');
      expect(numberInput).toBeInTheDocument();
    });

    it('should update max downloads value', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      const downloadLabel = screen.getByText('Limit downloads');
      const toggle = downloadLabel.parentElement?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      await user.click(toggle);

      const numberInput = screen.getByDisplayValue('10') as HTMLInputElement;
      await user.clear(numberInput);
      await user.type(numberInput, '5');
      expect(numberInput.value).toBe('5');
    });
  });

  describe('Password Input', () => {
    it('should show password input in password mode by default', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );
      expect(screen.getByPlaceholderText(/Password \(min 8 characters\)/i)).toBeInTheDocument();
    });

    it('should update password value', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      const passwordInput = screen.getByPlaceholderText(/Password \(min 8 characters\)/i) as HTMLInputElement;
      await user.type(passwordInput, 'test1234');
      expect(passwordInput.value).toBe('test1234');
    });
  });

  describe('Form Validation', () => {
    it('should disable share button when password is too short in password mode', () => {
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      const shareButton = getShareButton();
      expect(shareButton).toBeDisabled();
    });

    it('should enable share button when password has 8+ chars', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      const passwordInput = screen.getByPlaceholderText(/Password \(min 8 characters\)/i);
      await user.type(passwordInput, 'testpass');

      const shareButton = getShareButton();
      expect(shareButton).not.toBeDisabled();
    });

    it('should enable share button in link mode without password', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      await user.click(screen.getByText('Link only'));

      const shareButton = getShareButton();
      expect(shareButton).not.toBeDisabled();
    });
  });

  describe('Share Functionality', () => {
    it('should call createPasswordShare and mutation on share (password mode)', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      // Type password
      await user.type(screen.getByPlaceholderText(/Password \(min 8 characters\)/i), 'test1234');
      // Type email
      await user.type(screen.getByTestId('email'), 'test@example.com');

      // Click share
      await user.click(getShareButton());

      await waitFor(() => {
        expect(mockGetUnlockedHybridSecretKey).toHaveBeenCalled();
        expect(mockFetchDownloadUrl).toHaveBeenCalledWith({ fileId: 1 });
        expect(mockExtractV4FileKey).toHaveBeenCalled();
        expect(mockCreatePasswordShare).toHaveBeenCalled();
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            fileId: 1,
            recipientEmail: 'test@example.com',
            encryptedShareKey: 'encrypted-key-base64',
            shareKeyIv: 'iv-base64',
            shareKeySalt: 'salt-base64',
            displayFilename: 'test-document.pdf',
          })
        );
      });
    });

    it('should call createLinkShare in link mode', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      await user.click(screen.getByText('Link only'));
      await user.click(getShareButton());

      await waitFor(() => {
        expect(mockCreateLinkShare).toHaveBeenCalled();
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            shareKeySalt: 'url-fragment',
          })
        );
      });
    });

    it('should append fragment key to link in link mode', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      await user.click(screen.getByText('Link only'));
      await user.click(getShareButton());

      await waitFor(() => {
        const linkInput = screen.getByDisplayValue('https://example.com/s/default123#key=test-fragment-key');
        expect(linkInput).toBeInTheDocument();
      });
    });

    it('should show success state after sharing', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      await user.type(screen.getByPlaceholderText(/Password \(min 8 characters\)/i), 'test1234');
      await user.type(screen.getByTestId('email'), 'test@example.com');
      await user.click(getShareButton());

      await waitFor(() => {
        expect(screen.getByText('Email sent successfully!')).toBeInTheDocument();
        expect(screen.getByTestId('icon-check-circle')).toBeInTheDocument();
      });
    });

    it('should show "Share link created!" when no email provided', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      await user.click(screen.getByText('Link only'));
      await user.click(getShareButton());

      await waitFor(() => {
        expect(screen.getByText('Share link created!')).toBeInTheDocument();
      });
    });

    it('should show version gate toast for unsupported encryption versions', async () => {
      const { toast } = await import('sonner');
      const user = userEvent.setup();
      const unsupportedFile = { ...mockFile, encryptionVersion: 5 };

      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={unsupportedFile} />
      );

      await user.type(screen.getByPlaceholderText(/Password \(min 8 characters\)/i), 'test1234');
      await user.click(getShareButton());

      expect(toast.error).toHaveBeenCalledWith('Sharing is not yet supported for this encryption version');
    });

    it('should show version gate toast for null encryption version', async () => {
      const { toast } = await import('sonner');
      const user = userEvent.setup();
      const nullVersionFile = { ...mockFile, encryptionVersion: null };

      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={nullVersionFile} />
      );

      await user.type(screen.getByPlaceholderText(/Password \(min 8 characters\)/i), 'test1234');
      await user.click(getShareButton());

      expect(toast.error).toHaveBeenCalledWith('Sharing is not yet supported for this encryption version');
    });

    it('should handle V4 file sharing with password mode', async () => {
      const user = userEvent.setup();
      const v4File = { ...mockFile, encryptionVersion: 4 };

      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={v4File} />
      );

      await user.type(screen.getByPlaceholderText(/Password \(min 8 characters\)/i), 'test1234');
      await user.click(getShareButton());

      await waitFor(() => {
        expect(mockGetUnlockedHybridSecretKey).toHaveBeenCalled();
        expect(mockFetchDownloadUrl).toHaveBeenCalledWith({ fileId: 1 });
        expect(mockExtractV4FileKey).toHaveBeenCalled();
        expect(mockCreatePasswordShare).toHaveBeenCalled();
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            fileId: 1,
            encryptedShareKey: 'encrypted-key-base64',
          })
        );
      });
    });

    it('should handle V4 file sharing with link mode', async () => {
      const user = userEvent.setup();
      const v4File = { ...mockFile, encryptionVersion: 4 };

      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={v4File} />
      );

      await user.click(screen.getByText('Link only'));
      await user.click(getShareButton());

      await waitFor(() => {
        expect(mockExtractV4FileKey).toHaveBeenCalled();
        expect(mockCreateLinkShare).toHaveBeenCalled();
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            shareKeySalt: 'url-fragment',
          })
        );
      });
    });

    it('should show error when hybrid keys not available for V4', async () => {
      const { toast } = await import('sonner');
      const user = userEvent.setup();
      const v4File = { ...mockFile, encryptionVersion: 4 };
      mockGetUnlockedHybridSecretKey.mockResolvedValue(null);

      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={v4File} />
      );

      await user.type(screen.getByPlaceholderText(/Password \(min 8 characters\)/i), 'test1234');
      await user.click(getShareButton());

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Hybrid keys not available. Cannot share files.');
      });
    });
  });

  describe('Clipboard Functionality', () => {
    beforeEach(() => {
      mockCopyToClipboard.mockClear();
      mockCopyToClipboard.mockResolvedValue(true);
    });

    it('should copy link to clipboard', async () => {
      const user = userEvent.setup();
      const { toast } = await import('sonner');

      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      await user.type(screen.getByPlaceholderText(/Password \(min 8 characters\)/i), 'test1234');
      await user.type(screen.getByTestId('email'), 'test@example.com');
      await user.click(getShareButton());

      await waitFor(() => {
        expect(screen.getByTestId('icon-copy')).toBeInTheDocument();
      });

      const copyButton = screen.getByTestId('icon-copy').closest('button');
      await user.click(copyButton!);

      await waitFor(() => {
        expect(mockCopyToClipboard).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalledWith('Link copied!');
      });
    });
  });

  describe('Integration', () => {
    it('should handle complete share flow', async () => {
      const user = userEvent.setup();
      const { toast } = await import('sonner');

      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      // Fill email
      await user.type(screen.getByTestId('email'), 'recipient@example.com');

      // Type password
      await user.type(screen.getByPlaceholderText(/Password \(min 8 characters\)/i), 'secretpass');

      // Change expiration
      await user.selectOptions(screen.getByTestId('select-input'), '24h');

      // Enable and set max downloads
      const downloadLabel = screen.getByText('Limit downloads');
      const maxDownloadsToggle = downloadLabel.parentElement?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      await user.click(maxDownloadsToggle);
      const maxDownloadsInput = screen.getByDisplayValue('10') as HTMLInputElement;
      await user.clear(maxDownloadsInput);
      await user.type(maxDownloadsInput, '3');

      // Share
      await user.click(getShareButton());

      // Verify mutation
      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            fileId: 1,
            recipientEmail: 'recipient@example.com',
            expiration: '24h',
            maxDownloads: 3,
            password: 'secretpass',
            encryptedShareKey: 'encrypted-key-base64',
            displayFilename: 'test-document.pdf',
          })
        );
      });

      // Verify success
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('File shared successfully!');
        expect(screen.getByText('Email sent successfully!')).toBeInTheDocument();
      });
    });

    it('should close and reset on cancel', async () => {
      const user = userEvent.setup();
      render(
        <ShareFileModal open={true} onClose={mockOnClose} file={mockFile} />
      );

      await user.type(screen.getByTestId('email'), 'test@example.com');
      await user.click(screen.getByText('Cancel'));
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
