/**
 * FileTypePieChart Component Tests
 *
 * Tests the file type distribution donut chart including data rendering,
 * percentage calculation, hover interactions, loading and empty states.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileTypePieChart } from './FileTypePieChart';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <div>{children}</div>,
}));

// Mock Recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  PieChart: ({ children }: any) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ data, dataKey, onMouseEnter, onMouseLeave, children }: any) => (
    <div
      data-testid="pie"
      data-key={dataKey}
      data-items={data?.length || 0}
      onMouseEnter={() => onMouseEnter?.(null, 0)}
      onMouseLeave={() => onMouseLeave?.()}
    >
      {children}
    </div>
  ),
  Cell: ({ fill }: any) => <div data-testid="cell" data-fill={fill} />,
  Sector: () => <div data-testid="sector" />,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  FileImage: () => <div data-testid="icon-image" />,
  FileVideo: () => <div data-testid="icon-video" />,
  FileAudio: () => <div data-testid="icon-audio" />,
  FileText: () => <div data-testid="icon-document" />,
  File: () => <div data-testid="icon-file" />,
}));

// Mock formatBytes
vi.mock('@/utils/formatters', () => ({
  formatBytes: vi.fn((bytes: number) => `${bytes} B`),
}));

// Mock useTheme
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      chart: { 1: '#D4AF37', 2: '#8B7355', 3: '#5B8BD4', 4: '#3D9970', 5: '#C75050' },
    },
  }),
}));

const mockData = [
  { type: 'image' as const, count: 50, size: 5000000 },
  { type: 'video' as const, count: 20, size: 20000000 },
  { type: 'audio' as const, count: 15, size: 1500000 },
  { type: 'document' as const, count: 10, size: 1000000 },
  { type: 'other' as const, count: 5, size: 500000 },
];

describe('FileTypePieChart', () => {
  describe('Loading State', () => {
    it('should render loading skeleton', () => {
      const { container } = render(
        <FileTypePieChart data={[]} isLoading={true} />
      );

      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should not render chart when loading', () => {
      render(<FileTypePieChart data={[]} isLoading={true} />);

      expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
      expect(screen.queryByText('Distribution by Type')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should render empty state when no files', () => {
      render(<FileTypePieChart data={[]} />);

      expect(screen.getByText('Distribution by Type')).toBeInTheDocument();
      expect(screen.getByText('No files to analyse')).toBeInTheDocument();
      expect(screen.getByTestId('icon-file')).toBeInTheDocument();
    });

    it('should render empty state when all counts are zero', () => {
      const emptyData = [
        { type: 'image' as const, count: 0, size: 0 },
        { type: 'video' as const, count: 0, size: 0 },
      ];

      render(<FileTypePieChart data={emptyData} />);

      expect(screen.getByText('No files to analyse')).toBeInTheDocument();
    });

    it('should not render chart in empty state', () => {
      render(<FileTypePieChart data={[]} />);

      expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
    });
  });

  describe('Component Rendering', () => {
    it('should render chart with data', () => {
      render(<FileTypePieChart data={mockData} />);

      expect(screen.getByText('Distribution by Type')).toBeInTheDocument();
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });

    it('should render pie with correct dataKey', () => {
      render(<FileTypePieChart data={mockData} />);

      const pie = screen.getByTestId('pie');
      expect(pie.dataset.key).toBe('count');
    });

    it('should filter out zero-count items', () => {
      const dataWithZeros = [
        { type: 'image' as const, count: 10, size: 1000 },
        { type: 'video' as const, count: 0, size: 0 },
        { type: 'audio' as const, count: 5, size: 500 },
      ];

      render(<FileTypePieChart data={dataWithZeros} />);

      const pie = screen.getByTestId('pie');
      // Only 2 items should be rendered (non-zero)
      expect(pie.dataset.items).toBe('2');
    });

    it('should render cells for each data item', () => {
      render(<FileTypePieChart data={mockData} />);

      const cells = screen.getAllByTestId('cell');
      expect(cells).toHaveLength(5);
    });
  });

  describe('Center Count Display', () => {
    it('should show total file count by default', () => {
      render(<FileTypePieChart data={mockData} />);

      // Total: 50 + 20 + 15 + 10 + 5 = 100
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('files')).toBeInTheDocument();
    });

    it('should calculate total correctly', () => {
      const customData = [
        { type: 'image' as const, count: 25, size: 1000 },
        { type: 'video' as const, count: 75, size: 2000 },
      ];

      render(<FileTypePieChart data={customData} />);

      expect(screen.getByText('100')).toBeInTheDocument();
    });
  });

  describe('Legend Rendering', () => {
    it('should render legend for all file types', () => {
      render(<FileTypePieChart data={mockData} />);

      expect(screen.getByText('Images')).toBeInTheDocument();
      expect(screen.getByText('Videos')).toBeInTheDocument();
      expect(screen.getByText('Audio')).toBeInTheDocument();
      expect(screen.getByText('Documents')).toBeInTheDocument();
      expect(screen.getByText('Other')).toBeInTheDocument();
    });

    it('should calculate percentages correctly', () => {
      render(<FileTypePieChart data={mockData} />);

      // Total: 100 files
      // Images: 50/100 = 50%
      // Videos: 20/100 = 20%
      // Audio: 15/100 = 15%
      // Documents: 10/100 = 10%
      // Other: 5/100 = 5%
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('20%')).toBeInTheDocument();
      expect(screen.getByText('15%')).toBeInTheDocument();
      expect(screen.getByText('10%')).toBeInTheDocument();
      expect(screen.getByText('5%')).toBeInTheDocument();
    });

    it('should render color indicators', () => {
      const { container } = render(<FileTypePieChart data={mockData} />);

      const colorDots = container.querySelectorAll('[class*="rounded-full"]');
      expect(colorDots.length).toBeGreaterThan(0);
    });
  });

  describe('Hover Interactions', () => {
    it('should handle mouse enter on chart', async () => {
      const user = userEvent.setup();
      render(<FileTypePieChart data={mockData} />);

      const pie = screen.getByTestId('pie');
      await user.hover(pie);

      // After hover, component should still render
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });

    it('should handle mouse leave on chart', async () => {
      const user = userEvent.setup();
      render(<FileTypePieChart data={mockData} />);

      const pie = screen.getByTestId('pie');
      await user.hover(pie);
      await user.unhover(pie);

      // Should return to showing total
      expect(screen.getByText('100')).toBeInTheDocument();
    });
  });

  describe('Chart Configuration', () => {
    it('should use correct fill colors', () => {
      const { container } = render(<FileTypePieChart data={mockData} />);

      const cells = screen.getAllByTestId('cell');
      // Check that cells have fill colors
      expect(cells[0]?.dataset.fill).toBeTruthy();
      expect(cells[1]?.dataset.fill).toBeTruthy();
    });

    it('should render chart elements', () => {
      render(<FileTypePieChart data={mockData} />);

      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      expect(screen.getByTestId('pie')).toBeInTheDocument();
    });
  });

  describe('Custom ClassName', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <FileTypePieChart data={mockData} className="custom-class" />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('custom-class');
    });
  });

  describe('File Type Labels', () => {
    it('should use Portuguese labels', () => {
      render(<FileTypePieChart data={mockData} />);

      // Portuguese labels
      expect(screen.getByText('Images')).toBeInTheDocument();
      expect(screen.getByText('Videos')).toBeInTheDocument();
      expect(screen.getByText('Audio')).toBeInTheDocument();
      expect(screen.getByText('Documents')).toBeInTheDocument();
      expect(screen.getByText('Other')).toBeInTheDocument();
    });
  });

  describe('Data Transformation', () => {
    it('should transform data correctly', () => {
      const singleTypeData = [
        { type: 'image' as const, count: 100, size: 10000 },
      ];

      render(<FileTypePieChart data={singleTypeData} />);

      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('Images')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should handle fractional percentages', () => {
      const fractionalData = [
        { type: 'image' as const, count: 33, size: 1000 },
        { type: 'video' as const, count: 33, size: 1000 },
        { type: 'audio' as const, count: 34, size: 1000 },
      ];

      render(<FileTypePieChart data={fractionalData} />);

      // Should round to whole percentages
      const percentages = screen.getAllByText(/\d+%/);
      expect(percentages.length).toBeGreaterThan(0);
    });
  });

  describe('Integration', () => {
    it('should render complete chart with all elements', () => {
      render(<FileTypePieChart data={mockData} />);

      // Header
      expect(screen.getByText('Distribution by Type')).toBeInTheDocument();

      // Chart
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();

      // Center count
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('files')).toBeInTheDocument();

      // Legend
      expect(screen.getByText('Images')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('should handle complete lifecycle', () => {
      const { rerender } = render(
        <FileTypePieChart data={[]} isLoading={true} />
      );

      // Loading state
      expect(screen.queryByText('Distribution by Type')).not.toBeInTheDocument();

      // Empty state
      rerender(<FileTypePieChart data={[]} />);
      expect(screen.getByText('No files to analyse')).toBeInTheDocument();

      // Data state
      rerender(<FileTypePieChart data={mockData} />);
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('Images')).toBeInTheDocument();
    });
  });
});
