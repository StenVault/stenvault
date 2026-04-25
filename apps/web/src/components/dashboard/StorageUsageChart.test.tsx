/**
 * StorageUsageChart Component Tests
 *
 * Tests the storage usage area chart including data rendering,
 * trend calculation, loading states, and custom tooltip.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StorageUsageChart } from './StorageUsageChart';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

// Mock Recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children, data }: any) => (
    <div data-testid="area-chart" data-points={data?.length || 0}>
      {children}
    </div>
  ),
  Area: ({ dataKey }: any) => <div data-testid="area" data-key={dataKey} />,
  XAxis: ({ dataKey }: any) => <div data-testid="x-axis" data-key={dataKey} />,
  YAxis: ({ tickFormatter }: any) => (
    <div data-testid="y-axis" data-formatter={tickFormatter ? 'true' : 'false'} />
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: ({ content }: any) => (
    <div data-testid="tooltip">{content ? 'CustomTooltip' : 'Default'}</div>
  ),
}));

// Mock formatters
vi.mock('@/utils/formatters', () => ({
  formatBytes: vi.fn((bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }),
}));

const mockData = [
  { date: 'Mon', used: 1000000, label: '01 Jan' },
  { date: 'Tue', used: 1200000, label: '02 Jan' },
  { date: 'Wed', used: 1100000, label: '03 Jan' },
  { date: 'Thu', used: 1500000, label: '04 Jan' },
  { date: 'Fri', used: 1800000, label: '05 Jan' },
  { date: 'Sat', used: 2000000, label: '06 Jan' },
  { date: 'Sun', used: 2500000, label: '07 Jan' },
];

describe('StorageUsageChart', () => {
  describe('Loading State', () => {
    it('should render loading skeleton', () => {
      const { container } = render(
        <StorageUsageChart storageQuota={5000000000} isLoading={true} />
      );

      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should not render chart when loading', () => {
      render(<StorageUsageChart storageQuota={5000000000} isLoading={true} />);

      expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
      expect(screen.queryByText('Storage Usage')).not.toBeInTheDocument();
    });
  });

  describe('Component Rendering', () => {
    it('should render chart with data', () => {
      render(<StorageUsageChart data={mockData} storageQuota={5000000000} />);

      expect(screen.getByText('Storage Usage')).toBeInTheDocument();
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('should render chart elements', () => {
      render(<StorageUsageChart data={mockData} storageQuota={5000000000} />);

      expect(screen.getByTestId('area')).toBeInTheDocument();
      expect(screen.getByTestId('x-axis')).toBeInTheDocument();
      expect(screen.getByTestId('y-axis')).toBeInTheDocument();
      expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
      expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    });

    it('should pass data to chart', () => {
      render(<StorageUsageChart data={mockData} storageQuota={5000000000} />);

      const chart = screen.getByTestId('area-chart');
      expect(chart.dataset.points).toBe('7');
    });

    it('should render legend with quota', () => {
      render(<StorageUsageChart data={mockData} storageQuota={5000000000} />);

      expect(screen.getByText(/last 7 days/i)).toBeInTheDocument();
      expect(screen.getByText(/quota:/i)).toBeInTheDocument();
    });
  });

  describe('Trend Calculation', () => {
    it('should show positive trend when usage increases', () => {
      const increasingData = [
        { date: 'Mon', used: 1000000, label: '01 Jan' },
        { date: 'Sun', used: 2000000, label: '07 Jan' },
      ];

      const { container } = render(
        <StorageUsageChart data={increasingData} storageQuota={5000000000} />
      );

      // Trend should be 100% (doubled)
      expect(screen.getByText('100.0%')).toBeInTheDocument();

      // Positive trend = warning token (amber on the trust palette).
      const trendContainer = container.querySelector('[class*="theme-warning"]');
      expect(trendContainer).toBeInTheDocument();
    });

    it('should show negative trend when usage decreases', () => {
      const decreasingData = [
        { date: 'Mon', used: 2000000, label: '01 Jan' },
        { date: 'Sun', used: 1000000, label: '07 Jan' },
      ];

      const { container } = render(
        <StorageUsageChart data={decreasingData} storageQuota={5000000000} />
      );

      // Trend should be -50%
      expect(screen.getByText('50.0%')).toBeInTheDocument();

      // Negative trend = success token (sage on the trust palette).
      const trendContainer = container.querySelector('[class*="theme-success"]');
      expect(trendContainer).toBeInTheDocument();
    });

    it('should show neutral trend when usage stays same', () => {
      const flatData = [
        { date: 'Mon', used: 1000000, label: '01 Jan' },
        { date: 'Sun', used: 1000000, label: '07 Jan' },
      ];

      const { container } = render(
        <StorageUsageChart data={flatData} storageQuota={5000000000} />
      );

      // Trend should be 0%
      expect(screen.getByText('0.0%')).toBeInTheDocument();

      // Should have muted color for neutral trend
      const trendContainer = container.querySelector('[class*="text-foreground-muted"]');
      expect(trendContainer).toBeInTheDocument();
    });

    it('should render 7d label for trend period', () => {
      render(<StorageUsageChart data={mockData} storageQuota={5000000000} />);

      expect(screen.getByText('7d')).toBeInTheDocument();
    });
  });

  describe('Mock Data Generation', () => {
    it('should generate mock data when no data provided', () => {
      render(<StorageUsageChart storageQuota={5000000000} />);

      const chart = screen.getByTestId('area-chart');
      // Should generate 7 days of data
      expect(parseInt(chart.dataset.points || '0')).toBe(7);
    });

    it('should use provided data instead of generating mock', () => {
      const customData = [
        { date: 'Mon', used: 100, label: '01 Jan' },
        { date: 'Tue', used: 200, label: '02 Jan' },
      ];

      render(<StorageUsageChart data={customData} storageQuota={5000000000} />);

      const chart = screen.getByTestId('area-chart');
      expect(chart.dataset.points).toBe('2');
    });
  });

  describe('Chart Configuration', () => {
    it('should configure area with correct dataKey', () => {
      render(<StorageUsageChart data={mockData} storageQuota={5000000000} />);

      const area = screen.getByTestId('area');
      expect(area.dataset.key).toBe('used');
    });

    it('should configure x-axis with date dataKey', () => {
      render(<StorageUsageChart data={mockData} storageQuota={5000000000} />);

      const xAxis = screen.getByTestId('x-axis');
      expect(xAxis.dataset.key).toBe('date');
    });

    it('should configure y-axis with formatter', () => {
      render(<StorageUsageChart data={mockData} storageQuota={5000000000} />);

      const yAxis = screen.getByTestId('y-axis');
      expect(yAxis.dataset.formatter).toBe('true');
    });

    it('should use custom tooltip', () => {
      render(<StorageUsageChart data={mockData} storageQuota={5000000000} />);

      expect(screen.getByText('CustomTooltip')).toBeInTheDocument();
    });
  });

  describe('Custom ClassName', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <StorageUsageChart
          data={mockData}
          storageQuota={5000000000}
          className="custom-class"
        />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('custom-class');
    });
  });

  describe('Storage Quota Display', () => {
    it('should display formatted storage quota', () => {
      render(<StorageUsageChart data={mockData} storageQuota={5000000000} />);

      // 5000000000 bytes = 4.7 GB (using 1024-based units)
      expect(screen.getByText(/4\.7 GB/i)).toBeInTheDocument();
    });

    it('should format different quota sizes', () => {
      const { rerender } = render(
        <StorageUsageChart data={mockData} storageQuota={1024 * 1024} />
      );

      // 1MB quota
      expect(screen.getByText(/1\.0 MB/i)).toBeInTheDocument();

      rerender(<StorageUsageChart data={mockData} storageQuota={1024} />);

      // 1KB quota
      expect(screen.getByText(/1\.0 KB/i)).toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('should render complete chart with all elements', () => {
      render(<StorageUsageChart data={mockData} storageQuota={5000000000} />);

      // Header
      expect(screen.getByText('Storage Usage')).toBeInTheDocument();

      // Trend
      expect(screen.getByText('7d')).toBeInTheDocument();

      // Chart elements
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
      expect(screen.getByTestId('area')).toBeInTheDocument();
      expect(screen.getByTestId('x-axis')).toBeInTheDocument();
      expect(screen.getByTestId('y-axis')).toBeInTheDocument();

      // Legend
      expect(screen.getByText(/last 7 days/i)).toBeInTheDocument();
      expect(screen.getByText(/quota:/i)).toBeInTheDocument();
    });
  });
});
