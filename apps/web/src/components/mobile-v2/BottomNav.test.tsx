/**
 * BottomNav Component Tests
 *
 * Tests mobile bottom navigation bar with 5 tabs and FAB button.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottomNav } from './BottomNav';

// Mock react-router-dom
const mockSetLocation = vi.fn();
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/' }),
  useNavigate: () => mockSetLocation,
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    button: ({ children, onClick, style, whileTap, ...props }: any) => (
      <button onClick={onClick} style={style} {...props}>
        {children}
      </button>
    ),
  },
}));

// Mock vaul Drawer - Portal only renders when Root is open
let drawerOpen = false;
vi.mock('vaul', () => ({
  Drawer: {
    Root: ({ children, open }: any) => {
      drawerOpen = open;
      return <>{children}</>;
    },
    Portal: ({ children }: any) => drawerOpen ? <div data-testid="drawer-portal">{children}</div> : null,
    Overlay: (props: any) => <div data-testid="drawer-overlay" {...props} />,
    Content: ({ children, ...props }: any) => <div data-testid="drawer-content" {...props}>{children}</div>,
    Title: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Home: () => <div data-testid="icon-home" />,
  HardDrive: () => <div data-testid="icon-harddrive" />,
  Plus: () => <div data-testid="icon-plus" />,
  MessageCircle: () => <div data-testid="icon-message" />,
  MoreHorizontal: () => <div data-testid="icon-more" />,
  Trash2: () => <div data-testid="icon-trash" />,
  Share2: () => <div data-testid="icon-share" />,
  Send: () => <div data-testid="icon-send" />,
  Star: () => <div data-testid="icon-star" />,
  Settings: () => <div data-testid="icon-settings" />,
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
  hapticMedium: vi.fn(),
}));

// Mock constants
vi.mock('./constants', () => ({
  BOTTOM_NAV_HEIGHT: 64,
  FAB_SIZE: 56,
}));

describe('BottomNav', () => {
  const mockOnFabClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render navigation bar', () => {
      const { container } = render(<BottomNav onFabClick={mockOnFabClick} />);

      const nav = container.querySelector('nav');
      expect(nav).toBeInTheDocument();
    });

    it('should render all 5 navigation items', () => {
      render(<BottomNav onFabClick={mockOnFabClick} />);

      expect(screen.getByTestId('icon-home')).toBeInTheDocument();
      expect(screen.getByTestId('icon-harddrive')).toBeInTheDocument();
      expect(screen.getByTestId('icon-plus')).toBeInTheDocument();
      expect(screen.getByTestId('icon-message')).toBeInTheDocument();
      expect(screen.getByTestId('icon-more')).toBeInTheDocument();
    });

    it('should render navigation labels', () => {
      render(<BottomNav onFabClick={mockOnFabClick} />);

      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Drive')).toBeInTheDocument();
      // FAB button only has icon, no visible text label
      expect(screen.getByText('Chat')).toBeInTheDocument();
      expect(screen.getByText('More')).toBeInTheDocument();
    });

    it('should have correct aria-labels', () => {
      render(<BottomNav onFabClick={mockOnFabClick} />);

      expect(screen.getByLabelText('Home')).toBeInTheDocument();
      expect(screen.getByLabelText('Drive')).toBeInTheDocument();
      expect(screen.getByLabelText('Add')).toBeInTheDocument();
      expect(screen.getByLabelText('Chat')).toBeInTheDocument();
      expect(screen.getByLabelText('More')).toBeInTheDocument();
    });

    it('should be fixed at bottom', () => {
      const { container } = render(<BottomNav onFabClick={mockOnFabClick} />);

      const nav = container.querySelector('nav');
      expect(nav).toHaveStyle({ position: 'fixed', bottom: '0' });
    });
  });

  describe('Navigation Actions', () => {
    it('should navigate to home on Home click', async () => {
      const user = userEvent.setup();
      render(<BottomNav onFabClick={mockOnFabClick} />);

      const homeButton = screen.getByLabelText('Home');
      await user.click(homeButton);

      expect(mockSetLocation).toHaveBeenCalledWith('/home');
    });

    it('should navigate to drive on Drive click', async () => {
      const user = userEvent.setup();
      render(<BottomNav onFabClick={mockOnFabClick} />);

      const driveButton = screen.getByLabelText('Drive');
      await user.click(driveButton);

      expect(mockSetLocation).toHaveBeenCalledWith('/drive');
    });

    it('should navigate to chat on Chat click', async () => {
      const user = userEvent.setup();
      render(<BottomNav onFabClick={mockOnFabClick} />);

      const chatButton = screen.getByLabelText('Chat');
      await user.click(chatButton);

      expect(mockSetLocation).toHaveBeenCalledWith('/chat');
    });

    it('should open More drawer on More click', async () => {
      const user = userEvent.setup();
      render(<BottomNav onFabClick={mockOnFabClick} />);

      const moreButton = screen.getByLabelText('More');
      await user.click(moreButton);

      // More opens a drawer, does not navigate directly
      expect(mockSetLocation).not.toHaveBeenCalled();
    });
  });

  describe('FAB Button', () => {
    it('should call onFabClick when FAB is clicked', async () => {
      const user = userEvent.setup();
      render(<BottomNav onFabClick={mockOnFabClick} />);

      const fabButton = screen.getByLabelText('Add');
      await user.click(fabButton);

      expect(mockOnFabClick).toHaveBeenCalledTimes(1);
    });

    it('should not navigate when FAB is clicked', async () => {
      const user = userEvent.setup();
      render(<BottomNav onFabClick={mockOnFabClick} />);

      const fabButton = screen.getByLabelText('Add');
      await user.click(fabButton);

      expect(mockSetLocation).not.toHaveBeenCalled();
    });

    it('should work when onFabClick is not provided', async () => {
      const user = userEvent.setup();
      render(<BottomNav />);

      const fabButton = screen.getByLabelText('Add');
      await user.click(fabButton);

      // Should not throw error
      expect(mockSetLocation).not.toHaveBeenCalled();
    });
  });

  describe('Active State', () => {
    it('should show home as active on / path', () => {
      render(<BottomNav onFabClick={mockOnFabClick} />);

      const homeButton = screen.getByLabelText('Home');
      expect(homeButton).toHaveAttribute('aria-current', 'page');
    });

    it('should not show active state for FAB', () => {
      render(<BottomNav onFabClick={mockOnFabClick} />);

      const fabButton = screen.getByLabelText('Add');
      expect(fabButton).not.toHaveAttribute('aria-current');
    });
  });

  describe('Haptic Feedback', () => {
    it('should trigger haptic feedback on nav click', async () => {
      const { hapticTap } = await import('@/lib/haptics');
      const user = userEvent.setup();
      render(<BottomNav onFabClick={mockOnFabClick} />);

      const homeButton = screen.getByLabelText('Home');
      await user.click(homeButton);

      expect(hapticTap).toHaveBeenCalled();
    });

    it('should trigger medium haptic on FAB click', async () => {
      const { hapticMedium } = await import('@/lib/haptics');
      const user = userEvent.setup();
      render(<BottomNav onFabClick={mockOnFabClick} />);

      const fabButton = screen.getByLabelText('Add');
      await user.click(fabButton);

      expect(hapticMedium).toHaveBeenCalled();
    });
  });

  describe('Integration', () => {
    it('should handle complete navigation flow', async () => {
      const user = userEvent.setup();
      render(<BottomNav onFabClick={mockOnFabClick} />);

      // Navigate to different tabs
      await user.click(screen.getByLabelText('Drive'));
      expect(mockSetLocation).toHaveBeenCalledWith('/drive');

      await user.click(screen.getByLabelText('Chat'));
      expect(mockSetLocation).toHaveBeenCalledWith('/chat');

      // More opens drawer instead of navigating
      await user.click(screen.getByLabelText('More'));
      expect(mockSetLocation).toHaveBeenCalledTimes(2); // Only Drive + Chat

      // Click FAB
      await user.click(screen.getByLabelText('Add'));
      expect(mockOnFabClick).toHaveBeenCalled();
    });
  });
});
