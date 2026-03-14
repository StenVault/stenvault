import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { AuroraCard } from '@/components/ui/aurora-card';
import { motion } from 'framer-motion';
import {
    RadialBarChart,
    RadialBar,
    ResponsiveContainer,
    Tooltip
} from 'recharts';
import { formatBytes } from '@/lib/utils';
import {
    FileImage,
    FileVideo,
    FileAudio,
    FileText,
    FileBox,
    HardDrive
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Skeleton } from '@/components/ui/skeleton';

export function StorageAnalytics() {
    const { theme } = useTheme();

    // Fetch distribution data
    const { data: distribution, isLoading: isDistLoading } = trpc.files.getStorageDistribution.useQuery();
    const { data: stats, isLoading: isStatsLoading } = trpc.files.getStorageStats.useQuery();

    const isLoading = isDistLoading || isStatsLoading;

    // Process data for charts
    const chartData = useMemo(() => {
        if (!distribution || !stats) return [];

        const totalUsed = stats.storageUsed;
        const quota = stats.storageQuota;

        // Calculate percentages relative to TOTAL QUOTA (for radial chart)
        // We want the bars to represent how much of the quota each type takes

        return [
            {
                name: 'Images',
                value: distribution.image.size,
                fill: theme.chart[1],
                icon: FileImage,
                count: distribution.image.count
            },
            {
                name: 'Videos',
                value: distribution.video.size,
                fill: theme.chart[2],
                icon: FileVideo,
                count: distribution.video.count
            },
            {
                name: 'Audio',
                value: distribution.audio.size,
                fill: theme.chart[3],
                icon: FileAudio,
                count: distribution.audio.count
            },
            {
                name: 'Documents',
                value: distribution.document.size,
                fill: theme.chart[4],
                icon: FileText,
                count: distribution.document.count
            },
            {
                name: 'Other',
                value: distribution.other.size,
                fill: theme.chart[5],
                icon: FileBox,
                count: distribution.other.count
            }
        ].sort((a, b) => b.value - a.value); // Sort by size desc
    }, [distribution, stats, theme.chart]);

    if (isLoading) {
        return (
            <AuroraCard className="p-6 h-[400px] flex items-center justify-center">
                <div className="flex flex-col gap-4 w-full">
                    <div className="flex justify-between">
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-8 w-24" />
                    </div>
                    <div className="flex gap-8 mt-4">
                        <Skeleton className="h-64 w-64 rounded-full" />
                        <div className="flex-1 space-y-4">
                            {[1, 2, 3, 4, 5].map(i => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    </div>
                </div>
            </AuroraCard>
        );
    }

    if (!distribution || !stats) return null;

    const totalUsed = stats.storageUsed;
    const totalQuota = stats.storageQuota;
    const percentTotal = Math.round((totalUsed / totalQuota) * 100);

    // Custom Tooltip for Recharts
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-background/90 backdrop-blur-md border border-border p-3 rounded-lg shadow-xl">
                    <p className="font-medium text-foreground">{data.name}</p>
                    <p className="text-sm text-muted-foreground">
                        {formatBytes(data.value)} ({data.count} files)
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <AuroraCard className="p-6 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-3 opacity-10">
                <HardDrive className="w-32 h-32" />
            </div>

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-xl font-semibold tracking-tight">Storage Analytics</h3>
                        <p className="text-muted-foreground text-sm">Space distribution by file type</p>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-primary">
                            {formatBytes(totalUsed)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            of {formatBytes(totalQuota)} used ({percentTotal}%)
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    {/* Left: Chart */}
                    <div className="h-[250px] w-full flex items-center justify-center relative">
                        {/* Center Text Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                            <span className="text-4xl font-bold tracking-tighter text-foreground/80">
                                {percentTotal}%
                            </span>
                            <span className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Used</span>
                        </div>

                        <ResponsiveContainer width="100%" height="100%">
                            <RadialBarChart
                                cx="50%"
                                cy="50%"
                                innerRadius="60%"
                                outerRadius="100%"
                                barSize={20}
                                data={chartData}
                                startAngle={90}
                                endAngle={450}
                            >
                                <RadialBar
                                    background={{ fill: 'rgba(255,255,255,0.05)' }}
                                    dataKey="value"
                                    cornerRadius={10}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                            </RadialBarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Right: Legend & List */}
                    <div className="space-y-3">
                        {chartData?.map((item, index) => (
                            <motion.div
                                key={item.name}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="flex items-center justify-between group p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-default"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-md" style={{ backgroundColor: `${item.fill}1a` }}>
                                        <item.icon className="w-4 h-4" style={{ color: item.fill }} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium">{item.name}</span>
                                        <div className="flex items-center gap-2">
                                            {/* Minimal progress bar for this item relative to total used */}
                                            <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{
                                                        width: `${(item.value / (totalUsed || 1)) * 100}%`,
                                                        backgroundColor: item.fill
                                                    }}
                                                />
                                            </div>
                                            <span className="text-xs text-muted-foreground">{item.count} files</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-sm font-semibold tabular-nums text-right">
                                    {formatBytes(item.value)}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </AuroraCard>
    );
}

// Add metricsAvailable helper
const metricsAvailable = true;
