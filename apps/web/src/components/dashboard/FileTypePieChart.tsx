/**
 * ═══════════════════════════════════════════════════════════════
 * FILE TYPE PIE CHART COMPONENT
 * ═══════════════════════════════════════════════════════════════
 *
 * Donut chart showing file type distribution.
 * Uses Recharts PieChart component.
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Sector,
} from 'recharts';
import {
    FileImage,
    FileVideo,
    FileAudio,
    FileText,
    File,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@stenvault/shared/utils';
import { type FileTypeNoFolder } from '@stenvault/shared';
import { formatBytes } from '@/utils/formatters';
import { useTheme } from '@/contexts/ThemeContext';

// Use FileTypeNoFolder for files (not folders) in chart
type FileType = FileTypeNoFolder;

interface FileTypeData {
    type: FileType;
    count: number;
    size: number;
}

interface FileTypePieChartProps {
    data: FileTypeData[];
    className?: string;
    isLoading?: boolean;
}

interface FileTypeConfig {
    label: string;
    icon: LucideIcon;
}

const fileTypeConfig: Record<FileType, FileTypeConfig> = {
    image: { label: 'Images', icon: FileImage },
    video: { label: 'Videos', icon: FileVideo },
    audio: { label: 'Audio', icon: FileAudio },
    document: { label: 'Documents', icon: FileText },
    other: { label: 'Other', icon: File },
};

const fileTypeChartKey: Record<FileType, 1 | 2 | 3 | 4 | 5> = {
    image: 1,
    video: 2,
    audio: 3,
    document: 4,
    other: 5,
};

// Active shape render for Pie hover
const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;

    return (
        <g>
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius}
                outerRadius={outerRadius + 6}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
                style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' }}
            />
        </g>
    );
};

function ChartSkeleton() {
    return (
        <div className="flex items-center justify-center h-[200px]">
            <div className="w-32 h-32 rounded-full bg-secondary/50 animate-pulse" />
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center h-[200px] text-center">
            <File className="h-10 w-10 text-foreground-muted mb-2" />
            <p className="text-sm text-foreground-muted">
                No files to analyse
            </p>
        </div>
    );
}

export function FileTypePieChart({
    data,
    className,
    isLoading = false,
}: FileTypePieChartProps) {
    const { theme } = useTheme();
    const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

    const chartData = useMemo(() => {
        return data
            .filter(d => d.count > 0)
            .map(d => ({
                ...d,
                name: fileTypeConfig[d.type].label,
                fill: theme.chart[fileTypeChartKey[d.type]],
            }));
    }, [data, theme.chart]);

    const totalFiles = useMemo(() => {
        return data.reduce((sum, d) => sum + d.count, 0);
    }, [data]);

    const totalSize = useMemo(() => {
        return data.reduce((sum, d) => sum + d.size, 0);
    }, [data]);

    if (isLoading) {
        return (
            <div className={cn('space-y-3', className)}>
                <div className="h-5 w-32 bg-secondary rounded animate-pulse" />
                <ChartSkeleton />
            </div>
        );
    }

    if (totalFiles === 0) {
        return (
            <div className={cn('space-y-3', className)}>
                <h4 className="text-sm font-medium text-foreground">
                    Distribution by Type
                </h4>
                <EmptyState />
            </div>
        );
    }

    const activeData = activeIndex !== undefined ? chartData[activeIndex] : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn('space-y-4', className)}
        >
            {/* Header */}
            <h4 className="text-sm font-medium text-foreground">
                Distribution by Type
            </h4>

            {/* Chart with center label */}
            <div className="relative h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="count"
                            activeIndex={activeIndex}
                            activeShape={renderActiveShape}
                            onMouseEnter={(_, index) => setActiveIndex(index)}
                            onMouseLeave={() => setActiveIndex(undefined)}
                            animationDuration={800}
                            animationEasing="ease-out"
                        >
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.fill}
                                    style={{ cursor: 'pointer' }}
                                />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>

                {/* Center content */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <AnimatePresence mode="wait">
                        {activeData ? (
                            <motion.div
                                key={activeData.type}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.15 }}
                                className="text-center"
                            >
                                <p className="text-2xl font-bold text-foreground">
                                    {activeData.count}
                                </p>
                                <p className="text-xs text-foreground-muted">
                                    {activeData.name}
                                </p>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="total"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.15 }}
                                className="text-center"
                            >
                                <p className="text-2xl font-bold text-foreground">
                                    {totalFiles}
                                </p>
                                <p className="text-xs text-foreground-muted">
                                    files
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-2">
                {chartData.map((item) => {
                    const config = fileTypeConfig[item.type as FileType];
                    const Icon = config.icon;
                    const percentage = ((item.count / totalFiles) * 100).toFixed(0);

                    return (
                        <div
                            key={item.type}
                            className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 transition-colors cursor-default"
                            onMouseEnter={() => setActiveIndex(chartData.indexOf(item))}
                            onMouseLeave={() => setActiveIndex(undefined)}
                        >
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: item.fill }}
                            />
                            <span className="text-xs text-foreground-muted flex-1 truncate">
                                {config.label}
                            </span>
                            <span className="text-xs font-medium text-foreground">
                                {percentage}%
                            </span>
                        </div>
                    );
                })}
            </div>
        </motion.div>
    );
}
