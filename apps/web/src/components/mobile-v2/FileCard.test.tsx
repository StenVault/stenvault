/**
 * FileCard Component Tests
 *
 * Tests mobile file card display with icons, menu, and long press.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileCard, type FileCardProps } from './FileCard';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onClick, style, whileTap, ...props }: any) => (
      <div onClick={onClick} style={style} {...props}>
        {children}
      </div>
    ),
    button: ({ children, onClick, style, whileTap, ...props }: any) => (
      <button onClick={onClick} style={style} {...props}>
        {children}
      </button>
    ),
  },
}));

// Mock lucide-react icons (including TimestampBadge icons)
vi.mock('lucide-react', () => ({
  FileText: () => <div data-testid="icon-filetext" />,
  Image: () => <div data-testid="icon-image" />,
  Film: () => <div data-testid="icon-film" />,
  Music: () => <div data-testid="icon-music" />,
  Folder: () => <div data-testid="icon-folder" />,
  Lock: () => <div data-testid="icon-lock" />,
  MoreHorizontal: () => <div data-testid="icon-more" />,
  // TimestampBadge icons (Clock, Check, AlertCircle, Loader2)
  Clock: () => <div data-testid="icon-clock" />,
  Check: () => <div data-testid="icon-check" />,
  AlertCircle: () => <div data-testid="icon-alert" />,
  Loader2: () => <div data-testid="icon-loader" />,
}));

// Mock ThemeContext
const mockTheme = {
  brand: { primary: '#4F46E5' },
  semantic: { warning: '#F59E0B' },
};
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: mockTheme }),
}));

// Mock haptics
vi.mock('@/lib/haptics', () => ({
  hapticTap: vi.fn(),
}));

// Mock useLongPress hook
vi.mock('@/hooks/useLongPress', () => ({
  useLongPress: ({ onLongPress, onClick }: any) => {
    return {
      onMouseDown: () => {},
      onMouseUp: onClick || (() => {}),
      onMouseLeave: () => {},
      onTouchStart: () => {},
      onTouchEnd: onClick || (() => {}),
      onTouchMove: () => {},
    };
  },
}));

// Mock shared utilities
vi.mock('@cloudvault/shared', () => ({
  FILE_TYPE_COLORS: {
    image: '#10B981',
    video: '#3B82F6',
    audio: '#8B5CF6',
    document: '#F59E0B',
    folder: '#4F46E5',
    other: '#6B7280',
  },
}));

vi.mock('@/utils/formatters', () => ({
  formatBytes: (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  },
}));

describe('FileCard', () => {
  const baseProps: FileCardProps = {
    name: 'document.pdf',
    type: 'document',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render file card', () => {
      const { container } = render(<FileCard {...baseProps} />);

      const card = container.firstChild;
      expect(card).toBeInTheDocument();
    });

    it('should display file name', () => {
      render(<FileCard {...baseProps} />);

      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    it('should display file size', () => {
      render(<FileCard {...baseProps} size={1024000} />);

      expect(screen.getByText('1000.0 KB')).toBeInTheDocument();
    });

    it('should not display size for folders', () => {
      render(<FileCard {...baseProps} type="folder" size={1024000} />);

      expect(screen.queryByText('1000.0 KB')).not.toBeInTheDocument();
    });
  });

  describe('File Type Icons', () => {
    it('should show document icon for document type', () => {
      render(<FileCard {...baseProps} type="document" />);

      expect(screen.getByTestId('icon-filetext')).toBeInTheDocument();
    });

    it('should show image icon for image type', () => {
      render(<FileCard {...baseProps} type="image" />);

      expect(screen.getByTestId('icon-image')).toBeInTheDocument();
    });

    it('should show video icon for video type', () => {
      render(<FileCard {...baseProps} type="video" />);

      expect(screen.getByTestId('icon-film')).toBeInTheDocument();
    });

    it('should show audio icon for audio type', () => {
      render(<FileCard {...baseProps} type="audio" />);

      expect(screen.getByTestId('icon-music')).toBeInTheDocument();
    });

    it('should show folder icon when type is folder', () => {
      render(<FileCard {...baseProps} type="folder" />);

      expect(screen.getByTestId('icon-folder')).toBeInTheDocument();
    });
  });

  describe('Menu Button', () => {
    it('should show menu button when onMenuClick provided', () => {
      const onMenuClick = vi.fn();
      render(<FileCard {...baseProps} onMenuClick={onMenuClick} />);

      expect(screen.getByTestId('icon-more')).toBeInTheDocument();
    });

    it('should show menu button when onLongPress provided', () => {
      const onLongPress = vi.fn();
      render(<FileCard {...baseProps} onLongPress={onLongPress} />);

      expect(screen.getByTestId('icon-more')).toBeInTheDocument();
    });

    it('should not show menu button when no handlers provided', () => {
      render(<FileCard {...baseProps} />);

      expect(screen.queryByTestId('icon-more')).not.toBeInTheDocument();
    });

    it('should call onMenuClick when menu button clicked', async () => {
      const onMenuClick = vi.fn();
      const user = userEvent.setup();
      render(<FileCard {...baseProps} onMenuClick={onMenuClick} />);

      const menuButton = screen.getByTestId('icon-more').parentElement;
      await user.click(menuButton!);

      expect(onMenuClick).toHaveBeenCalledTimes(1);
    });

    it('should call onLongPress when menu clicked and onMenuClick not provided', async () => {
      const onLongPress = vi.fn();
      const user = userEvent.setup();
      render(<FileCard {...baseProps} onLongPress={onLongPress} />);

      const menuButton = screen.getByTestId('icon-more').parentElement;
      await user.click(menuButton!);

      expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it('should prefer onMenuClick over onLongPress', async () => {
      const onMenuClick = vi.fn();
      const onLongPress = vi.fn();
      const user = userEvent.setup();
      render(<FileCard {...baseProps} onMenuClick={onMenuClick} onLongPress={onLongPress} />);

      const menuButton = screen.getByTestId('icon-more').parentElement;
      await user.click(menuButton!);

      expect(onMenuClick).toHaveBeenCalledTimes(1);
      expect(onLongPress).not.toHaveBeenCalled();
    });
  });

  describe('Click Handler', () => {
    it('should call onClick when card is clicked', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      const { container } = render(<FileCard {...baseProps} onClick={onClick} />);

      const card = container.firstChild as HTMLElement;
      await user.click(card);

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should trigger haptic feedback on click', async () => {
      const { hapticTap } = await import('@/lib/haptics');
      const onClick = vi.fn();
      const user = userEvent.setup();
      const { container } = render(<FileCard {...baseProps} onClick={onClick} />);

      const card = container.firstChild as HTMLElement;
      await user.click(card);

      expect(hapticTap).toHaveBeenCalled();
    });
  });

  describe('File Size Formatting', () => {
    it('should format bytes correctly', () => {
      render(<FileCard {...baseProps} size={500} />);

      expect(screen.getByText('500 B')).toBeInTheDocument();
    });

    it('should format kilobytes correctly', () => {
      render(<FileCard {...baseProps} size={2048} />);

      expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    });

    it('should format megabytes correctly', () => {
      render(<FileCard {...baseProps} size={5242880} />);

      expect(screen.getByText('5.0 MB')).toBeInTheDocument();
    });

    it('should not show size when not provided', () => {
      const { container } = render(<FileCard {...baseProps} />);

      // Check that only one paragraph exists (name only)
      const paragraphs = container.querySelectorAll('p');
      expect(paragraphs.length).toBe(1);
    });
  });

  describe('Integration', () => {
    it('should render file with all features', () => {
      const onClick = vi.fn();
      const onMenuClick = vi.fn();
      render(
        <FileCard
          {...baseProps}
          name="secret.pdf"
          type="document"
          size={1024000}
          onClick={onClick}
          onMenuClick={onMenuClick}
        />
      );

      expect(screen.getByText('secret.pdf')).toBeInTheDocument();
      expect(screen.getByTestId('icon-filetext')).toBeInTheDocument();
      expect(screen.getByText('1000.0 KB')).toBeInTheDocument();
      expect(screen.getByTestId('icon-more')).toBeInTheDocument();
    });

    it('should render folder without size', () => {
      render(
        <FileCard
          {...baseProps}
          name="My Folder"
          type="folder"
          size={1024000}
        />
      );

      expect(screen.getByText('My Folder')).toBeInTheDocument();
      expect(screen.getByTestId('icon-folder')).toBeInTheDocument();
      expect(screen.queryByText('1000.0 KB')).not.toBeInTheDocument();
    });

    it('should handle image file correctly', () => {
      render(
        <FileCard
          {...baseProps}
          name="photo.jpg"
          type="image"
          size={2048000}
        />
      );

      expect(screen.getByText('photo.jpg')).toBeInTheDocument();
      expect(screen.getByTestId('icon-image')).toBeInTheDocument();
      expect(screen.getByText('2.0 MB')).toBeInTheDocument();
    });

    it('should handle video file correctly', () => {
      render(
        <FileCard
          {...baseProps}
          name="video.mp4"
          type="video"
          size={10485760}
        />
      );

      expect(screen.getByText('video.mp4')).toBeInTheDocument();
      expect(screen.getByTestId('icon-film')).toBeInTheDocument();
      expect(screen.getByText('10.0 MB')).toBeInTheDocument();
    });
  });
});
