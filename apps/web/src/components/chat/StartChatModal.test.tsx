/**
 * StartChatModal Component Tests
 *
 * Tests the chat user search and invite modal including
 * debounced search, user results, and invite functionality.
 *
 * @updated 2026-02-03 - Migrated from chatApi to tRPC mocks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StartChatModal } from './StartChatModal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock tRPC - vi.hoisted ensures variables are available when vi.mock factory runs
const { mockUsersSearch, mockAutoInvite, mockInvalidate } = vi.hoisted(() => ({
  mockUsersSearch: vi.fn(),
  mockAutoInvite: vi.fn(),
  mockInvalidate: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    users: {
      search: {
        useQuery: vi.fn((input: any, options: any) => {
          if (!options?.enabled) return { data: undefined, isLoading: false };
          const result = mockUsersSearch(input);
          return { data: result, isLoading: false };
        }),
      },
    },
    chat: {
      autoInvite: {
        useMutation: vi.fn(() => ({
          mutate: mockAutoInvite,
          isPending: false,
        })),
      },
      getMySentInvites: {
        invalidate: mockInvalidate,
      },
    },
    useUtils: vi.fn(() => ({
      chat: {
        getMySentInvites: {
          invalidate: mockInvalidate,
        },
      },
    })),
  },
}));

// Mock UI components
vi.mock('@stenvault/shared/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <div data-testid="dialog-title">{children}</div>,
}));

vi.mock("@stenvault/shared/ui/input", () => ({
  Input: ({ value, onChange, placeholder, autoFocus, className }: any) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={className}
    />
  ),
}));

vi.mock('@stenvault/shared/ui/button', () => ({
  Button: ({ children, onClick, disabled, size }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-size={size}
      data-testid="button"
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: any) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarFallback: ({ children, className }: any) => (
    <div data-testid="avatar-fallback" className={className}>{children}</div>
  ),
}));

// Mock lucide icons
vi.mock('lucide-react', () => ({
  Search: () => <div data-testid="icon-search" />,
  Loader2: () => <div data-testid="icon-loader" />,
  UserPlus: () => <div data-testid="icon-user-plus" />,
  X: () => <div data-testid="icon-x" />,
}));

type DiscoveredUser = { id: number; email: string; name: string };

const mockUsers: DiscoveredUser[] = [
  { id: 1, email: 'john@example.com', name: 'John Doe' },
  { id: 2, email: 'jane@example.com', name: 'Jane Smith' },
  { id: 3, email: 'bob@example.com', name: 'Bob Wilson' },
];

describe('StartChatModal', () => {
  let queryClient: QueryClient;
  const mockOnOpenChange = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockUsersSearch.mockReturnValue({ users: [] });
    mockAutoInvite.mockImplementation((_input: any, options: any) => {
      if (options?.onSuccess) {
        options.onSuccess({ success: true });
      }
    });
  });

  const renderWithQuery = (props: any) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <StartChatModal {...props} />
      </QueryClientProvider>
    );
  };

  describe('Modal Rendering', () => {
    it('should not render when closed', () => {
      renderWithQuery({ open: false, onOpenChange: mockOnOpenChange });

      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('should render when open', () => {
      renderWithQuery({ open: true, onOpenChange: mockOnOpenChange });

      expect(screen.getByTestId('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    });

    it('should render title with icon', () => {
      renderWithQuery({ open: true, onOpenChange: mockOnOpenChange });

      expect(screen.getByText('Start New Chat')).toBeInTheDocument();
      expect(screen.getByTestId('icon-user-plus')).toBeInTheDocument();
    });

    it('should render search input with placeholder', () => {
      renderWithQuery({ open: true, onOpenChange: mockOnOpenChange });

      const input = screen.getByPlaceholderText('Search by name or email...');
      expect(input).toBeInTheDocument();
    });
  });

  describe('Search Input', () => {
    it('should allow typing in search input', async () => {
      const user = userEvent.setup();
      renderWithQuery({ open: true, onOpenChange: mockOnOpenChange });

      const input = screen.getByTestId('search-input');
      await user.type(input, 'john');

      expect(input).toHaveValue('john');
    });

    it('should show clear button when search has value', async () => {
      const user = userEvent.setup();
      renderWithQuery({ open: true, onOpenChange: mockOnOpenChange });

      const input = screen.getByTestId('search-input');
      await user.type(input, 'test');

      expect(screen.getByTestId('icon-x')).toBeInTheDocument();
    });

    it('should clear search when clear button clicked', async () => {
      const user = userEvent.setup();
      renderWithQuery({ open: true, onOpenChange: mockOnOpenChange });

      const input = screen.getByTestId('search-input');
      await user.type(input, 'test');
      expect(input).toHaveValue('test');

      const clearButton = screen.getByTestId('icon-x').parentElement;
      await user.click(clearButton!);

      expect(input).toHaveValue('');
    });
  });

  describe('Search States', () => {
    it('should show initial state message', () => {
      renderWithQuery({ open: true, onOpenChange: mockOnOpenChange });

      expect(
        screen.getByText('Type at least 2 characters to search for users')
      ).toBeInTheDocument();
    });
  });
});
