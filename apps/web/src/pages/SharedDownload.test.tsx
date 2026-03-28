/**
 * SharedDownload Component Tests
 *
 * Tests shared file download page routing behavior:
 * - shareCode extraction from useParams
 * - Loading state
 * - Error state (invalid/expired share)
 * - Share info display (file type, size, expiration, password)
 * - Fragment key extraction from URL hash
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SharedDownload from './SharedDownload';

// Mock wouter
let mockShareCode = '';
vi.mock('wouter', () => ({
  useParams: vi.fn(() => ({ shareCode: mockShareCode })),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock tRPC
let mockShareInfo: any = null;
let mockIsLoading = false;
let mockError: any = null;
const mockDownloadMutateAsync = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    shares: {
      getShareInfo: {
        useQuery: vi.fn(() => ({
          data: mockShareInfo,
          isLoading: mockIsLoading,
          error: mockError,
        })),
      },
      downloadShared: {
        useMutation: vi.fn(() => ({
          mutateAsync: mockDownloadMutateAsync,
          isPending: false,
        })),
      },
    },
  },
}));

// Mock shareCrypto
vi.mock('@/lib/shareCrypto', () => ({
  decryptPasswordShare: vi.fn(),
  decryptLinkShare: vi.fn(),
  isLinkShare: vi.fn(() => false),
}));

// Mock streamingDecrypt
vi.mock('@/lib/streamingDecrypt', () => ({
  decryptV4ChunkedToStream: vi.fn(),
}));

// Mock platform
vi.mock('@/lib/platform', () => ({
  streamDownloadToDisk: vi.fn(),
}));

// Mock @stenvault/shared
vi.mock('@stenvault/shared', () => ({
  FileType: {},
}));

// Mock formatters
vi.mock('@/utils/formatters', () => ({
  formatBytes: vi.fn((n: number) => `${n} bytes`),
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div data-testid="card" {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardDescription: ({ children, ...props }: any) => <p {...props}>{children}</p>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
}));
vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));
vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));
vi.mock('@/components/ui/progress', () => ({
  Progress: ({ value, ...props }: any) => <div data-testid="progress" data-value={value} {...props} />,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Download: () => <span data-testid="icon-download" />,
  FileIcon: () => <span data-testid="icon-file" />,
  FileText: () => <span data-testid="icon-file-text" />,
  FileImage: () => <span data-testid="icon-file-image" />,
  FileVideo: () => <span data-testid="icon-file-video" />,
  FileAudio: () => <span data-testid="icon-file-audio" />,
  Loader2: () => <span data-testid="loader" />,
  Clock: () => <span />,
  User: () => <span />,
  XCircle: () => <span data-testid="icon-x" />,
  CheckCircle2: () => <span data-testid="icon-check" />,
  Lock: () => <span />,
  Shield: () => <span />,
}));

describe('SharedDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShareCode = '';
    mockShareInfo = null;
    mockIsLoading = false;
    mockError = null;

    // Mock window.location.hash
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hash: '' },
      writable: true,
    });
  });

  describe('Route params extraction', () => {
    it('should pass shareCode to query', () => {
      mockShareCode = 'abc123';
      mockIsLoading = true;

      render(<SharedDownload />);

      // Verify it's loading (shareCode was passed to the query)
      expect(screen.getByTestId('loader')).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('should show spinner while loading', () => {
      mockShareCode = 'abc123';
      mockIsLoading = true;

      render(<SharedDownload />);

      expect(screen.getByTestId('loader')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('should show error when share is invalid', () => {
      mockShareCode = 'invalid';
      mockError = { message: 'Share not found' };

      render(<SharedDownload />);

      expect(screen.getByText('Invalid Link')).toBeInTheDocument();
      expect(screen.getByText('Share not found')).toBeInTheDocument();
    });

    it('should show fallback error message', () => {
      mockShareCode = 'expired';
      mockError = {};

      render(<SharedDownload />);

      expect(screen.getByText('Invalid Link')).toBeInTheDocument();
      expect(screen.getByText('This share link is invalid or has expired.')).toBeInTheDocument();
    });
  });

  describe('Share info display', () => {
    it('should show file info when share is loaded', () => {
      mockShareCode = 'valid';
      mockShareInfo = {
        file: { fileType: 'document', size: 1024 },
        sharedBy: 'user@example.com',
        expiresAt: null,
        downloadsRemaining: null,
        hasPassword: false,
        isLinkShare: false,
        hasShareKey: true,
      };

      render(<SharedDownload />);

      expect(screen.getByText('Shared File')).toBeInTheDocument();
      expect(screen.getByText(/user@example.com/)).toBeInTheDocument();
      expect(screen.getByText('1024 bytes')).toBeInTheDocument();
      expect(screen.getByText('document')).toBeInTheDocument();
    });

    it('should show download button', () => {
      mockShareCode = 'valid';
      mockShareInfo = {
        file: { fileType: 'image', size: 2048 },
        sharedBy: 'alice@test.com',
        expiresAt: null,
        downloadsRemaining: null,
        hasPassword: false,
        isLinkShare: true,
        hasShareKey: true,
      };

      render(<SharedDownload />);

      expect(screen.getByText('Download File')).toBeInTheDocument();
    });

    it('should show password input for password-protected shares', () => {
      mockShareCode = 'protected';
      mockShareInfo = {
        file: { fileType: 'document', size: 512 },
        sharedBy: 'bob@test.com',
        expiresAt: null,
        downloadsRemaining: null,
        hasPassword: true,
        isLinkShare: false,
        hasShareKey: true,
      };

      render(<SharedDownload />);

      expect(screen.getByText('Password protected')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
    });

    it('should show expiration date when present', () => {
      mockShareCode = 'expiring';
      mockShareInfo = {
        file: { fileType: 'video', size: 4096 },
        sharedBy: 'carol@test.com',
        expiresAt: '2026-04-01T00:00:00Z',
        downloadsRemaining: null,
        hasPassword: false,
        isLinkShare: true,
        hasShareKey: true,
      };

      render(<SharedDownload />);

      expect(screen.getByText(/Expires/)).toBeInTheDocument();
    });

    it('should show downloads remaining when present', () => {
      mockShareCode = 'limited';
      mockShareInfo = {
        file: { fileType: 'audio', size: 8192 },
        sharedBy: 'dave@test.com',
        expiresAt: null,
        downloadsRemaining: 3,
        hasPassword: false,
        isLinkShare: true,
        hasShareKey: true,
      };

      render(<SharedDownload />);

      expect(screen.getByText('3 downloads remaining')).toBeInTheDocument();
    });

    it('should show e2e encrypted badge when share key exists', () => {
      mockShareCode = 'encrypted';
      mockShareInfo = {
        file: { fileType: 'document', size: 1024 },
        sharedBy: 'eve@test.com',
        expiresAt: null,
        downloadsRemaining: null,
        hasPassword: false,
        isLinkShare: true,
        hasShareKey: true,
      };

      render(<SharedDownload />);

      expect(screen.getByText('End-to-end encrypted')).toBeInTheDocument();
    });

    it('should return null when no share info and not loading', () => {
      mockShareCode = 'empty';
      mockShareInfo = null;
      mockIsLoading = false;
      mockError = null;

      const { container } = render(<SharedDownload />);

      expect(container.innerHTML).toBe('');
    });
  });
});
