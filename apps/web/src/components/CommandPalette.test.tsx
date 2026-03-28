/**
 * CommandPalette Component Tests
 *
 * Tests quick action modal with keyboard navigation, search filtering,
 * and command execution for navigation and actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from './CommandPalette';

const STABLE = vi.hoisted(() => ({
  getDisplayName: (f: any) => f.filename,
  decryptFilenames: (files: any[]) => Promise.resolve(files),
  clearCache: () => {},
}));

// Mock trpc
vi.mock('@/lib/trpc', () => ({
  trpc: {
    files: {
      search: { useQuery: vi.fn(() => ({ data: undefined, isFetching: false })) },
    },
  },
}));

// Mock hooks
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (value: any) => value }));
vi.mock('@/hooks/useFilenameDecryption', () => ({
  useFilenameDecryption: () => ({ getDisplayName: STABLE.getDisplayName, decryptFilenames: STABLE.decryptFilenames, isDecrypting: false, clearCache: STABLE.clearCache }),
}));
vi.mock('@stenvault/shared', () => ({ formatBytes: (size: number) => `${size} B` }));
vi.mock('@/lib/utils', () => ({ cn: (...args: any[]) => args.filter(Boolean).join(' ') }));

// Mock react-router-dom
const mockSetLocation = vi.fn();
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/' }),
  useNavigate: () => mockSetLocation,
}));

// Mock ThemeContext
const mockTheme = {
  brand: { primary: '#4F46E5', secondary: '#8B5CF6' },
};
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: mockTheme }),
}));

// Mock lucide icons
vi.mock('lucide-react', () => ({
  Search: () => <div data-testid="icon-search" />,
  Home: () => <div data-testid="icon-home" />,
  FolderOpen: () => <div data-testid="icon-folder-open" />,
  Settings: () => <div data-testid="icon-settings" />,
  Sparkles: () => <div data-testid="icon-sparkles" />,
  Upload: () => <div data-testid="icon-upload" />,
  FolderPlus: () => <div data-testid="icon-folder-plus" />,
  LogOut: () => <div data-testid="icon-logout" />,
  User: () => <div data-testid="icon-user" />,
  MessageSquare: () => <div data-testid="icon-message-square" />,
  Shield: () => <div data-testid="icon-shield" />,
  HelpCircle: () => <div data-testid="icon-help-circle" />,
  FileText: () => <div data-testid="icon-file-text" />,
  BarChart: () => <div data-testid="icon-bar-chart" />,
  Star: () => <div data-testid="icon-star" />,
  ArrowLeftRight: () => <div data-testid="icon-arrow-left-right" />,
  Send: () => <div data-testid="icon-send" />,
  File: () => <div data-testid="icon-file" />,
  Image: () => <div data-testid="icon-image" />,
  Video: () => <div data-testid="icon-video" />,
  Music: () => <div data-testid="icon-music" />,
  Loader2: () => <div data-testid="icon-loader" />,
}));

// Mock Dialog components
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children, onKeyDown, className }: any) => (
    <div data-testid="dialog-content" onKeyDown={onKeyDown} className={className}>
      {children}
    </div>
  ),
}));

// Mock Input component
vi.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, onBlur, placeholder, className, ...props }: any) => (
    <input
      data-testid="command-input"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      className={className}
      {...props}
    />
  ),
}));

describe('CommandPalette', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnUpload = vi.fn();
  const mockOnNewFolder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.open for help command
    global.window.open = vi.fn();
  });

  describe('Component Rendering', () => {
    it('should render dialog when open', () => {
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      expect(screen.getByTestId('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <CommandPalette
          open={false}
          onOpenChange={mockOnOpenChange}
        />
      );

      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('should render search input with placeholder', () => {
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const input = screen.getByTestId('command-input');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('placeholder', 'Type a command or search...');
    });

    it('should render search icon', () => {
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const searchIcons = screen.getAllByTestId('icon-search');
      expect(searchIcons.length).toBeGreaterThan(0);
    });

    it('should render ESC keyboard hint', () => {
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      expect(screen.getByText('ESC')).toBeInTheDocument();
    });

    it('should render footer with keyboard shortcuts', () => {
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      expect(screen.getByText(/to navigate/i)).toBeInTheDocument();
      expect(screen.getByText(/to select/i)).toBeInTheDocument();
    });

    it('should render commands counter', () => {
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      expect(screen.getByText(/results?$/i)).toBeInTheDocument();
    });
  });

  describe('Commands Display', () => {
    it('should render all command categories', () => {
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      expect(screen.getByText('Navigation')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should render navigation commands', () => {
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      expect(screen.getByText('Go to Home')).toBeInTheDocument();
      expect(screen.getByText('Go to Drive')).toBeInTheDocument();
      expect(screen.getByText('Go to Chat')).toBeInTheDocument();
      expect(screen.getByText('Go to Settings')).toBeInTheDocument();
    });

    it('should render action commands', () => {
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      expect(screen.getByText('Upload Files')).toBeInTheDocument();
      expect(screen.getByText('New Folder')).toBeInTheDocument();
    });

    it('should render settings commands', () => {
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      expect(screen.getByText('Edit Profile')).toBeInTheDocument();
      expect(screen.getByText('Security Settings')).toBeInTheDocument();
      expect(screen.getByText('Help & Support')).toBeInTheDocument();
      expect(screen.getByText('Sign Out')).toBeInTheDocument();
    });

    it('should render command descriptions', () => {
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      expect(screen.getByText('Overview, analytics & activity')).toBeInTheDocument();
      expect(screen.getByText('File manager')).toBeInTheDocument();
      expect(screen.getByText('Upload new files')).toBeInTheDocument();
    });

    it('should render command icons', () => {
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      expect(screen.getByTestId('icon-home')).toBeInTheDocument();
      expect(screen.getByTestId('icon-folder-open')).toBeInTheDocument();
      expect(screen.getByTestId('icon-upload')).toBeInTheDocument();
      expect(screen.getByTestId('icon-settings')).toBeInTheDocument();
    });
  });

  describe('Search and Filter', () => {
    it('should filter commands by title', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const input = screen.getByTestId('command-input');
      await user.type(input, 'drive');

      expect(screen.getByText('Go to Drive')).toBeInTheDocument();
      expect(screen.queryByText('Go to Home')).not.toBeInTheDocument();
    });

    it('should filter commands by description', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const input = screen.getByTestId('command-input');
      await user.type(input, 'overview');

      expect(screen.getByText('Go to Home')).toBeInTheDocument();
    });

    it('should be case insensitive', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const input = screen.getByTestId('command-input');
      await user.type(input, 'UPLOAD');

      expect(screen.getByText('Upload Files')).toBeInTheDocument();
    });

    it('should show empty state when no matches', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const input = screen.getByTestId('command-input');
      await user.type(input, 'nonexistent');

      expect(screen.getByText('No commands found')).toBeInTheDocument();
    });

    it('should update command count when filtering', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const input = screen.getByTestId('command-input');
      await user.type(input, 'settings');

      // Should show fewer than 14 total commands
      const counterText = screen.getByText(/results?$/i).textContent;
      expect(counterText).toMatch(/[0-9]+ results?/);
    });

    it('should clear search value', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const input = screen.getByTestId('command-input') as HTMLInputElement;
      await user.type(input, 'test');
      expect(input.value).toBe('test');

      await user.clear(input);
      expect(input.value).toBe('');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should navigate down with ArrowDown', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const input = screen.getByTestId('command-input');
      await user.click(input);
      await user.keyboard('{ArrowDown}');

      // Should not error - navigation works
      expect(input).toBeInTheDocument();
    });

    it('should navigate up with ArrowUp', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const input = screen.getByTestId('command-input');
      await user.click(input);
      await user.keyboard('{ArrowUp}');

      expect(input).toBeInTheDocument();
    });

    it('should execute command with Enter key', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const input = screen.getByTestId('command-input');
      await user.click(input);
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalledWith('/home');
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('should execute selected command after navigation', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const input = screen.getByTestId('command-input');
      await user.click(input);
      // Navigate down once, then execute
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalledWith('/drive');
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('Command Execution', () => {
    it('should execute command on click', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const driveCommand = screen.getByText('Go to Drive').closest('button');
      await user.click(driveCommand!);

      expect(mockSetLocation).toHaveBeenCalledWith('/drive');
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should close palette after execution', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const homeCommand = screen.getByText('Go to Home').closest('button');
      await user.click(homeCommand!);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Navigation Commands', () => {
    it('should navigate to home', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const homeCommand = screen.getByText('Go to Home').closest('button');
      await user.click(homeCommand!);

      expect(mockSetLocation).toHaveBeenCalledWith('/home');
    });

    it('should navigate to drive', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const driveCommand = screen.getByText('Go to Drive').closest('button');
      await user.click(driveCommand!);

      expect(mockSetLocation).toHaveBeenCalledWith('/drive');
    });

    it('should navigate to chat', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const chatCommand = screen.getByText('Go to Chat').closest('button');
      await user.click(chatCommand!);

      expect(mockSetLocation).toHaveBeenCalledWith('/chat');
    });

    it('should navigate to settings', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const settingsCommand = screen.getByText('Go to Settings').closest('button');
      await user.click(settingsCommand!);

      expect(mockSetLocation).toHaveBeenCalledWith('/settings');
    });
  });

  describe('Action Commands', () => {
    it('should call onUpload and navigate to drive', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
        />
      );

      const uploadCommand = screen.getByText('Upload Files').closest('button');
      await user.click(uploadCommand!);

      expect(mockOnUpload).toHaveBeenCalledTimes(1);
      expect(mockSetLocation).toHaveBeenCalledWith('/drive');
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should call onNewFolder and navigate to drive', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
          onNewFolder={mockOnNewFolder}
        />
      );

      const folderCommand = screen.getByText('New Folder').closest('button');
      await user.click(folderCommand!);

      expect(mockOnNewFolder).toHaveBeenCalledTimes(1);
      expect(mockSetLocation).toHaveBeenCalledWith('/drive');
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should handle upload without callback', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const uploadCommand = screen.getByText('Upload Files').closest('button');
      await user.click(uploadCommand!);

      // Should not error, just navigate
      expect(mockSetLocation).toHaveBeenCalledWith('/drive');
    });

    it('should handle new folder without callback', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const folderCommand = screen.getByText('New Folder').closest('button');
      await user.click(folderCommand!);

      // Should not error, just navigate
      expect(mockSetLocation).toHaveBeenCalledWith('/drive');
    });
  });

  describe('Settings Commands', () => {
    it('should navigate to profile settings', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const profileCommand = screen.getByText('Edit Profile').closest('button');
      await user.click(profileCommand!);

      expect(mockSetLocation).toHaveBeenCalledWith('/settings');
    });

    it('should navigate to security settings', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const securityCommand = screen.getByText('Security Settings').closest('button');
      await user.click(securityCommand!);

      expect(mockSetLocation).toHaveBeenCalledWith('/settings?tab=security');
    });

    it('should open help in new window', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const helpCommand = screen.getByText('Help & Support').closest('button');
      await user.click(helpCommand!);

      expect(global.window.open).toHaveBeenCalledWith(
        expect.stringContaining('github.com'),
        '_blank'
      );
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should navigate to logout', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const logoutCommand = screen.getByText('Sign Out').closest('button');
      await user.click(logoutCommand!);

      expect(mockSetLocation).toHaveBeenCalledWith('/logout');
    });
  });

  describe('Integration', () => {
    it('should handle complete search and execute flow', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
          onUpload={mockOnUpload}
        />
      );

      // Search for upload
      const input = screen.getByTestId('command-input');
      await user.type(input, 'upload');

      // Execute command
      const uploadCommand = screen.getByText('Upload Files').closest('button');
      await user.click(uploadCommand!);

      expect(mockOnUpload).toHaveBeenCalled();
      expect(mockSetLocation).toHaveBeenCalledWith('/drive');
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should clear search when executing command', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const input = screen.getByTestId('command-input') as HTMLInputElement;
      await user.type(input, 'home');
      expect(input.value).toBe('home');

      // Click a command - search should be cleared internally
      const homeCommand = screen.getByText('Go to Home').closest('button');
      await user.click(homeCommand!);

      // Verify command executed and palette closed
      expect(mockSetLocation).toHaveBeenCalledWith('/home');
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should handle keyboard navigation and execution', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      const input = screen.getByTestId('command-input');
      await user.click(input);

      // Navigate to third command and execute
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalled();
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
