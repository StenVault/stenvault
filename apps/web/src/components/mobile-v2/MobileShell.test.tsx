/**
 * MobileShell Component Tests
 *
 * Tests main mobile layout wrapper with AppBar, BottomNav, and content area.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileShell } from './MobileShell';

// Mock wouter
const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/', mockSetLocation],
}));

// Mock AppBar
vi.mock('./AppBar', () => ({
  AppBar: ({ title, showMenu, onSearchClick, onAvatarClick }: any) => (
    <div data-testid="app-bar">
      {title && <span data-testid="app-bar-title">{title}</span>}
      {showMenu && <span data-testid="app-bar-menu">Menu</span>}
      <button onClick={onSearchClick} data-testid="app-bar-search">Search</button>
      <button onClick={onAvatarClick} data-testid="app-bar-avatar">Avatar</button>
    </div>
  ),
  APP_BAR_HEIGHT: 56,
}));

// Mock BottomNav
vi.mock('./BottomNav', () => ({
  BottomNav: ({ onFabClick }: any) => (
    <div data-testid="bottom-nav">
      <button onClick={onFabClick} data-testid="bottom-nav-fab">FAB</button>
    </div>
  ),
  BOTTOM_NAV_HEIGHT: 64,
}));

// Mock ActionSheet
vi.mock('./ActionSheet', () => ({
  ActionSheet: ({ open, onOpenChange, onUpload, onNewFolder }: any) => (
    open ? (
      <div data-testid="action-sheet">
        <button onClick={onUpload} data-testid="action-sheet-upload">Upload</button>
        <button onClick={onNewFolder} data-testid="action-sheet-folder">New Folder</button>
        <button onClick={() => onOpenChange(false)} data-testid="action-sheet-close">Close</button>
      </div>
    ) : null
  ),
}));

// Mock CommandPalette
vi.mock('@/components/CommandPalette', () => ({
  CommandPalette: ({ open, onOpenChange, onUpload, onNewFolder }: any) => (
    open ? (
      <div data-testid="command-palette">
        <button onClick={onUpload} data-testid="command-palette-upload">Upload</button>
        <button onClick={onNewFolder} data-testid="command-palette-folder">New Folder</button>
        <button onClick={() => onOpenChange(false)} data-testid="command-palette-close">Close</button>
      </div>
    ) : null
  ),
}));

// Mock VaultUnlockModal (uses tRPC context internally)
vi.mock('@/components/VaultUnlockModal', () => ({
  VaultUnlockModal: () => null,
}));

// Mock useMasterKey (uses tRPC context via useAuth internally)
vi.mock('@/hooks/useMasterKey', () => ({
  useMasterKey: () => ({ isUnlocked: false, clearCache: vi.fn() }),
}));

describe('MobileShell', () => {
  const mockOnUpload = vi.fn();
  const mockOnNewFolder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render mobile shell container', () => {
      const { container } = render(
        <MobileShell>
          <div>Content</div>
        </MobileShell>
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it('should render children content', () => {
      render(
        <MobileShell>
          <div data-testid="test-content">Test Content</div>
        </MobileShell>
      );

      expect(screen.getByTestId('test-content')).toBeInTheDocument();
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('should render AppBar by default', () => {
      render(
        <MobileShell>
          <div>Content</div>
        </MobileShell>
      );

      expect(screen.getByTestId('app-bar')).toBeInTheDocument();
    });

    it('should render BottomNav by default', () => {
      render(
        <MobileShell>
          <div>Content</div>
        </MobileShell>
      );

      expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
    });

    it('should render main content area', () => {
      const { container } = render(
        <MobileShell>
          <div>Content</div>
        </MobileShell>
      );

      const main = container.querySelector('main');
      expect(main).toBeInTheDocument();
    });
  });

  describe('AppBar Props', () => {
    it('should pass title to AppBar', () => {
      render(
        <MobileShell title="My Page">
          <div>Content</div>
        </MobileShell>
      );

      expect(screen.getByTestId('app-bar-title')).toHaveTextContent('My Page');
    });

    it('should show menu when showMenu is true', () => {
      render(
        <MobileShell showMenu={true}>
          <div>Content</div>
        </MobileShell>
      );

      expect(screen.getByTestId('app-bar-menu')).toBeInTheDocument();
    });

    it('should not show menu by default', () => {
      render(
        <MobileShell>
          <div>Content</div>
        </MobileShell>
      );

      expect(screen.queryByTestId('app-bar-menu')).not.toBeInTheDocument();
    });

    it('should hide AppBar when hideAppBar is true', () => {
      render(
        <MobileShell hideAppBar={true}>
          <div>Content</div>
        </MobileShell>
      );

      expect(screen.queryByTestId('app-bar')).not.toBeInTheDocument();
    });

    it('should hide BottomNav when hideBottomNav is true', () => {
      render(
        <MobileShell hideBottomNav={true}>
          <div>Content</div>
        </MobileShell>
      );

      expect(screen.queryByTestId('bottom-nav')).not.toBeInTheDocument();
    });
  });

  describe('Search Handler', () => {
    it('should open command palette on search click', async () => {
      const user = userEvent.setup();
      render(
        <MobileShell>
          <div>Content</div>
        </MobileShell>
      );

      const searchButton = screen.getByTestId('app-bar-search');
      await user.click(searchButton);

      expect(screen.getByTestId('command-palette')).toBeInTheDocument();
    });

    it('should close command palette', async () => {
      const user = userEvent.setup();
      render(
        <MobileShell>
          <div>Content</div>
        </MobileShell>
      );

      // Open
      await user.click(screen.getByTestId('app-bar-search'));
      expect(screen.getByTestId('command-palette')).toBeInTheDocument();

      // Close
      await user.click(screen.getByTestId('command-palette-close'));
      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
    });
  });

  describe('Avatar Handler', () => {
    it('should navigate to settings on avatar click', async () => {
      const user = userEvent.setup();
      render(
        <MobileShell>
          <div>Content</div>
        </MobileShell>
      );

      const avatarButton = screen.getByTestId('app-bar-avatar');
      await user.click(avatarButton);

      expect(mockSetLocation).toHaveBeenCalledWith('/settings');
    });
  });

  describe('FAB Handler', () => {
    it('should open action sheet on FAB click', async () => {
      const user = userEvent.setup();
      render(
        <MobileShell>
          <div>Content</div>
        </MobileShell>
      );

      const fabButton = screen.getByTestId('bottom-nav-fab');
      await user.click(fabButton);

      expect(screen.getByTestId('action-sheet')).toBeInTheDocument();
    });

    it('should close action sheet', async () => {
      const user = userEvent.setup();
      render(
        <MobileShell>
          <div>Content</div>
        </MobileShell>
      );

      // Open
      await user.click(screen.getByTestId('bottom-nav-fab'));
      expect(screen.getByTestId('action-sheet')).toBeInTheDocument();

      // Close
      await user.click(screen.getByTestId('action-sheet-close'));
      expect(screen.queryByTestId('action-sheet')).not.toBeInTheDocument();
    });
  });

  describe('Upload Handler', () => {
    it('should call onUpload from action sheet', async () => {
      const user = userEvent.setup();
      render(
        <MobileShell onUpload={mockOnUpload}>
          <div>Content</div>
        </MobileShell>
      );

      await user.click(screen.getByTestId('bottom-nav-fab'));
      await user.click(screen.getByTestId('action-sheet-upload'));

      expect(mockOnUpload).toHaveBeenCalledTimes(1);
    });

    it('should close action sheet after upload', async () => {
      const user = userEvent.setup();
      render(
        <MobileShell onUpload={mockOnUpload}>
          <div>Content</div>
        </MobileShell>
      );

      await user.click(screen.getByTestId('bottom-nav-fab'));
      await user.click(screen.getByTestId('action-sheet-upload'));

      expect(screen.queryByTestId('action-sheet')).not.toBeInTheDocument();
    });

    it('should call onUpload from command palette', async () => {
      const user = userEvent.setup();
      render(
        <MobileShell onUpload={mockOnUpload}>
          <div>Content</div>
        </MobileShell>
      );

      await user.click(screen.getByTestId('app-bar-search'));
      await user.click(screen.getByTestId('command-palette-upload'));

      expect(mockOnUpload).toHaveBeenCalledTimes(1);
    });
  });

  describe('New Folder Handler', () => {
    it('should call onNewFolder from action sheet', async () => {
      const user = userEvent.setup();
      render(
        <MobileShell onNewFolder={mockOnNewFolder}>
          <div>Content</div>
        </MobileShell>
      );

      await user.click(screen.getByTestId('bottom-nav-fab'));
      await user.click(screen.getByTestId('action-sheet-folder'));

      expect(mockOnNewFolder).toHaveBeenCalledTimes(1);
    });

    it('should close action sheet after new folder', async () => {
      const user = userEvent.setup();
      render(
        <MobileShell onNewFolder={mockOnNewFolder}>
          <div>Content</div>
        </MobileShell>
      );

      await user.click(screen.getByTestId('bottom-nav-fab'));
      await user.click(screen.getByTestId('action-sheet-folder'));

      expect(screen.queryByTestId('action-sheet')).not.toBeInTheDocument();
    });

    it('should call onNewFolder from command palette', async () => {
      const user = userEvent.setup();
      render(
        <MobileShell onNewFolder={mockOnNewFolder}>
          <div>Content</div>
        </MobileShell>
      );

      await user.click(screen.getByTestId('app-bar-search'));
      await user.click(screen.getByTestId('command-palette-folder'));

      expect(mockOnNewFolder).toHaveBeenCalledTimes(1);
    });
  });

  describe('Integration', () => {
    it('should handle complete action sheet flow', async () => {
      const user = userEvent.setup();
      render(
        <MobileShell onUpload={mockOnUpload} onNewFolder={mockOnNewFolder}>
          <div>Content</div>
        </MobileShell>
      );

      // Open action sheet
      await user.click(screen.getByTestId('bottom-nav-fab'));
      expect(screen.getByTestId('action-sheet')).toBeInTheDocument();

      // Upload
      await user.click(screen.getByTestId('action-sheet-upload'));
      expect(mockOnUpload).toHaveBeenCalled();
      expect(screen.queryByTestId('action-sheet')).not.toBeInTheDocument();

      // Open again for new folder
      await user.click(screen.getByTestId('bottom-nav-fab'));
      await user.click(screen.getByTestId('action-sheet-folder'));
      expect(mockOnNewFolder).toHaveBeenCalled();
    });

    it('should handle complete command palette flow', async () => {
      const user = userEvent.setup();
      render(
        <MobileShell onUpload={mockOnUpload} onNewFolder={mockOnNewFolder}>
          <div>Content</div>
        </MobileShell>
      );

      // Open command palette
      await user.click(screen.getByTestId('app-bar-search'));
      expect(screen.getByTestId('command-palette')).toBeInTheDocument();

      // Upload
      await user.click(screen.getByTestId('command-palette-upload'));
      expect(mockOnUpload).toHaveBeenCalled();
    });

    it('should render with all features', () => {
      render(
        <MobileShell
          title="Test Page"
          showMenu={true}
          onUpload={mockOnUpload}
          onNewFolder={mockOnNewFolder}
        >
          <div data-testid="page-content">Page Content</div>
        </MobileShell>
      );

      expect(screen.getByTestId('app-bar-title')).toHaveTextContent('Test Page');
      expect(screen.getByTestId('app-bar-menu')).toBeInTheDocument();
      expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
      expect(screen.getByTestId('page-content')).toBeInTheDocument();
    });

    it('should render minimal shell without bars', () => {
      render(
        <MobileShell hideAppBar={true} hideBottomNav={true}>
          <div data-testid="full-screen-content">Full Screen</div>
        </MobileShell>
      );

      expect(screen.queryByTestId('app-bar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bottom-nav')).not.toBeInTheDocument();
      expect(screen.getByTestId('full-screen-content')).toBeInTheDocument();
    });
  });
});
