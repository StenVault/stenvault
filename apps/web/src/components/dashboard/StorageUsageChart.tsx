/**
 * ═══════════════════════════════════════════════════════════════
 * STORAGE USAGE CHART COMPONENT
 * ═══════════════════════════════════════════════════════════════
 *
 * Area chart showing storage usage over time.
 * Uses Recharts for visualization.
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes as formatFileSize } from '@/utils/formatters';

interface StorageDataPoint {
    date: string;
    used: number;
    label?: string;
}

interface StorageUsageChartProps {
    data?: StorageDataPoint[];
    storageQuota: number;
    className?: string;
    isLoading?: boolean;
}

// Generate mock data based on current usage (simulated history)
function generateMockData(currentUsage: number): StorageDataPoint[] {
    const days = 7;
    const data: StorageDataPoint[] = [];
    const now = new Date();

    // Simulate gradual increase to current usage
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);

        // Simulate random variation with upward trend
        const variation = Math.random() * 0.2 - 0.1; // -10% to +10%
        const dayProgress = (days - i) / days;
        const baseValue = currentUsage * (0.7 + (0.3 * dayProgress));
        const value = Math.max(0, baseValue * (1 + variation));

        data.push({
            date: date.toLocaleDateString(navigator.language, { weekday: 'short' }),
            used: Math.round(value),
            label: date.toLocaleDateString(navigator.language, { day: '2-digit', month: 'short' }),
        });
    }

    // Ensure last point matches current usage
    if (data.length > 0) {
        const lastPoint = data[data.length - 1];
        if (lastPoint) {
            lastPoint.used = currentUsage;
        }
    }

    return data;
}

// Custom tooltip component
function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload || !payload.length) return null;

    return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-xl">
            <p className="text-xs text-foreground-muted mb-1">{payload[0]?.payload?.label || label}</p>
            <p className="text-sm font-semibold text-foreground">
                {formatFileSize(payload[0]?.value || 0)}
            </p>
        </div>
    );
}

function ChartSkeleton() {
    return (
        <div className="h-[200px] animate-pulse">
            <div className="h-full bg-secondary/50 rounded-lg" />
        </div>
    );
}

export function StorageUsageChart({
    data,
    storageQuota,
    className,
    isLoading = false,
}: StorageUsageChartProps) {
    const chartData = useMemo(() => {
        if (data && data.length > 0) return data;
        // Generate mock data if none provided
        const currentUsage = data?.[data.length - 1]?.used || 0;
        return generateMockData(currentUsage);
    }, [data]);

    const trend = useMemo(() => {
        if (chartData.length < 2) return 0;
        const first = chartData[0]!.used;
        const last = chartData[chartData.length - 1]!.used;
        if (first === 0) return 0;
        return ((last - first) / first) * 100;
    }, [chartData]);

    if (isLoading) {
        return (
            <div className={cn('space-y-3', className)}>
                <div className="flex items-center justify-between">
                    <div className="h-5 w-40 bg-secondary rounded animate-pulse" />
                    <div className="h-5 w-20 bg-secondary rounded animate-pulse" />
                </div>
                <ChartSkeleton />
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn('space-y-3', className)}
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-foreground">
                    Storage Usage
                </h4>
                <div className={cn(
                    'flex items-center gap-1 text-xs font-medium',
                    trend > 0 ? 'text-amber-400' : trend < 0 ? 'text-emerald-400' : 'text-foreground-muted'
                )}>
                    {trend > 0 ? (
                        <TrendingUp className="h-3 w-3" />
                    ) : trend < 0 ? (
                        <TrendingDown className="h-3 w-3" />
                    ) : (
                        <Minus className="h-3 w-3" />
                    )}
                    <span>{Math.abs(trend).toFixed(1)}%</span>
                    <span className="text-foreground-muted font-normal">7d</span>
                </div>
            </div>

            {/* Chart */}
            <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={chartData}
                        margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="storageGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="hsl(var(--border))"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="date"
                            tick={{ fill: 'hsl(var(--foreground-muted))', fontSize: 10 }}
                            axisLine={{ stroke: 'hsl(var(--border))' }}
                            tickLine={false}
                        />
                        <YAxis
                            tickFormatter={(value) => formatFileSize(value)}
                            tick={{ fill: 'hsl(var(--foreground-muted))', fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            width={50}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                            type="monotone"
                            dataKey="used"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            fill="url(#storageGradient)"
                            animationDuration={1000}
                            animationEasing="ease-out"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Legend */}
            <p className="text-xs text-foreground-muted text-center">
                Last 7 days • Quota: {formatFileSize(storageQuota)}
            </p>
        </motion.div>
    );
}
